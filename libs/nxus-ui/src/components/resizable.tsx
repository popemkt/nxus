import { useCallback, useRef } from 'react'
import { cn } from '../lib/utils'

interface ResizeHandleProps {
  /** Which sibling to resize: 'previous' (left/above) or 'next' (right/below) */
  side?: 'previous' | 'next'
  /** Orientation of the handle */
  orientation?: 'horizontal' | 'vertical'
  /** Min size in px for the target panel */
  minSize?: number
  /** Max size in px for the target panel */
  maxSize?: number
  className?: string
}

/**
 * A drag handle placed between two flex siblings.
 * Dragging resizes the adjacent panel by setting its inline width/height.
 * The other sibling(s) should use flex-1 to fill remaining space.
 */
function ResizeHandle({
  side = 'previous',
  orientation = 'horizontal',
  minSize = 100,
  maxSize = 800,
  className,
}: ResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()

      const handle = handleRef.current
      if (!handle) return

      const target =
        side === 'previous'
          ? (handle.previousElementSibling as HTMLElement)
          : (handle.nextElementSibling as HTMLElement)
      if (!target) return

      const isHorizontal = orientation === 'horizontal'
      const startPos = isHorizontal ? e.clientX : e.clientY
      const startSize = isHorizontal
        ? target.getBoundingClientRect().width
        : target.getBoundingClientRect().height

      // Flip direction for 'next' — dragging right should shrink the next sibling
      const direction = side === 'previous' ? 1 : -1

      handle.setPointerCapture(e.pointerId)
      document.body.style.cursor = isHorizontal ? 'col-resize' : 'row-resize'
      document.body.style.userSelect = 'none'

      const onPointerMove = (ev: PointerEvent) => {
        const delta = isHorizontal
          ? ev.clientX - startPos
          : ev.clientY - startPos
        const newSize = Math.min(
          maxSize,
          Math.max(minSize, startSize + delta * direction),
        )
        if (isHorizontal) {
          target.style.width = `${newSize}px`
        } else {
          target.style.height = `${newSize}px`
        }
      }

      const onPointerUp = () => {
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        handle.removeEventListener('pointermove', onPointerMove)
        handle.removeEventListener('pointerup', onPointerUp)
      }

      handle.addEventListener('pointermove', onPointerMove)
      handle.addEventListener('pointerup', onPointerUp)
    },
    [side, orientation, minSize, maxSize],
  )

  const isHorizontal = orientation === 'horizontal'

  return (
    <div
      ref={handleRef}
      onPointerDown={onPointerDown}
      className={cn(
        'shrink-0 bg-border hover:bg-primary/30 transition-colors',
        isHorizontal ? 'w-px cursor-col-resize' : 'h-px cursor-row-resize',
        // Wider hit area via pseudo-element
        'relative after:absolute after:content-[""]',
        isHorizontal
          ? 'after:inset-y-0 after:left-1/2 after:w-2 after:-translate-x-1/2'
          : 'after:inset-x-0 after:top-1/2 after:h-2 after:-translate-y-1/2',
        className,
      )}
    />
  )
}

export { ResizeHandle }
