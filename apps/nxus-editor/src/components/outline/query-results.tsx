import { useState, memo, useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Hash, ArrowClockwise, Sliders } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { QueryBuilder, QueryLinter } from '@nxus/workbench'
import type { QueryDefinition } from '@nxus/db'
import { evaluateQueryServerFn, updateQueryDefinitionServerFn } from '@/services/outline.server'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { getSupertagColor } from '@/lib/supertag-colors'
import { outlineQueryKeys, safeStringify, isQueryDefinition } from './query-helpers'

interface QueryResultNode {
  id: string
  content: string
  supertags: { id: string; content: string; systemId: string | null }[]
}

interface QueryResultsProps {
  nodeId: string
  definition: unknown
  depth: number
}

/**
 * Evaluates a query definition and renders matching nodes as reference rows.
 * Uses TanStack Query for caching and automatic invalidation.
 */
export const QueryResults = memo(function QueryResults({
  nodeId,
  definition,
  depth,
}: QueryResultsProps) {
  const [workbenchOpen, setWorkbenchOpen] = useState(false)
  const navigateToNode = useNavigateToNode()
  const queryClient = useQueryClient()

  const definitionKey = safeStringify(definition)
  const hasDefinition = !!definition && definitionKey !== '{}' && definitionKey !== ''

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: outlineQueryKeys.evaluation(definitionKey),
    queryFn: () => evaluateQueryServerFn({ data: { definition } }),
    enabled: hasDefinition,
    staleTime: 30_000,
  })

  const results: QueryResultNode[] = data?.success ? data.nodes : []
  const totalCount = data?.success ? data.totalCount : 0

  const handleDefinitionChange = useCallback(
    (newDef: QueryDefinition) => {
      updateQueryDefinitionServerFn({
        data: { nodeId, definition: newDef },
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: outlineQueryKeys.all })
        })
        .catch((err) => {
          console.error('[query-workbench] Failed to save definition:', err)
        })
    },
    [nodeId, queryClient],
  )

  const paddingLeft = `${(depth + 1) * 24}px`

  return (
    <div className="query-results">
      {/* Inline query summary + configure button */}
      <div
        className="flex items-center gap-1.5 py-0.5"
        style={{ paddingLeft }}
      >
        {isQueryDefinition(definition) && (
          <QueryLinter
            query={definition}
            compact
            className="flex-1 min-w-0 truncate text-foreground/30"
          />
        )}
        <button
          type="button"
          onClick={() => setWorkbenchOpen((o) => !o)}
          className={cn(
            'flex items-center gap-1 rounded-sm px-1.5 py-0.5',
            'text-[11px] text-foreground/30 hover:text-foreground/60',
            'hover:bg-foreground/5 transition-colors duration-100',
            'select-none shrink-0',
            workbenchOpen && 'bg-foreground/5 text-foreground/50',
          )}
          title="Configure query"
        >
          <Sliders size={12} weight="bold" />
          <span>Configure</span>
        </button>
      </div>

      {/* Inline query workbench */}
      {workbenchOpen && isQueryDefinition(definition) && (
        <div
          className="border border-foreground/[0.06] rounded-md my-1 bg-background/50"
          style={{ marginLeft: paddingLeft, marginRight: '8px' }}
        >
          <QueryBuilder
            value={definition}
            onChange={handleDefinitionChange}
            compact
            showExecute={false}
            showSave={false}
            showLinter={false}
            resultCount={totalCount}
            isLoading={isLoading}
            isError={!!error}
            errorMessage={error instanceof Error ? error.message : undefined}
          />
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div
          className="flex items-center gap-1.5 py-1 text-[13px] text-foreground/30"
          style={{ paddingLeft }}
        >
          <ArrowClockwise size={12} className="animate-spin" />
          <span>Running query...</span>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div
          className="py-1 text-[13px] text-red-400/70"
          style={{ paddingLeft }}
        >
          Query error: {error instanceof Error ? error.message : 'Query failed'}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && hasDefinition && results.length === 0 && (
        <div
          className="py-1 text-[13px] text-foreground/25 italic"
          style={{ paddingLeft }}
        >
          No results
        </div>
      )}

      {/* Result rows */}
      {results.map((node) => (
        <QueryResultRow
          key={node.id}
          node={node}
          depth={depth}
          onClick={() => navigateToNode(node.id)}
        />
      ))}

      {/* Truncation notice */}
      {totalCount > results.length && (
        <div
          className="py-0.5 text-[12px] text-foreground/25"
          style={{ paddingLeft }}
        >
          {results.length} of {totalCount} results
        </div>
      )}
    </div>
  )
})

function QueryResultRow({
  node,
  depth,
  onClick,
}: {
  node: QueryResultNode
  depth: number
  onClick: () => void
}) {
  const primaryColor = node.supertags[0]
    ? getSupertagColor(node.supertags[0].id)
    : null

  return (
    <div
      className={cn(
        'flex items-start rounded-sm cursor-pointer',
        'hover:bg-foreground/[0.03] transition-colors duration-75',
      )}
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
      onClick={onClick}
      title={`Go to: ${node.content || 'Untitled'}`}
    >
      {/* Reference bullet — dashed circle */}
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
      <div className="flex min-h-6 flex-1 items-start gap-1.5 px-1">
        <span
          className={cn(
            'text-[14.5px] leading-[1.6] text-foreground/70 truncate',
          )}
        >
          {node.content || '\u200B'}
        </span>

        {node.supertags.length > 0 && (
          <div className="flex h-6 items-center gap-0.5">
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
                  style={{
                    backgroundColor: `${color}18`,
                    color,
                  }}
                >
                  <Hash
                    size={10}
                    weight="bold"
                    className="shrink-0 opacity-60"
                  />
                  {tag.content}
                </span>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
