import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Hash, MagnifyingGlass } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { searchNodesServerFn } from '@/services/search.server'

interface SearchResult {
  id: string
  content: string
  supertags: { id: string; name: string; color: string | null; systemId: string | null }[]
}

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)
  const navigateToNode = useNavigateToNode()

  // Focus input when opening
  useEffect(() => {
    if (open) {
      setQuery('')
      setResults([])
      setHighlightIndex(0)
      // Delay to allow portal to mount
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Debounced search
  const doSearch = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!q.trim()) {
      setResults([])
      setLoading(false)
      return
    }
    setLoading(true)
    debounceRef.current = setTimeout(() => {
      searchNodesServerFn({ data: { query: q.trim(), limit: 20 } })
        .then((res) => {
          if (res.success) {
            setResults(res.nodes)
            setHighlightIndex(0)
          }
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 300)
  }, [])

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value
      setQuery(value)
      doSearch(value)
    },
    [doSearch],
  )

  const handleSelect = useCallback(
    (nodeId: string) => {
      onClose()
      navigateToNode(nodeId)
    },
    [onClose, navigateToNode],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(i + 1, results.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const selected = results[highlightIndex]
        if (selected) handleSelect(selected.id)
        return
      }
    },
    [results, highlightIndex, handleSelect, onClose],
  )

  if (!open) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30" onClick={onClose} />

      {/* Palette */}
      <div
        className={cn(
          'relative z-10 w-full max-w-[520px]',
          'rounded-xl border border-foreground/10',
          'bg-popover shadow-2xl',
          'overflow-hidden',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-foreground/[0.06]">
          <MagnifyingGlass size={16} className="shrink-0 text-foreground/30" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Search nodes..."
            className={cn(
              'flex-1 bg-transparent outline-none',
              'text-[14.5px] text-foreground/85 placeholder:text-foreground/25',
            )}
          />
          {loading && (
            <span className="text-[11px] text-foreground/25">Searching...</span>
          )}
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-[320px] overflow-y-auto p-1">
            {results.map((node, i) => (
              <button
                key={node.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left',
                  'transition-colors duration-75',
                  i === highlightIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-foreground/[0.04]',
                )}
                onClick={() => handleSelect(node.id)}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                <span className="text-[14px] leading-[1.5] text-foreground/80 truncate flex-1">
                  {node.content || 'Untitled'}
                </span>
                {node.supertags.length > 0 && (
                  <span className="flex items-center gap-0.5 shrink-0">
                    {node.supertags.slice(0, 3).map((tag) => (
                      <span
                        key={tag.id}
                        className={cn(
                          'inline-flex items-center gap-0.5 rounded-sm px-1.5 py-px',
                          'text-[10px] font-medium leading-[1.6]',
                          'select-none whitespace-nowrap',
                        )}
                        style={{
                          backgroundColor: tag.color ? `${tag.color}18` : undefined,
                          color: tag.color ?? undefined,
                        }}
                      >
                        <Hash size={8} weight="bold" className="opacity-60" />
                        {tag.name}
                      </span>
                    ))}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!loading && query.trim() && results.length === 0 && (
          <div className="px-4 py-6 text-center text-[13px] text-foreground/25">
            No results found
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
