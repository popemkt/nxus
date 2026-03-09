import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@nxus/ui'
import type { SupertagBadge } from '@/types/outline'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'

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
}: NodeContentProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isComposing = useRef(false)
  const wasActive = useRef(false)

  // When becoming active: set DOM content and focus with cursor position.
  // When becoming inactive: clear editing state.
  // NEVER set DOM content during active editing — the DOM is the source of truth.
  useEffect(() => {
    if (isActive && editorRef.current) {
      const el = editorRef.current

      // Only set text content when first becoming active
      if (!wasActive.current) {
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
      } else if (!textNode && content === '') {
        // Empty node — just focus
        el.focus()
      }
    } else {
      wasActive.current = false
    }
  }, [isActive, cursorPosition, content])

  const handleInput = useCallback(() => {
    if (editorRef.current && !isComposing.current) {
      onChange(editorRef.current.textContent ?? '')
    }
  }, [onChange])

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (isComposing.current) return
      onKeyDown(e)
    },
    [onKeyDown],
  )

  return (
    <div
      className={cn(
        'node-content flex min-h-[28px] flex-1 items-center gap-1.5',
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

      {supertags.length > 0 && <SupertagBadges supertags={supertags} />}
    </div>
  )
}

function SupertagBadges({ supertags }: { supertags: SupertagBadge[] }) {
  const navigateToNode = useNavigateToNode()

  return (
    <div className="flex items-center gap-0.5">
      {supertags.map((tag) => (
        <span
          key={tag.id}
          className={cn(
            'inline-flex items-center rounded-sm px-1.5 py-px',
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
          {tag.name}
        </span>
      ))}
    </div>
  )
}
