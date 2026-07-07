import { useCallback, useEffect, useRef, useState } from 'react'
import { cn } from '@nxus/ui'
import { searchNodesServerFn } from '@/services/search.server'

interface MentionOption {
  id: string
  content: string
}

interface MentionAutocompleteProps {
  query: string
  anchorRect: { top: number; left: number; height: number }
  onSelect: (option: MentionOption) => void
  onDismiss: () => void
}

/**
 * Popover opened by typing `[[` in an active node — searches nodes by
 * content and inserts a `[[node:<uuid>]]` token on selection.
 * Mirrors `SupertagAutocomplete`'s keyboard-capture pattern.
 */
export function MentionAutocomplete({
  query,
  anchorRect,
  onSelect,
  onDismiss,
}: MentionAutocompleteProps) {
  const [options, setOptions] = useState<MentionOption[]>([])
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setOptions([])
      setLoading(false)
      return
    }
    setLoading(true)
    const thisRequest = ++requestIdRef.current
    const timer = setTimeout(() => {
      searchNodesServerFn({ data: { query: trimmed, limit: 8 } })
        .then((res) => {
          if (thisRequest !== requestIdRef.current) return // stale
          if (res.success) {
            setOptions(res.nodes.map((n) => ({ id: n.id, content: n.content })))
          }
        })
        .catch(() => {
          if (thisRequest === requestIdRef.current) setOptions([])
        })
        .finally(() => {
          if (thisRequest === requestIdRef.current) setLoading(false)
        })
    }, 200)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    setHighlightIndex(0)
  }, [options])

  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIndex])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setHighlightIndex((i) => Math.min(i + 1, options.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setHighlightIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const selected = options[highlightIndex]
        if (selected) onSelect(selected)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onDismiss()
      }
    },
    [options, highlightIndex, onSelect, onDismiss],
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => handleKeyDown(e)
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [handleKeyDown])

  return (
    <div
      className="fixed z-50 max-h-48 min-w-[220px] overflow-y-auto rounded-lg border border-foreground/10 bg-popover p-1 shadow-lg"
      style={{
        top: anchorRect.top + anchorRect.height + 4,
        left: anchorRect.left,
      }}
      ref={listRef}
    >
      {!query.trim() ? (
        <span className="block px-2 py-1 text-xs text-foreground/40">Type to search nodes…</span>
      ) : options.length === 0 ? (
        <span className="block px-2 py-1 text-xs text-foreground/40">
          {loading ? 'Searching…' : 'No matching nodes'}
        </span>
      ) : (
        options.map((opt, i) => (
          <div
            key={opt.id}
            className={cn(
              'cursor-pointer truncate rounded-md px-2 py-1 text-xs',
              i === highlightIndex && 'bg-accent text-accent-foreground',
            )}
            onMouseEnter={() => setHighlightIndex(i)}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(opt)
            }}
          >
            {opt.content || 'Untitled'}
          </div>
        ))
      )}
    </div>
  )
}
