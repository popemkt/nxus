import { memo, useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowClockwise } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { QueryBuilder } from '@nxus/workbench'
import type { QueryDefinition } from '@nxus/db'
import { evaluateQueryServerFn, updateQueryDefinitionServerFn } from '@/services/outline.server'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { getSupertagColor } from '@/lib/supertag-colors'
import { outlineQueryKeys, safeStringify, isQueryDefinition } from './query-helpers'
import { SupertagPill } from './supertag-pill'

interface QueryResultNode {
  id: string
  content: string
  supertags: { id: string; content: string; systemId: string | null }[]
}

interface QueryResultsProps {
  nodeId: string
  definition: unknown
  depth: number
  workbenchOpen: boolean
}

/**
 * Evaluates a query definition and renders matching nodes as reference rows.
 * Uses TanStack Query for caching and automatic invalidation.
 */
export const QueryResults = memo(function QueryResults({
  nodeId,
  definition,
  depth,
  workbenchOpen,
}: QueryResultsProps) {
  const navigateToNode = useNavigateToNode()
  const queryClient = useQueryClient()

  // Local state so filter edits are reflected immediately (the store prop
  // only updates after a full refresh, so we optimistically track changes).
  const [localDef, setLocalDef] = useState<unknown>(definition)
  useEffect(() => {
    setLocalDef(definition)
  }, [definition])

  const definitionKey = safeStringify(localDef)
  const hasDefinition = !!localDef && definitionKey !== '{}' && definitionKey !== ''

  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: outlineQueryKeys.evaluation(definitionKey),
    queryFn: () => evaluateQueryServerFn({ data: { definition: localDef as QueryDefinition } }),
    enabled: hasDefinition,
    staleTime: 30_000,
  })

  const results: QueryResultNode[] = data?.success ? data.nodes : []
  const totalCount = data?.success ? data.totalCount : 0

  const handleDefinitionChange = useCallback(
    (newDef: QueryDefinition) => {
      // Update local state immediately so the query re-evaluates
      setLocalDef(newDef)

      updateQueryDefinitionServerFn({
        data: { nodeId, definition: newDef },
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: outlineQueryKeys.all })
        })
        .catch((err: unknown) => {
          console.error('[query-workbench] Failed to save definition:', err)
        })
    },
    [nodeId, queryClient],
  )

  const paddingLeft = `${(depth + 1) * 24}px`

  return (
    <div className="query-results">
      {/* Inline query workbench — QueryLinter + QueryBuilder together */}
      {workbenchOpen && isQueryDefinition(localDef) && (
        <div
          className="border border-foreground/[0.06] rounded-md my-1 bg-background/50"
          style={{ marginLeft: paddingLeft, marginRight: '8px' }}
        >
          <QueryBuilder
            value={localDef}
            onChange={handleDefinitionChange}
            compact
            showExecute={false}
            showSave={false}
            showLinter
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
    <button
      type="button"
      className={cn(
        'flex w-full items-start rounded-sm cursor-pointer text-left',
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
      <span className="flex min-h-6 flex-1 items-start gap-1.5 px-1">
        <span
          className={cn(
            'text-[14.5px] leading-[1.6] text-foreground/70 truncate',
          )}
        >
          {node.content || '\u200B'}
        </span>

        {node.supertags.length > 0 && (
          <span className="flex h-6 items-center gap-0.5">
            {node.supertags.map((tag) => (
              <SupertagPill key={tag.id} tag={tag} />
            ))}
          </span>
        )}
      </span>
    </button>
  )
}
