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
 */

import { cn } from '@nxus/ui'
import type { AssembledNode } from '@nxus/db'
import { getBacklinksServerFn } from '@/services/nodes/search-nodes.server'
import {
  ArrowBendUpLeft,
  ArrowsLeftRight,
  ArrowSquareOut,
  CaretDown,
  CaretRight,
  Clock,
  Code,
  Fingerprint,
  Hash,
  LinkSimple,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

interface NodeInspectorProps {
  node: AssembledNode
  onNavigate: (nodeId: string) => void
}

export function NodeInspector({ node, onNavigate }: NodeInspectorProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['properties', 'supertags']),
  )

  // Fetch backlinks for this node
  const { data: backlinksResult } = useQuery({
    queryKey: ['backlinks', node.id],
    queryFn: () => getBacklinksServerFn({ nodeId: node.id }),
    staleTime: 30000,
  })

  const backlinks = backlinksResult?.success ? backlinksResult.backlinks : []

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
        <h2 className="text-lg font-semibold truncate">
          {node.content || (
            <span className="text-muted-foreground italic">(no content)</span>
          )}
        </h2>
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
      <div className="flex-1 overflow-y-auto">
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
                <button
                  key={`${ref.fieldName}-${ref.nodeId}-${idx}`}
                  onClick={() => onNavigate(ref.nodeId)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted transition-colors text-left group"
                >
                  <LinkSimple className="size-3 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    {ref.fieldName}:
                  </span>
                  <span className="font-mono text-primary truncate group-hover:underline">
                    {ref.nodeId.slice(0, 8)}...
                  </span>
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
                  <ArrowsLeftRight className="size-3 text-muted-foreground" />
                  <span className="truncate group-hover:underline">
                    {bl.content || bl.systemId || bl.id.slice(0, 8)}
                  </span>
                  {bl.supertags.length > 0 && (
                    <span className="text-muted-foreground ml-auto shrink-0">
                      #{bl.supertags[0].content}
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
      {expanded && <div className="px-4 pb-4">{children}</div>}
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
  }>
  onNavigate: (nodeId: string) => void
}) {
  return (
    <div className="text-xs">
      <div className="font-medium text-muted-foreground mb-1">{fieldName}</div>
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

// Smart property value renderer
function PropertyValue({
  value,
  rawValue,
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
      <button
        onClick={() => onNavigate(value)}
        className="text-primary hover:underline font-mono flex items-center gap-1"
      >
        <LinkSimple className="size-3" />
        {value.slice(0, 8)}...
      </button>
    )
  }

  // Array of values
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground italic">[]</span>
    }

    return (
      <div className="space-y-0.5">
        {value.map((v, idx) => (
          <PropertyValue
            key={idx}
            value={v}
            rawValue={JSON.stringify(v)}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    )
  }

  // Object (JSON)
  if (typeof value === 'object' && value !== null) {
    return (
      <pre className="bg-muted/50 p-2 rounded text-xs font-mono overflow-x-auto whitespace-pre-wrap break-all">
        {JSON.stringify(value, null, 2)}
      </pre>
    )
  }

  // Boolean
  if (typeof value === 'boolean') {
    return (
      <span
        className={cn('font-mono', value ? 'text-green-500' : 'text-red-500')}
      >
        {String(value)}
      </span>
    )
  }

  // Number
  if (typeof value === 'number') {
    return <span className="font-mono text-amber-500">{value}</span>
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
