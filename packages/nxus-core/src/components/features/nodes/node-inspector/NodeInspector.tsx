/**
 * NodeInspector - Deep visualization of an AssembledNode
 *
 * Features:
 * - Materialized properties with type-aware rendering
 * - Supertag badges
 * - Outgoing relationships (node references)
 * - Incoming backlinks
 * - Navigation breadcrumbs
 * - Clickable links to navigate between nodes
 * - Inline content editing (double-click header)
 */

import { cn } from '@/lib/utils'
import type { AssembledNode } from '@/services/nodes/node.service'
import {
  getNodeServerFn,
  updateNodeContentServerFn,
} from '@/services/nodes/nodes.server'
import {
  getBacklinksServerFn,
  getChildNodesServerFn,
  getOwnerChainServerFn,
} from '@/services/nodes/search-nodes.server'
import {
  ArrowBendUpLeft,
  ArrowSquareOut,
  BracketsCurly,
  CaretDown,
  CaretRight,
  Clock,
  Code,
  Cube,
  Fingerprint,
  Hash,
  LinkSimple,
  List,
  PencilSimple,
  ToggleRight,
} from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'

export interface NodeInspectorProps {
  node: AssembledNode
  onNavigate: (nodeId: string) => void
  onNodeUpdated?: (node: AssembledNode) => void
}

