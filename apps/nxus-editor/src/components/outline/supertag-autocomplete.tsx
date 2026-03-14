import { useCallback, useEffect, useRef, useState } from 'react'
import { Hash } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { listSupertagsServerFn } from '@/services/supertag.server'
import type { SupertagBadge } from '@/types/outline'

interface SupertagOption {
  id: string
  name: string
  systemId: string | null
  color: string | null
}

interface SupertagAutocompleteProps {
  query: string
  anchorRect: { top: number; left: number; height: number }
  onSelect: (supertag: SupertagBadge) => void
  onDismiss: () => void
}

export function SupertagAutocomplete({
  query,
  anchorRect,
  onSelect,
  onDismiss,
}: SupertagAutocompleteProps) {
  const [options, setOptions] = useState<SupertagOption[]>([])
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  // Fetch supertags once
  useEffect(() => {
    listSupertagsServerFn()
      .then((result) => {
        if (result.success) {
          setOptions(result.supertags)
        }
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [])

  // Filter by query
  const filtered = options.filter((opt) =>
    opt.name.toLowerCase().includes(query.toLowerCase()),
  )

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIndex(0)
  }, [query])

  // Scroll highlighted item into view
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIndex])

  // Keyboard handler — called from parent's keydown interceptor
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        e.stopPropagation()
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
        return true
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        e.stopPropagation()
        setHighlightIndex((i) => Math.max(i - 1, 0))
        return true
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        const selected = filtered[highlightIndex]
        if (selected) {
          onSelect({
            id: selected.id,
            name: selected.name,
            systemId: selected.systemId,
            color: selected.color,
          })
        }
        return true
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onDismiss()
        return true
      }
      return false
    },
    [filtered, highlightIndex, onSelect, onDismiss],
  )

  // Attach keyboard handler to capture events before contentEditable
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      handleKeyDown(e)
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [handleKeyDown])

  if (!loaded) return null
  if (filtered.length === 0 && loaded) {
    return (
      <div
        className="fixed z-50 rounded-lg border border-foreground/10 bg-popover p-2 shadow-lg"
        style={{
          top: anchorRect.top + anchorRect.height + 4,
          left: anchorRect.left,
        }}
      >
        <span className="text-xs text-foreground/40">No matching supertags</span>
      </div>
    )
  }

  return (
    <div
      className="fixed z-50 max-h-48 min-w-[180px] overflow-y-auto rounded-lg border border-foreground/10 bg-popover p-1 shadow-lg"
      style={{
        top: anchorRect.top + anchorRect.height + 4,
        left: anchorRect.left,
      }}
      ref={listRef}
    >
      {filtered.map((opt, i) => (
        <div
          key={opt.id}
          className={cn(
            'flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs',
            i === highlightIndex && 'bg-accent text-accent-foreground',
          )}
          onMouseEnter={() => setHighlightIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault()
            onSelect({
              id: opt.id,
              name: opt.name,
              systemId: opt.systemId,
              color: opt.color,
            })
          }}
        >
          <span
            className={cn(
              'inline-flex items-center gap-0.5 rounded-sm px-1 py-px',
              'text-[10px] font-medium',
              !opt.color && 'bg-foreground/8 text-foreground/50',
            )}
            style={
              opt.color
                ? { backgroundColor: `${opt.color}18`, color: opt.color }
                : undefined
            }
          >
            <Hash size={9} weight="bold" className="shrink-0 opacity-60" />
            {opt.name}
          </span>
        </div>
      ))}
    </div>
  )
}
