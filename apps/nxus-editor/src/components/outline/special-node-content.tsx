import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Database, Hash, SpinnerGap } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { QueryDefinition } from '@nxus/db'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import {
  formatQueryDefinition,
  getQuerySpecial,
} from '@/lib/outline-specials'
import { executeQueryNodeServerFn } from '@/services/outline.server'
import type { OutlineNode } from '@/types/outline'

interface SpecialNodeContentProps {
  node: OutlineNode
  depth: number
}

type QueryResultNode = {
  id: string
  content: string | null
  systemId: string | null
  supertags: Array<{
    id: string
    name: string
    color: string | null
    systemId: string | null
  }>
}

export function SpecialNodeContent({
  node,
  depth,
}: SpecialNodeContentProps) {
  const querySpecial = getQuerySpecial(node)

  if (querySpecial) {
    return (
      <QuerySpecialContent
        nodeId={node.id}
        definition={querySpecial.definition}
        depth={depth}
      />
    )
  }

  return null
}

function QuerySpecialContent({
  nodeId,
  definition,
  depth,
}: {
  nodeId: string
  definition: QueryDefinition
  depth: number
}) {
  const navigateToNode = useNavigateToNode()
  const summary = useMemo(
    () => formatQueryDefinition(definition),
    [definition],
  )

  const query = useQuery({
    queryKey: ['outline-special', 'query', nodeId, definition],
    queryFn: async () => {
      const result = await executeQueryNodeServerFn({ data: { nodeId } })
      if (!result.success) {
        throw new Error(result.error)
      }
      return {
        nodes: result.nodes as QueryResultNode[],
        totalCount: result.totalCount,
      }
    },
    staleTime: 0,
  })

  return (
    <div
      className="special-node-content py-1"
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
    >
      <div
        className={cn(
          'rounded-md border border-foreground/10 bg-foreground/[0.025]',
          'px-3 py-2',
        )}
      >
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-foreground/35">
          <Database size={12} weight="bold" />
          <span>Query</span>
          <span className="text-foreground/20">·</span>
          <span>{query.data?.totalCount ?? 0} results</span>
        </div>

        <div className="mt-1 font-mono text-[12px] leading-5 text-foreground/55">
          {summary}
        </div>

        {query.isLoading ? (
          <div className="mt-2 flex items-center gap-2 text-[12px] text-foreground/35">
            <SpinnerGap size={14} className="animate-spin" />
            Running query…
          </div>
        ) : query.isError ? (
          <div className="mt-2 text-[12px] text-red-400">
            {query.error instanceof Error ? query.error.message : 'Failed to run query'}
          </div>
        ) : query.data && query.data.nodes.length > 0 ? (
          <div className="mt-2 space-y-1">
            {query.data.nodes.map((resultNode) => (
              <button
                key={resultNode.id}
                type="button"
                className={cn(
                  'flex w-full items-start justify-between gap-3 rounded-sm px-2 py-1.5 text-left',
                  'transition-colors hover:bg-foreground/5',
                )}
                onClick={(e) => {
                  e.stopPropagation()
                  navigateToNode(resultNode.id)
                }}
              >
                <span className="min-w-0 text-[13px] leading-5 text-foreground/78">
                  {resultNode.content || resultNode.systemId || resultNode.id}
                </span>

                {resultNode.supertags[0] && (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-px',
                      'text-[10px] font-medium leading-5',
                    )}
                    style={
                      resultNode.supertags[0].color
                        ? {
                            backgroundColor: `${resultNode.supertags[0].color}16`,
                            color: resultNode.supertags[0].color,
                          }
                        : undefined
                    }
                  >
                    <Hash size={9} weight="bold" />
                    {resultNode.supertags[0].name}
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="mt-2 text-[12px] text-foreground/35">
            No matching nodes.
          </div>
        )}
      </div>
    </div>
  )
}
