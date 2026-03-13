import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Hash, X } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { SupertagBadge } from '@/types/outline'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { getCaretRect } from '@/lib/caret-utils'
import { SupertagAutocomplete } from './supertag-autocomplete'

interface NodeContentProps {
  nodeId: string
  content: string
  isActive: boolean
  isSelected: boolean
  supertags: SupertagBadge[]
  cursorPosition: number
  onActivate: (cursorPos?: number) => void
  onChange: (content: string) => void
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
  onRemoveSupertag?: (supertagId: string, supertagSystemId: string | null) => void
  onAddSupertag?: (supertag: SupertagBadge) => void
  onTriggerFieldAdd?: () => void
  onSplitNode?: (beforeText: string, afterText: string) => void
}

export function NodeContent({
  content,
  isActive,
  isSelected,
  supertags,
  cursorPosition,
  onActivate,
  onChange,
  onKeyDown,
  onRemoveSupertag,
  onAddSupertag,
  onTriggerFieldAdd,
  onSplitNode,
}: NodeContentProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isComposing = useRef(false)
  const wasActive = useRef(false)

  // `#` autocomplete state
  const [autocomplete, setAutocomplete] = useState<{
    query: string
    rect: { top: number; left: number; height: number }
  } | null>(null)

  // When becoming active: set DOM content and focus with cursor position.
  // When becoming inactive: clear editing state.
  // NEVER set DOM content during active editing — the DOM is the source of truth.
  // `content` is intentionally excluded from deps: during active editing the DOM
  // owns the text; re-running on content changes would reset the cursor.
  useEffect(() => {
    if (isActive && editorRef.current) {
      const el = editorRef.current

      if (!wasActive.current) {
        // First becoming active — set DOM content from store
        el.textContent = content
      }
      wasActive.current = true

      el.focus()
      const textNode = el.firstChild
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const sel = window.getSelection()
        const range = document.createRange()
        const pos = Math.min(
          cursorPosition,
          textNode.textContent?.length ?? 0,
        )
        range.setStart(textNode, pos)
        range.collapse(true)
        sel?.removeAllRanges()
        sel?.addRange(range)
      } else if (!textNode) {
        el.focus()
      }
    } else {
      wasActive.current = false
      setAutocomplete(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, cursorPosition])

  const handleInput = useCallback(() => {
    if (editorRef.current && !isComposing.current) {
      const text = editorRef.current.textContent ?? ''

      // Detect `>` trigger for inline field creation
      // `>` at start of text or after whitespace triggers field add
      if (onTriggerFieldAdd && text.trimEnd() === '>') {
        editorRef.current.textContent = ''
        onChange('')
        setAutocomplete(null)
        onTriggerFieldAdd()
        return
      }

      onChange(text)

      // Detect `#word` pattern at caret position for supertag autocomplete
      if (onAddSupertag) {
        const sel = window.getSelection()
        if (sel && sel.rangeCount > 0) {
          const offset = sel.focusOffset
          const textBeforeCaret = text.slice(0, offset)
          // Match `#` at word boundary followed by optional chars
          const match = textBeforeCaret.match(/(^|[\s])#(\S*)$/)
          if (match) {
            const rect = getCaretRect()
            if (rect) {
              setAutocomplete({ query: match[2]!, rect })
              return
            }
          }
        }
        setAutocomplete(null)
      }
    }
  }, [onChange, onAddSupertag, onTriggerFieldAdd])

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!isActive) {
        // Delay reading selection — the browser sets it after mouseup
        requestAnimationFrame(() => {
          const sel = window.getSelection()
          if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
            onActivate(sel.focusOffset)
          } else {
            onActivate(content.length)
          }
        })
      }
      e.stopPropagation()
    },
    [isActive, onActivate, content.length],
  )

  const handleCompositionStart = useCallback(() => {
    isComposing.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    isComposing.current = false
    handleInput()
  }, [handleInput])

  const handleSelectSupertag = useCallback(
    (supertag: SupertagBadge) => {
      if (!editorRef.current || !onAddSupertag) return

      // Strip `#query` from content
      const text = editorRef.current.textContent ?? ''
      const sel = window.getSelection()
      const offset = sel?.focusOffset ?? text.length
      const textBeforeCaret = text.slice(0, offset)
      const match = textBeforeCaret.match(/(^|[\s])#(\S*)$/)
      if (match) {
        const hashStart = textBeforeCaret.lastIndexOf('#')
        const newText = text.slice(0, hashStart).trimEnd() + text.slice(offset)
        editorRef.current.textContent = newText
        onChange(newText)

        // Restore cursor
        const textNode = editorRef.current.firstChild
        if (textNode) {
          const newSel = window.getSelection()
          const range = document.createRange()
          const pos = Math.min(hashStart, textNode.textContent?.length ?? 0)
          range.setStart(textNode, pos)
          range.collapse(true)
          newSel?.removeAllRanges()
          newSel?.addRange(range)
        }
      }

      setAutocomplete(null)
      onAddSupertag(supertag)
    },
    [onAddSupertag, onChange],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isComposing.current) return
      // Let autocomplete handle its own keys — it captures at document level
      if (autocomplete) return

      // Enter mid-text → split node
      if (e.key === 'Enter' && !e.shiftKey && onSplitNode && editorRef.current) {
        const sel = window.getSelection()
        const text = editorRef.current.textContent ?? ''
        const offset = sel?.focusOffset ?? text.length
        // Only split if cursor is mid-text (not at end and not empty)
        if (text.length > 0 && offset < text.length) {
          e.preventDefault()
          const before = text.slice(0, offset)
          const after = text.slice(offset)
          onSplitNode(before, after)
          return
        }
      }

      onKeyDown(e)
    },
    [onKeyDown, autocomplete, onSplitNode],
  )

  return (
    <div
      className={cn(
        'node-content flex min-h-6 flex-1 items-start gap-1.5',
        'rounded-sm px-1',
        isSelected && !isActive && 'bg-primary/8',
      )}
      onClick={handleClick}
    >
      {isActive ? (
        <div
          ref={editorRef}
          key="editor"
          className={cn(
            'editable flex-1 outline-none',
            'text-[14.5px] leading-[1.6]',
            'text-foreground/85',
            'caret-foreground/70',
          )}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          role="textbox"
        />
      ) : (
        <div
          ref={editorRef}
          className={cn(
            'editable flex-1 outline-none',
            'text-[14.5px] leading-[1.6]',
            'text-foreground/85',
            !content && 'text-foreground/25',
          )}
          role="presentation"
        >
          {content || '\u200B'}
        </div>
      )}

      {supertags.length > 0 && (
        <SupertagBadges supertags={supertags} onRemove={onRemoveSupertag} />
      )}

      {autocomplete && createPortal(
        <SupertagAutocomplete
          query={autocomplete.query}
          anchorRect={autocomplete.rect}
          onSelect={handleSelectSupertag}
          onDismiss={() => setAutocomplete(null)}
        />,
        document.body,
      )}
    </div>
  )
}

