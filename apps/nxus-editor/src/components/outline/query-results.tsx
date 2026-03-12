import { useState, useEffect, memo } from 'react'
import { Hash, ArrowClockwise } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { evaluateQueryServerFn } from '@/services/outline.server'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { getSupertagColor } from '@/lib/supertag-colors'

interface QueryResultNode {
  id: string
  content: string
  supertags: { id: string; content: string; systemId: string | null }[]
}

interface QueryResultsProps {
  definition: unknown
  depth: number
}

/**
 * Evaluates a query definition and renders matching nodes as reference rows.
 * Used inside NodeBlock when a node has the #Query supertag.
 */
export const QueryResults = memo(function QueryResults({
  definition,
  depth,
}: QueryResultsProps) {
  const [results, setResults] = useState<QueryResultNode[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigateToNode = useNavigateToNode()

  // Stabilize definition identity so the effect only re-runs on actual changes
  const definitionKey = safeStringify(definition)

  useEffect(() => {
    if (!definition || definitionKey === '{}' || definitionKey === '') {
      setLoading(false)
      setResults([])
      setTotalCount(0)
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    evaluateQueryServerFn({ data: { definition } })
      .then((res) => {
        if (cancelled) return
        if (res.success) {
          setResults(res.nodes)
          setTotalCount(res.totalCount)
        }
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Query failed')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definitionKey])

  const paddingLeft = `${(depth + 1) * 24}px`

  if (loading) {
    return (
      <div
        className="flex items-center gap-1.5 py-1 text-[13px] text-foreground/30"
        style={{ paddingLeft }}
      >
        <ArrowClockwise size={12} className="animate-spin" />
        <span>Running query...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="py-1 text-[13px] text-red-400/70"
        style={{ paddingLeft }}
      >
        Query error: {error}
      </div>
    )
  }

  if (results.length === 0) {
    return (
      <div
        className="py-1 text-[13px] text-foreground/25 italic"
        style={{ paddingLeft }}
      >
        No results
      </div>
    )
  }

  return (
    <div className="query-results">
      {results.map((node) => (
        <QueryResultRow
          key={node.id}
          node={node}
          depth={depth}
          onClick={() => navigateToNode(node.id)}
        />
      ))}

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

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}
