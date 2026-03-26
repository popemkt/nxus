import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { CaretRight, ArrowClockwise } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { getBacklinksServerFn } from '@/services/outline.server'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { getSupertagColor } from '@/lib/supertag-colors'
import { Bullet } from './bullet'
import { SupertagPill } from './supertag-pill'

interface BacklinkNode {
  id: string
  content: string
  childCount: number
  supertags: { id: string; content: string; systemId: string | null }[]
}

interface BacklinkGroup {
  fieldName: string
  nodes: BacklinkNode[]
}

interface BacklinksSectionProps {
  nodeId: string
}

export function BacklinksSection({ nodeId }: BacklinksSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const navigateToNode = useNavigateToNode()

  const { data, isLoading } = useQuery({
    queryKey: ['backlinks', nodeId],
    queryFn: () => getBacklinksServerFn({ data: { nodeId } }),
    staleTime: 30_000,
  })

  const groups: BacklinkGroup[] = data?.success ? data.groups : []
  const totalCount = data?.success ? data.totalCount : 0
  const hasError = data && !data.success

  return (
    <div className="mt-3 mb-1">
      <button
        type="button"
        className={cn(
          'flex items-center gap-1 px-1 py-0.5',
          'text-[12px] text-foreground/30 uppercase tracking-wide',
          'cursor-pointer hover:text-foreground/45 transition-colors',
        )}
        onClick={() => setCollapsed((c) => !c)}
      >
        <CaretRight
          size={10}
          weight="bold"
          className={cn('transition-transform', !collapsed && 'rotate-90')}
        />
        References
        {isLoading ? (
          <ArrowClockwise size={10} className="animate-spin ml-0.5" />
        ) : (
          <span className="text-foreground/20 ml-0.5">({totalCount})</span>
        )}
      </button>

      {!collapsed && (
        <div className="mt-0.5">
          {hasError && (
            <div className="pl-4 py-1 text-[11px] text-foreground/25">References unavailable</div>
          )}
          {!isLoading && !hasError && totalCount === 0 && (
            <div className="pl-4 py-1 text-[11px] text-foreground/20 italic">No references</div>
          )}
          {groups.map((group) => (
            <FieldGroup
              key={group.fieldName}
              group={group}
              navigateToNode={navigateToNode}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function FieldGroup({
  group,
  navigateToNode,
}: {
  group: BacklinkGroup
  navigateToNode: (nodeId: string) => void
}) {
  const [expanded, setExpanded] = useState(true)
  const INITIAL_SHOW = 3
  const [showAll, setShowAll] = useState(false)

  const visibleNodes = showAll ? group.nodes : group.nodes.slice(0, INITIAL_SHOW)
  const hasMore = group.nodes.length > INITIAL_SHOW

  return (
    <div className="mb-1">
      {/* Field group header: "Appears as [fieldName] in..." */}
      <button
        type="button"
        className={cn(
          'flex items-center gap-1 pl-2 py-0.5',
          'text-[11px] text-foreground/25',
          'cursor-pointer hover:text-foreground/40 transition-colors',
        )}
        onClick={() => setExpanded((e) => !e)}
      >
        <CaretRight
          size={8}
          weight="bold"
          className={cn('transition-transform', expanded && 'rotate-90')}
        />
        <span>
          Appears as <span className="font-medium text-foreground/35">{group.fieldName}</span> in…
        </span>
      </button>

      {expanded && (
        <>
          {visibleNodes.map((node) => (
            <ReferenceNodeRow
              key={node.id}
              node={node}
              navigateToNode={navigateToNode}
            />
          ))}

          {/* "Show N more" toggle */}
          {hasMore && !showAll && (
            <button
              type="button"
              className="pl-10 py-0.5 text-[11px] text-foreground/25 hover:text-foreground/40 transition-colors cursor-pointer"
              onClick={() => setShowAll(true)}
            >
              Show {group.nodes.length - INITIAL_SHOW} more
            </button>
          )}
          {hasMore && showAll && (
            <button
              type="button"
              className="pl-10 py-0.5 text-[11px] text-foreground/25 hover:text-foreground/40 transition-colors cursor-pointer"
              onClick={() => setShowAll(false)}
            >
              Show less
            </button>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Renders a backlink reference as a full node row — same look as a real node
 * but with a dashed-circle bullet. Clicking navigates to the node.
 */
function ReferenceNodeRow({
  node,
  navigateToNode,
}: {
  node: BacklinkNode
  navigateToNode: (nodeId: string) => void
}) {
  const primaryTagColor = node.supertags[0]
    ? getSupertagColor(node.supertags[0].id)
    : null

  return (
    <div
      className={cn(
        'flex items-start rounded-sm cursor-pointer',
        'hover:bg-foreground/[0.03] transition-colors duration-75',
        'pl-4',
      )}
      onClick={() => navigateToNode(node.id)}
      title={`Go to: ${node.content || 'Untitled'}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigateToNode(node.id)
      }}
    >
      {/* Dashed-circle bullet — uses Bullet component with isReference */}
      <Bullet
        hasChildren={node.childCount > 0}
        collapsed={true}
        childCount={node.childCount}
        tagColor={primaryTagColor}
        isSupertag={false}
        isReference={true}
        onClick={(e) => {
          e.stopPropagation()
          navigateToNode(node.id)
        }}
      />

      {/* Content + supertag badges — same layout as NodeContent */}
      <div className="node-content flex min-h-6 flex-1 items-start gap-1.5 px-1">
        <span className="text-[14.5px] leading-[1.6] text-foreground/70 truncate flex-1">
          {node.content || '\u200B'}
        </span>

        {node.supertags.length > 0 && (
          <div className="flex h-6 items-center gap-0.5">
            {node.supertags.map((tag) => (
              <SupertagPill key={tag.id} tag={tag} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
