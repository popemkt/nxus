/**
 * use-touch-gestures.ts - Touch gesture support for calendar navigation
 *
 * Provides swipe gestures for navigating between periods and
 * long press gesture for creating events on mobile devices.
 */

import { useRef, useCallback, useEffect } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface TouchGestureOptions {
  /** Callback when swiping left (go to next period) */
  onSwipeLeft?: () => void

  /** Callback when swiping right (go to previous period) */
  onSwipeRight?: () => void

  /** Callback when long pressing (with coordinates) */
  onLongPress?: (clientX: number, clientY: number) => void

  /** Minimum distance in pixels to trigger a swipe (default: 50) */
  swipeThreshold?: number

  /** Minimum velocity for swipe to trigger (default: 0.3) */
  swipeVelocityThreshold?: number

  /** Duration in ms for long press to trigger (default: 500) */
  longPressDuration?: number

  /** Whether touch gestures are enabled (default: true) */
  enabled?: boolean
}

export interface TouchGestureResult {
  /** Ref to attach to the container element */
  containerRef: React.RefObject<HTMLDivElement | null>

  /** Whether a touch gesture is currently active */
  isTouching: boolean
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for touch gesture support in the calendar
 *
 * @param options - Touch gesture configuration
 * @returns Object with containerRef to attach to calendar container
 *
 * @example
 * ```tsx
 * const { containerRef } = useTouchGestures({
 *   onSwipeLeft: () => nextPeriod(),
 *   onSwipeRight: () => prevPeriod(),
 *   onLongPress: (x, y) => openCreateModal(x, y),
 * })
 *
 * return <div ref={containerRef}>...</div>
 * ```
 */
export function useTouchGestures(
  options: TouchGestureOptions = {}
): TouchGestureResult {
  const {
    onSwipeLeft,
    onSwipeRight,
    onLongPress,
    swipeThreshold = 50,
    swipeVelocityThreshold = 0.3,
    longPressDuration = 500,
    enabled = true,
  } = options

  const containerRef = useRef<HTMLDivElement | null>(null)
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null
  )
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isTouchingRef = useRef(false)

  // Clear long press timer
  const clearLongPressTimer = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }
  }, [])

  // Handle touch start
  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return

      const touch = e.touches[0]
      if (!touch) return

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now(),
      }
      isTouchingRef.current = true

      // Start long press timer
      if (onLongPress) {
        clearLongPressTimer()
        longPressTimerRef.current = setTimeout(() => {
          if (touchStartRef.current && isTouchingRef.current) {
            onLongPress(touchStartRef.current.x, touchStartRef.current.y)
            // Prevent swipe after long press
            touchStartRef.current = null
          }
        }, longPressDuration)
      }
    },
    [enabled, onLongPress, longPressDuration, clearLongPressTimer]
  )

  // Handle touch move
  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled || !touchStartRef.current) return

      const touch = e.touches[0]
      if (!touch) return

      // If moved significantly, cancel long press
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y
      const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY)

      if (distance > 10) {
        clearLongPressTimer()
      }
    },
    [enabled, clearLongPressTimer]
  )

  // Handle touch end
  const handleTouchEnd = useCallback(
    (e: TouchEvent) => {
      if (!enabled) return

      clearLongPressTimer()
      isTouchingRef.current = false

      if (!touchStartRef.current) return

      const touch = e.changedTouches[0]
      if (!touch) {
        touchStartRef.current = null
        return
      }

      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y
      const deltaTime = Date.now() - touchStartRef.current.time

      // Calculate velocity (pixels per millisecond)
      const velocityX = Math.abs(deltaX) / deltaTime
      const velocityY = Math.abs(deltaY) / deltaTime

      // Check if this is a horizontal swipe (more horizontal than vertical)
      const isHorizontalSwipe =
        Math.abs(deltaX) > Math.abs(deltaY) * 1.5 && // More horizontal than vertical
        Math.abs(deltaX) > swipeThreshold && // Meets distance threshold
        velocityX > swipeVelocityThreshold // Meets velocity threshold

      if (isHorizontalSwipe) {
        if (deltaX < 0 && onSwipeLeft) {
          // Swipe left (go to next)
          onSwipeLeft()
        } else if (deltaX > 0 && onSwipeRight) {
          // Swipe right (go to previous)
          onSwipeRight()
        }
      }

      touchStartRef.current = null
    },
    [
      enabled,
      onSwipeLeft,
      onSwipeRight,
      swipeThreshold,
      swipeVelocityThreshold,
      clearLongPressTimer,
    ]
  )

  // Handle touch cancel
  const handleTouchCancel = useCallback(() => {
    clearLongPressTimer()
    isTouchingRef.current = false
    touchStartRef.current = null
  }, [clearLongPressTimer])

  // Attach event listeners
  useEffect(() => {
    const container = containerRef.current
    if (!container || !enabled) return

    container.addEventListener('touchstart', handleTouchStart, { passive: true })
    container.addEventListener('touchmove', handleTouchMove, { passive: true })
    container.addEventListener('touchend', handleTouchEnd, { passive: true })
    container.addEventListener('touchcancel', handleTouchCancel, {
      passive: true,
    })

    return () => {
      container.removeEventListener('touchstart', handleTouchStart)
      container.removeEventListener('touchmove', handleTouchMove)
      container.removeEventListener('touchend', handleTouchEnd)
      container.removeEventListener('touchcancel', handleTouchCancel)
      clearLongPressTimer()
    }
  }, [
    enabled,
    handleTouchStart,
    handleTouchMove,
    handleTouchEnd,
    handleTouchCancel,
    clearLongPressTimer,
  ])

  return {
    containerRef,
    isTouching: isTouchingRef.current,
  }
}

// ============================================================================
// Utility: Detect touch device
// ============================================================================

/**
 * Check if the current device supports touch
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - msMaxTouchPoints is IE-specific
    navigator.msMaxTouchPoints > 0
  )
}

/**
 * Hook to detect if the current device supports touch
 */
export function useIsTouchDevice(): boolean {
  if (typeof window === 'undefined') return false
  return isTouchDevice()
}
