import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  Hash,
  MagnifyingGlass,
  Trash,
  ArrowRight,
  ArrowBendUpLeft,
} from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { useOutlineStore } from '@/stores/outline.store'
import { useOutlineSync } from '@/hooks/use-outline-sync'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { listSupertagsServerFn } from '@/services/supertag.server'
import { searchNodesServerFn } from '@/services/search.server'
import type { SupertagBadge } from '@/types/outline'

type PaletteStep =
  | { type: 'commands' }
  | { type: 'add-supertag' }
  | { type: 'navigate' }

interface Command {
  id: string
  label: string
  icon: React.ReactNode
  step: PaletteStep['type']
  immediate?: boolean
  action?: () => void
}

interface NodeCommandPaletteProps {
  open: boolean
  onClose: () => void
}

export function NodeCommandPalette({ open, onClose }: NodeCommandPaletteProps) {
  const [step, setStep] = useState<PaletteStep>({ type: 'commands' })
  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null)

  const selectedNodeId = useOutlineStore((s) => s.selectedNodeId)
  const activeNodeId = useOutlineStore((s) => s.activeNodeId)
  const navigateToNode = useNavigateToNode()
  const { deleteNode, addSupertag, indentNode, outdentNode } = useOutlineSync()

  const targetNodeId = activeNodeId ?? selectedNodeId

  // Position the palette below the active/selected node
  useEffect(() => {
    if (!open || !targetNodeId) {
      setAnchorRect(null)
      return
    }
    const nodeEl = document.querySelector(`[data-node-id="${targetNodeId}"] .node-row`)
    if (nodeEl) {
      setAnchorRect(nodeEl.getBoundingClientRect())
    }
  }, [open, targetNodeId])

  // Reset state on open
  useEffect(() => {
    if (open) {
      setStep({ type: 'commands' })
      setQuery('')
      setHighlightIndex(0)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // Commands list
  const commands: Command[] = [
    {
      id: 'add-supertag',
      label: 'Add supertag',
      icon: <Hash size={14} weight="bold" />,
      step: 'add-supertag',
    },
    {
      id: 'navigate',
      label: 'Navigate to node',
      icon: <MagnifyingGlass size={14} />,
      step: 'navigate',
    },
    {
      id: 'indent',
      label: 'Indent',
      icon: <ArrowRight size={14} />,
      step: 'commands',
      immediate: true,
      action: () => {
        if (targetNodeId) {
          indentNode(targetNodeId)
        }
        onClose()
      },
    },
    {
      id: 'outdent',
      label: 'Outdent',
      icon: <ArrowBendUpLeft size={14} />,
      step: 'commands',
      immediate: true,
      action: () => {
        if (targetNodeId) {
          outdentNode(targetNodeId)
        }
        onClose()
      },
    },
    {
      id: 'delete',
      label: 'Delete node',
      icon: <Trash size={14} />,
      step: 'commands',
      immediate: true,
      action: () => {
        if (targetNodeId) deleteNode(targetNodeId)
        onClose()
      },
    },
  ]

  const filteredCommands = commands.filter((c) =>
    c.label.toLowerCase().includes(query.toLowerCase()),
  )

  // --- Supertag step ---
  const [supertags, setSupertags] = useState<SupertagBadge[]>([])
  const [supertagsLoaded, setSupertagsLoaded] = useState(false)

  useEffect(() => {
    if (step.type === 'add-supertag' && !supertagsLoaded) {
      listSupertagsServerFn()
        .then((result) => {
          if (result.success) {
            setSupertags(
              result.supertags.map((s: { id: string; name: string; systemId: string | null; color: string | null }) => ({
                id: s.id,
                name: s.name,
                systemId: s.systemId,
                color: s.color,
              })),
            )
          }
          setSupertagsLoaded(true)
        })
        .catch(() => setSupertagsLoaded(true))
    }
  }, [step.type, supertagsLoaded])

  const filteredSupertags = supertags.filter((s) =>
    s.name.toLowerCase().includes(query.toLowerCase()),
  )

  // --- Navigate step ---
  const [searchResults, setSearchResults] = useState<{ id: string; content: string; supertags: SupertagBadge[] }[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const debounceRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (step.type !== 'navigate') return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!query.trim()) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    debounceRef.current = setTimeout(() => {
      searchNodesServerFn({ data: { query: query.trim(), limit: 10 } })
        .then((res) => {
          if (res.success) setSearchResults(res.nodes)
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false))
    }, 300)
  }, [query, step.type])

  // Compute items based on step
  const items: { id: string; label: string; icon?: React.ReactNode; color?: string | null }[] =
    step.type === 'commands'
      ? filteredCommands.map((c) => ({ id: c.id, label: c.label, icon: c.icon }))
      : step.type === 'add-supertag'
        ? filteredSupertags.map((s) => ({
            id: s.id,
            label: s.name,
            icon: <Hash size={12} weight="bold" />,
            color: s.color,
          }))
        : searchResults.map((n) => ({
            id: n.id,
            label: n.content || 'Untitled',
          }))

  // Reset highlight on query change
  useEffect(() => {
    setHighlightIndex(0)
  }, [query, step.type])

  // Scroll highlighted into view
  useEffect(() => {
    if (listRef.current) {
      const item = listRef.current.children[highlightIndex] as HTMLElement | undefined
      item?.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIndex])

  const handleSelect = useCallback(
    (index: number) => {
      if (step.type === 'commands') {
        const cmd = filteredCommands[index]
        if (!cmd) return
        if (cmd.immediate && cmd.action) {
          cmd.action()
          return
        }
        setStep({ type: cmd.step as PaletteStep['type'] })
        setQuery('')
        setHighlightIndex(0)
      } else if (step.type === 'add-supertag') {
        const tag = filteredSupertags[index]
        if (tag && targetNodeId) {
          addSupertag(targetNodeId, tag, [])
          onClose()
        }
      } else if (step.type === 'navigate') {
        const node = searchResults[index]
        if (node) {
          navigateToNode(node.id)
          onClose()
        }
      }
    },
    [step, filteredCommands, filteredSupertags, searchResults, targetNodeId, addSupertag, navigateToNode, onClose],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (step.type !== 'commands') {
          // Go back to commands
          setStep({ type: 'commands' })
          setQuery('')
          setHighlightIndex(0)
        } else {
          onClose()
        }
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(i + 1, items.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        handleSelect(highlightIndex)
        return
      }
    },
    [step, items.length, highlightIndex, handleSelect, onClose],
  )

  if (!open || !anchorRect) return null

  const placeholder =
    step.type === 'commands'
      ? 'Type a command...'
      : step.type === 'add-supertag'
        ? 'Search supertags...'
        : 'Search nodes...'

  const stepLabel =
    step.type === 'add-supertag'
      ? 'Add supertag'
      : step.type === 'navigate'
        ? 'Navigate'
        : null

  return createPortal(
    <>
      {/* Invisible backdrop to close on outside click */}
      <div className="fixed inset-0 z-[99]" onClick={onClose} />

      <div
        className={cn(
          'fixed z-[100] w-[300px]',
          'rounded-lg border border-foreground/10',
          'bg-popover shadow-xl',
          'overflow-hidden',
        )}
        style={{
          top: anchorRect.bottom + 4,
          left: Math.max(8, anchorRect.left),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Step breadcrumb */}
        {stepLabel && (
          <div className="flex items-center gap-1 px-3 pt-2 pb-0.5">
            <button
              type="button"
              className="text-[10px] text-foreground/30 hover:text-foreground/50 transition-colors"
              onClick={() => {
                setStep({ type: 'commands' })
                setQuery('')
                setHighlightIndex(0)
              }}
            >
              Commands
            </button>
            <span className="text-[10px] text-foreground/20">›</span>
            <span className="text-[10px] text-foreground/50 font-medium">{stepLabel}</span>
          </div>
        )}

        {/* Input */}
        <div className="flex items-center gap-2 px-3 py-2">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn(
              'flex-1 bg-transparent outline-none',
              'text-[13px] text-foreground/85 placeholder:text-foreground/25',
            )}
          />
          {searchLoading && (
            <span className="text-[10px] text-foreground/25">...</span>
          )}
        </div>

        {/* Items list */}
        {items.length > 0 && (
          <div ref={listRef} className="max-h-[240px] overflow-y-auto border-t border-foreground/[0.06] p-1">
            {items.map((item, i) => (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left',
                  'text-[13px] transition-colors duration-75',
                  i === highlightIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'text-foreground/70 hover:bg-foreground/[0.04]',
                )}
                onClick={() => handleSelect(i)}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                {item.icon && (
                  <span
                    className="shrink-0 opacity-50"
                    style={item.color ? { color: item.color } : undefined}
                  >
                    {item.icon}
                  </span>
                )}
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Empty states */}
        {items.length === 0 && step.type === 'commands' && query && (
          <div className="px-3 py-3 text-center text-[12px] text-foreground/25 border-t border-foreground/[0.06]">
            No matching commands
          </div>
        )}
        {items.length === 0 && step.type === 'add-supertag' && supertagsLoaded && (
          <div className="px-3 py-3 text-center text-[12px] text-foreground/25 border-t border-foreground/[0.06]">
            No matching supertags
          </div>
        )}
        {items.length === 0 && step.type === 'navigate' && query.trim() && !searchLoading && (
          <div className="px-3 py-3 text-center text-[12px] text-foreground/25 border-t border-foreground/[0.06]">
            No results
          </div>
        )}

        {/* Hint */}
        <div className="flex items-center gap-3 px-3 py-1.5 border-t border-foreground/[0.06] text-[10px] text-foreground/20">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc {step.type !== 'commands' ? 'back' : 'close'}</span>
        </div>
      </div>
    </>,
    document.body,
  )
}