function SupertagBadges({
  supertags,
  onRemove,
}: {
  supertags: SupertagBadge[]
  onRemove?: (supertagId: string, supertagSystemId: string | null) => void
}) {
  const navigateToNode = useNavigateToNode()

  return (
    <div className="flex h-6 items-center gap-0.5">
      {supertags.map((tag) => (
        <span
          key={tag.id}
          className={cn(
            'group/tag inline-flex items-center gap-0.5 rounded-sm px-1.5 py-px',
            'text-[11px] font-medium leading-[1.8]',
            'select-none whitespace-nowrap',
            'cursor-pointer transition-opacity hover:opacity-70',
            !tag.color && 'bg-foreground/8 text-foreground/50',
          )}
          style={
            tag.color
              ? {
                  backgroundColor: `${tag.color}18`,
                  color: tag.color,
                }
              : undefined
          }
          onClick={(e) => {
            e.stopPropagation()
            navigateToNode(tag.id)
          }}
          title={`Go to: ${tag.name}`}
        >
          {/* Icon area — fixed size, X overlays # on hover */}
          <span className="relative shrink-0 h-[10px] w-[10px]">
            <Hash size={10} weight="bold" className="opacity-60 group-hover/tag:opacity-0 transition-opacity" />
            {onRemove && (
              <span
                className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/tag:opacity-60 hover:!opacity-100 transition-opacity cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(tag.id, tag.systemId)
                }}
                title={`Remove #${tag.name}`}
              >
                <X size={10} weight="bold" />
              </span>
            )}
          </span>
          {tag.name}
        </span>
      ))}
    </div>
  )
}