export function NodeInspector({
  node,
  onNavigate,
  onNodeUpdated,
}: NodeInspectorProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['properties', 'supertags']),
  )
  const [isEditing, setIsEditing] = useState(false)
  const [editContent, setEditContent] = useState(node.content || '')
  const inputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  // Update edit content when node changes
  useEffect(() => {
    setEditContent(node.content || '')
  }, [node.content])

  // Focus input when editing starts
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Mutation for updating node content
  const updateMutation = useMutation({
    mutationFn: async (content: string) => {
      return updateNodeContentServerFn({
        data: { nodeId: node.id, content },
      })
    },
    onSuccess: (result) => {
      if (result.success && result.node) {
        queryClient.invalidateQueries({ queryKey: ['nodes'] })
        onNodeUpdated?.(result.node)
      }
    },
  })

  const handleSave = () => {
    if (editContent !== node.content) {
      updateMutation.mutate(editContent)
    }
    setIsEditing(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave()
    } else if (e.key === 'Escape') {
      setEditContent(node.content || '')
      setIsEditing(false)
    }
  }

  // Fetch backlinks for this node
  const { data: backlinksResult } = useQuery({
    queryKey: ['backlinks', node.id],
    queryFn: () => getBacklinksServerFn({ data: { nodeId: node.id } }),
    staleTime: 30000,
  })

  const backlinks: AssembledNode[] = backlinksResult?.success
    ? backlinksResult.backlinks
    : []

  // Fetch owner chain for breadcrumbs
  const { data: ownerChainResult } = useQuery({
    queryKey: ['ownerChain', node.id],
    queryFn: () => getOwnerChainServerFn({ data: { nodeId: node.id } }),
    staleTime: 30000,
    enabled: !!node.ownerId, // Only fetch if node has an owner
  })

  const ownerChain: Array<{
    id: string
    content: string | null
    systemId: string | null
  }> = ownerChainResult?.success ? ownerChainResult.chain : []

  // Fetch child nodes (nodes where ownerId === this node)
  const { data: childNodesResult } = useQuery({
    queryKey: ['childNodes', node.id],
    queryFn: () =>
      getChildNodesServerFn({
        data: { parentId: node.id },
      }),
    staleTime: 30000,
  })

  const childNodes: AssembledNode[] = childNodesResult?.success
    ? childNodesResult.children
    : []

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  // Extract node references from properties
  const nodeReferences: Array<{
    fieldName: string
    nodeId: string
    fieldSystemId: string | null
  }> = []

  for (const [fieldName, values] of Object.entries(node.properties)) {
    for (const pv of values) {
      const value = pv.value
      // Check if value looks like a UUID (node reference)
      if (
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        )
      ) {
        nodeReferences.push({
          fieldName,
          nodeId: value,
          fieldSystemId: pv.fieldSystemId,
        })
      } else if (Array.isArray(value)) {
        for (const v of value) {
          if (
            typeof v === 'string' &&
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              v,
            )
          ) {
            nodeReferences.push({
              fieldName,
              nodeId: v,
              fieldSystemId: pv.fieldSystemId,
            })
          }
        }
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-card/50">
        {/* Breadcrumbs */}
        {ownerChain.length > 1 && (
          <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground overflow-x-auto">
            {ownerChain.slice(0, -1).map((item, idx) => (
              <span key={item.id} className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => onNavigate(item.id)}
                  className="hover:text-primary hover:underline truncate max-w-[120px]"
                  title={item.content || item.systemId || item.id}
                >
                  {item.content || item.systemId || item.id.slice(0, 8)}
                </button>
                {idx < ownerChain.length - 2 && (
                  <CaretRight className="size-3 shrink-0" />
                )}
              </span>
            ))}
          </div>
        )}
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-full text-lg font-semibold bg-muted/50 border border-primary rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        ) : (
          <h2
            className="text-lg font-semibold truncate flex items-center gap-2 group cursor-pointer"
            onDoubleClick={() => !node.systemId && setIsEditing(true)}
          >
            {node.content || (
              <span className="text-muted-foreground italic">(no content)</span>
            )}
            {!node.systemId && (
              <button
                onClick={() => setIsEditing(true)}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
                title="Edit content"
              >
                <PencilSimple className="size-4" />
              </button>
            )}
            {updateMutation.isPending && (
              <span className="text-xs text-muted-foreground">Saving...</span>
            )}
          </h2>
        )}
        {node.systemId && (
          <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground font-mono">
            <Fingerprint className="size-3" />
            {node.systemId}
          </div>
        )}
        <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground font-mono">
          <Code className="size-3" />
          <span className="truncate">{node.id}</span>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto pt-2">
        {/* Supertags Section */}
        <Section
          title="Supertags"
          icon={<Hash className="size-3.5" />}
          count={node.supertags.length}
          expanded={expandedSections.has('supertags')}
          onToggle={() => toggleSection('supertags')}
        >
          {node.supertags.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              No supertags
            </div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {node.supertags.map((st) => (
                <button
                  key={st.id}
                  onClick={() => onNavigate(st.id)}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary text-xs rounded-md hover:bg-primary/20 transition-colors"
                >
                  <Hash className="size-3" />
                  {st.content}
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Properties Section */}
        <Section
          title="Properties"
          icon={<Code className="size-3.5" />}
          count={Object.keys(node.properties).length}
          expanded={expandedSections.has('properties')}
          onToggle={() => toggleSection('properties')}
        >
          {Object.keys(node.properties).length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              No properties
            </div>
          ) : (
            <div className="space-y-2">
              {Object.entries(node.properties).map(([fieldName, values]) => (
                <PropertyRow
                  key={fieldName}
                  fieldName={fieldName}
                  values={values}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Outgoing References Section */}
        <Section
          title="Outgoing References"
          icon={<ArrowSquareOut className="size-3.5" />}
          count={nodeReferences.length}
          expanded={expandedSections.has('outgoing')}
          onToggle={() => toggleSection('outgoing')}
        >
          {nodeReferences.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              No outgoing references
            </div>
          ) : (
            <div className="space-y-1">
              {nodeReferences.map((ref, idx) => (
                <OutgoingRefLink
                  key={`${ref.fieldName}-${ref.nodeId}-${idx}`}
                  fieldName={ref.fieldName}
                  nodeId={ref.nodeId}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Children Section (nodes owned by this node) */}
        <Section
          title="Children"
          icon={<Cube className="size-3.5" />}
          count={childNodes.length}
          expanded={expandedSections.has('children')}
          onToggle={() => toggleSection('children')}
        >
          {childNodes.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              No children
            </div>
          ) : (
            <div className="space-y-1">
              {childNodes.map((child) => (
                <button
                  key={child.id}
                  onClick={() => onNavigate(child.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted transition-colors text-left group"
                >
                  <Cube className="size-3 text-muted-foreground" />
                  <span className="truncate group-hover:underline">
                    {child.content || child.systemId || child.id.slice(0, 8)}
                  </span>
                  {child.supertags.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-primary/70 ml-auto shrink-0">
                      <Hash className="size-2.5" />
                      {child.supertags[0].content}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Backlinks Section */}
        <Section
          title="Backlinks (Referenced By)"
          icon={<ArrowBendUpLeft className="size-3.5" />}
          count={backlinks.length}
          expanded={expandedSections.has('backlinks')}
          onToggle={() => toggleSection('backlinks')}
        >
          {backlinks.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              No backlinks
            </div>
          ) : (
            <div className="space-y-1">
              {backlinks.map((bl) => (
                <button
                  key={bl.id}
                  onClick={() => onNavigate(bl.id)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted transition-colors text-left group"
                >
                  <Cube className="size-3 text-muted-foreground" />
                  <span className="truncate group-hover:underline">
                    {bl.content || bl.systemId || bl.id.slice(0, 8)}
                  </span>
                  {bl.supertags.length > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-primary/70 ml-auto shrink-0">
                      <Hash className="size-2.5" />
                      {bl.supertags[0].content}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
        </Section>

        {/* Metadata Section */}
        <Section
          title="Metadata"
          icon={<Clock className="size-3.5" />}
          expanded={expandedSections.has('metadata')}
          onToggle={() => toggleSection('metadata')}
        >
          <div className="space-y-1.5 text-xs">
            <MetaRow label="Created" value={formatDate(node.createdAt)} />
            <MetaRow label="Updated" value={formatDate(node.updatedAt)} />
            {node.deletedAt && (
              <MetaRow
                label="Deleted"
                value={formatDate(node.deletedAt)}
                className="text-destructive"
              />
            )}
            {node.ownerId && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-16">Owner:</span>
                <button
                  onClick={() => onNavigate(node.ownerId!)}
                  className="text-primary hover:underline font-mono"
                >
                  {node.ownerId.slice(0, 8)}...
                </button>
              </div>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}

// Section component for collapsible areas
function Section({
  title,
  icon,
  count,
  expanded,
  onToggle,
  children,
}: {
  title: string
  icon: React.ReactNode
  count?: number
  expanded: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <CaretDown className="size-3 text-muted-foreground" />
        ) : (
          <CaretRight className="size-3 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium">{title}</span>
        {count !== undefined && (
          <span className="text-xs text-muted-foreground ml-auto">{count}</span>
        )}
      </button>
      {expanded && <div className="px-4 pt-2 pb-4">{children}</div>}
    </div>
  )
}

// Property row with smart value rendering
function PropertyRow({
  fieldName,
  values,
  onNavigate,
}: {
  fieldName: string
  values: Array<{
    value: unknown
    rawValue: string
    fieldSystemId: string | null
    fieldNodeId: string
  }>
  onNavigate: (nodeId: string) => void
}) {
  // Get fieldNodeId from the first value (all values share the same field)
  const fieldNodeId = values[0]?.fieldNodeId

  return (
    <div className="text-xs">
      <button
        onClick={() => fieldNodeId && onNavigate(fieldNodeId)}
        className="font-medium text-muted-foreground mb-1 hover:text-primary hover:underline transition-colors flex items-center gap-1"
        title="Navigate to field definition"
      >
        <Code className="size-3" />
        {fieldName}
      </button>
      <div className="pl-2 space-y-0.5">
        {values.map((pv, idx) => (
          <PropertyValue
            key={idx}
            value={pv.value}
            rawValue={pv.rawValue}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </div>
  )
}

// Node link component - renders node reference as "Name #Supertag" like Tana
function NodeLink({
  nodeId,
  onNavigate,
}: {
  nodeId: string
  onNavigate: (nodeId: string) => void
}) {
  const { data: nodeResult } = useQuery({
    queryKey: ['node', nodeId],
    queryFn: () => getNodeServerFn({ data: { identifier: nodeId } }),
    staleTime: 60000,
  })

  const linkedNode = nodeResult?.success ? nodeResult.node : null
  const displayName =
    linkedNode?.content || linkedNode?.systemId || nodeId.slice(0, 8)
  const supertag = linkedNode?.supertags?.[0]

  return (
    <button
      onClick={() => onNavigate(nodeId)}
      className="text-primary hover:underline flex items-center gap-1.5 group"
    >
      <LinkSimple className="size-3 opacity-60 group-hover:opacity-100" />
      <span className="truncate max-w-[180px]">{displayName}</span>
      {supertag && (
        <span className="text-muted-foreground text-[10px] shrink-0">
          #{supertag.content}
        </span>
      )}
    </button>
  )
}

// Outgoing reference link - renders field name + node content + supertag
function OutgoingRefLink({
  fieldName,
  nodeId,
  onNavigate,
}: {
  fieldName: string
  nodeId: string
  onNavigate: (nodeId: string) => void
}) {
  const { data: nodeResult } = useQuery({
    queryKey: ['node', nodeId],
    queryFn: () => getNodeServerFn({ data: { identifier: nodeId } }),
    staleTime: 60000,
  })

  const linkedNode = nodeResult?.success ? nodeResult.node : null
  const displayName =
    linkedNode?.content || linkedNode?.systemId || nodeId.slice(0, 8)
  const supertag = linkedNode?.supertags?.[0]

  return (
    <button
      onClick={() => onNavigate(nodeId)}
      className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted transition-colors text-left group"
    >
      <Cube className="size-3 text-muted-foreground" />
      <span className="text-muted-foreground shrink-0">{fieldName}:</span>
      <span className="truncate group-hover:underline">{displayName}</span>
      {supertag && (
        <span className="inline-flex items-center gap-0.5 text-primary/70 ml-auto shrink-0">
          <Hash className="size-2.5" />
          {supertag.content}
        </span>
      )}
    </button>
  )
}

// Smart property value renderer with type icons
function PropertyValue({
  value,
  // rawValue kept in signature for future use (e.g., showing raw JSON)
  rawValue: _rawValue,
  onNavigate,
}: {
  value: unknown
  rawValue: string
  onNavigate: (nodeId: string) => void
}) {
  // UUID detection for node links
  if (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    return (
      <div className="flex items-center gap-1.5">
        <LinkSimple className="size-3 text-blue-400 shrink-0" />
        <NodeLink nodeId={value} onNavigate={onNavigate} />
      </div>
    )
  }

  // Array of values
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return (
        <div className="flex items-center gap-1.5">
          <List className="size-3 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground italic">[]</span>
        </div>
      )
    }

    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <List className="size-3 shrink-0" />
          <span className="text-[10px]">{value.length} items</span>
        </div>
        <div className="pl-4 space-y-0.5">
          {value.map((v, idx) => (
            <PropertyValue
              key={idx}
              value={v}
              rawValue={JSON.stringify(v)}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    )
  }

  // Object (JSON)
  if (typeof value === 'object' && value !== null) {
    return (
      <div>
        <div className="flex items-center gap-1.5 text-muted-foreground mb-1">
          <BracketsCurly className="size-3 shrink-0" />
          <span className="text-[10px]">JSON</span>
        </div>
        <pre className="bg-muted/50 p-2 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(value, null, 2)}
        </pre>
      </div>
    )
  }

  // Boolean
  if (typeof value === 'boolean') {
    return (
      <div className="flex items-center gap-1.5">
        <ToggleRight className="size-3 text-purple-400 shrink-0" />
        <span
          className={cn('font-mono', value ? 'text-green-500' : 'text-red-500')}
        >
          {String(value)}
        </span>
      </div>
    )
  }

  // Number
  if (typeof value === 'number') {
    return (
      <div className="flex items-center gap-1.5">
        <Hash className="size-3 text-amber-400 shrink-0" />
        <span className="font-mono text-amber-500">{value}</span>
      </div>
    )
  }

  // String or other
  return <span className="break-all">{String(value)}</span>
}

// Helper for metadata rows
function MetaRow({
  label,
  value,
  className,
}: {
  label: string
  value: string
  className?: string
}) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <span className="text-muted-foreground w-16">{label}:</span>
      <span>{value}</span>
    </div>
  )
}

// Format date for display
function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date))
}
