import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Hash, CaretRight } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { QueryDefinition } from '@nxus/db'
import { evaluateQueryServerFn } from '@/services/outline.server'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { getSupertagColor } from '@/lib/supertag-colors'

interface BacklinkNode {
  id: string
  content: string
  supertags: { id: string; content: string; systemId: string | null }[]
}

interface BacklinksSectionProps {
  nodeId: string
}

export function BacklinksSection({ nodeId }: BacklinksSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const navigateToNode = useNavigateToNode()

  const definition: QueryDefinition = {
    filters: [{ type: 'relation', relationType: 'linksTo', targetNodeId: nodeId }],
    limit: 50,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['backlinks', nodeId],
    queryFn: () => evaluateQueryServerFn({ data: { definition } }),
    staleTime: 30_000,
  })

  const results: BacklinkNode[] = data?.success ? data.nodes : []

  if (isLoading || results.length === 0) return null

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
        References ({results.length})
      </button>

      {!collapsed && (
        <div className="mt-0.5">
          {results.map((node) => {
            const primaryColor = node.supertags[0]
              ? getSupertagColor(node.supertags[0].id)
              : null

            return (
              <button
                key={node.id}
                type="button"
                className={cn(
                  'flex w-full items-start rounded-sm cursor-pointer text-left',
                  'hover:bg-foreground/[0.03] transition-colors duration-75',
                  'pl-1',
                )}
                onClick={() => navigateToNode(node.id)}
                title={`Go to: ${node.content || 'Untitled'}`}
              >
                {/* Dashed-circle reference bullet */}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center">
                  <span
                    className={cn(
                      'flex items-center justify-center rounded-full',
                      'h-[18px] w-[18px] border border-dashed',
                      !primaryColor && 'border-foreground/20',
                    )}
                    style={primaryColor ? { borderColor: `${primaryColor}40` } : undefined}
                  >
                    <span
                      className={cn(
                        'block h-[4px] w-[4px] rounded-full',
                        !primaryColor && 'bg-foreground/40',
                      )}
                      style={primaryColor ? { backgroundColor: primaryColor } : undefined}
                    />
                  </span>
                </span>

                {/* Content + badges */}
                <span className="flex min-h-6 flex-1 items-start gap-1.5 px-1">
                  <span className="text-[14.5px] leading-[1.6] text-foreground/70 truncate">
                    {node.content || '\u200B'}
                  </span>

                  {node.supertags.length > 0 && (
                    <span className="flex h-6 items-center gap-0.5">
                      {node.supertags.map((tag) => {
                        const color = getSupertagColor(tag.id)
                        return (
                          <span
                            key={tag.id}
                            className={cn(
                              'inline-flex items-center gap-0.5 rounded-sm px-1.5 py-px',
                              'text-[11px] font-medium leading-[1.8]',
                              'select-none whitespace-nowrap',
                            )}
                            style={{ backgroundColor: `${color}18`, color }}
                          >
                            <Hash size={10} weight="bold" className="shrink-0 opacity-60" />
                            {tag.content}
                          </span>
                        )
                      })}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
