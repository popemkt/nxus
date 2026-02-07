/**
 * use-keyboard-shortcuts.ts - Keyboard navigation for the calendar
 *
 * Provides keyboard shortcuts for common calendar actions:
 * - n: Create new event
 * - t: Go to today
 * - d/w/m/a: Switch views (day/week/month/agenda)
 * - Arrow keys: Navigate between periods
 * - Escape: Close modals
 */

import { useEffect, useCallback } from 'react'
import type { CalendarView } from '../types/calendar-event.js'

// ============================================================================
// Types
// ============================================================================

export interface KeyboardShortcutOptions {
  /** Callback when 'n' is pressed (new event) */
  onNewEvent?: () => void

  /** Callback when 't' is pressed (go to today) */
  onGoToToday?: () => void

  /** Callback when view shortcut is pressed */
  onViewChange?: (view: CalendarView) => void

  /** Callback when left arrow is pressed (previous period) */
  onPrevPeriod?: () => void

  /** Callback when right arrow is pressed (next period) */
  onNextPeriod?: () => void

  /** Callback when escape is pressed */
  onEscape?: () => void

  /** Callback when enter is pressed on selected event */
  onEnter?: () => void

  /** Whether shortcuts are enabled (default: true) */
  enabled?: boolean
}

// ============================================================================
// Shortcut Definitions
// ============================================================================

const VIEW_SHORTCUTS: Record<string, CalendarView> = {
  d: 'day',
  w: 'week',
  m: 'month',
  a: 'agenda',
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for keyboard shortcut support in the calendar
 *
 * @param options - Keyboard shortcut callbacks
 *
 * @example
 * ```tsx
 * useKeyboardShortcuts({
 *   onNewEvent: () => setCreateModalOpen(true),
 *   onGoToToday: () => goToToday(),
 *   onViewChange: (view) => setView(view),
 *   onPrevPeriod: () => prevPeriod(),
 *   onNextPeriod: () => nextPeriod(),
 *   onEscape: () => closeModal(),
 * })
 * ```
 */
export function useKeyboardShortcuts(options: KeyboardShortcutOptions = {}): void {
  const {
    onNewEvent,
    onGoToToday,
    onViewChange,
    onPrevPeriod,
    onNextPeriod,
    onEscape,
    onEnter,
    enabled = true,
  } = options

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return

      // Don't handle shortcuts when typing in an input
      const target = event.target as HTMLElement
      const isInputElement =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable

      if (isInputElement) return

      // Check for modifier keys - most shortcuts shouldn't fire with modifiers
      const hasModifier = event.ctrlKey || event.metaKey || event.altKey

      const key = event.key.toLowerCase()

      // Handle escape (works with or without focus)
      if (key === 'escape' && onEscape) {
        event.preventDefault()
        onEscape()
        return
      }

      // Handle enter
      if (key === 'enter' && onEnter && !hasModifier) {
        event.preventDefault()
        onEnter()
        return
      }

      // Don't handle other shortcuts with modifiers
      if (hasModifier) return

      // Handle 'n' for new event
      if (key === 'n' && onNewEvent) {
        event.preventDefault()
        onNewEvent()
        return
      }

      // Handle 't' for today
      if (key === 't' && onGoToToday) {
        event.preventDefault()
        onGoToToday()
        return
      }

      // Handle view shortcuts (d, w, m, a)
      if (VIEW_SHORTCUTS[key] && onViewChange) {
        event.preventDefault()
        onViewChange(VIEW_SHORTCUTS[key])
        return
      }

      // Handle arrow keys for navigation
      if (key === 'arrowleft' && onPrevPeriod) {
        event.preventDefault()
        onPrevPeriod()
        return
      }

      if (key === 'arrowright' && onNextPeriod) {
        event.preventDefault()
        onNextPeriod()
        return
      }
    },
    [
      enabled,
      onNewEvent,
      onGoToToday,
      onViewChange,
      onPrevPeriod,
      onNextPeriod,
      onEscape,
      onEnter,
    ]
  )

  useEffect(() => {
    if (!enabled) return

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [enabled, handleKeyDown])
}

// ============================================================================
// Shortcut Help
// ============================================================================

export interface ShortcutInfo {
  key: string
  description: string
  modifier?: 'ctrl' | 'shift' | 'alt' | 'meta'
}

/**
 * List of available keyboard shortcuts for help display
 */
export const CALENDAR_SHORTCUTS: ShortcutInfo[] = [
  { key: 'n', description: 'Create new event' },
  { key: 't', description: 'Go to today' },
  { key: 'd', description: 'Switch to day view' },
  { key: 'w', description: 'Switch to week view' },
  { key: 'm', description: 'Switch to month view' },
  { key: 'a', description: 'Switch to agenda view' },
  { key: '←', description: 'Previous period' },
  { key: '→', description: 'Next period' },
  { key: 'Esc', description: 'Close modal / deselect' },
]

/**
 * Format a shortcut for display
 */
export function formatShortcut(shortcut: ShortcutInfo): string {
  const parts: string[] = []

  if (shortcut.modifier === 'ctrl' || shortcut.modifier === 'meta') {
    // Use Cmd on Mac, Ctrl elsewhere
    const isMac =
      typeof navigator !== 'undefined' &&
      navigator.platform.toUpperCase().includes('MAC')
    parts.push(isMac ? '⌘' : 'Ctrl')
  } else if (shortcut.modifier === 'shift') {
    parts.push('⇧')
  } else if (shortcut.modifier === 'alt') {
    const isMac =
      typeof navigator !== 'undefined' &&
      navigator.platform.toUpperCase().includes('MAC')
    parts.push(isMac ? '⌥' : 'Alt')
  }

  parts.push(shortcut.key.toUpperCase())

  return parts.join(' + ')
}
