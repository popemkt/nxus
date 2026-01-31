/**
 * calendar-toolbar.tsx - Custom toolbar for the calendar
 *
 * Provides:
 * - View switcher (Day | Week | Month | Agenda)
 * - Date navigation (< Today >)
 * - Period label display
 * - Google sync button (placeholder for future implementation)
 */

import { useCallback } from 'react'
import type { ToolbarProps, View } from 'react-big-calendar'
import { Button } from '@nxus/ui'
import { cn } from '@nxus/ui'
import type { BigCalendarEvent, CalendarView } from '../types/calendar-event.js'

// ============================================================================
// Types
// ============================================================================

export interface CalendarToolbarProps extends ToolbarProps<BigCalendarEvent, object> {
  /** Whether Google sync is connected */
  isGoogleConnected?: boolean

  /** Whether sync is in progress */
  isSyncing?: boolean

  /** Called when sync button is clicked */
  onSyncClick?: () => void

  /** Called when settings button is clicked */
  onSettingsClick?: () => void

  /** Custom class name */
  className?: string
}

// ============================================================================
// View Labels
// ============================================================================

const viewLabels: Record<View, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
  agenda: 'Agenda',
  work_week: 'Work Week',
}

// ============================================================================
// Icons
// ============================================================================

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  )
}

function SyncIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function SettingsIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * Custom toolbar for the calendar component.
 *
 * Replaces the default react-big-calendar toolbar with a styled version
 * that matches the Nxus design system.
 *
 * @example
 * ```tsx
 * <Calendar
 *   components={{
 *     toolbar: (props) => (
 *       <CalendarToolbar
 *         {...props}
 *         isGoogleConnected={isConnected}
 *         onSyncClick={handleSync}
 *         onSettingsClick={() => setSettingsOpen(true)}
 *       />
 *     ),
 *   }}
 * />
 * ```
 */
export function CalendarToolbar({
  label,
  view,
  views,
  onNavigate,
  onView,
  isGoogleConnected,
  isSyncing,
  onSyncClick,
  onSettingsClick,
  className,
}: CalendarToolbarProps) {
  // Handle navigation
  const goToBack = useCallback(() => {
    onNavigate('PREV')
  }, [onNavigate])

  const goToNext = useCallback(() => {
    onNavigate('NEXT')
  }, [onNavigate])

  const goToToday = useCallback(() => {
    onNavigate('TODAY')
  }, [onNavigate])

  // Handle view change
  const handleViewChange = useCallback(
    (newView: View) => {
      onView(newView)
    },
    [onView]
  )

  // Get available views
  const availableViews = Array.isArray(views)
    ? views
    : Object.keys(views || {}).filter(
        (v) => (views as Record<string, boolean>)?.[v]
      )

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-2 sm:gap-4 sm:p-3',
        className
      )}
    >
      {/* Left section: Navigation */}
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          onClick={goToBack}
          aria-label="Previous"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={goToToday}
          className="px-3"
        >
          Today
        </Button>

        <Button
          variant="outline"
          size="icon-sm"
          onClick={goToNext}
          aria-label="Next"
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      {/* Center section: Period label */}
      <div className="order-first min-w-0 flex-1 text-center sm:order-none">
        <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
          {label}
        </h2>
      </div>

      {/* Right section: View switcher and actions */}
      <div className="flex items-center gap-2">
        {/* View switcher */}
        <div className="hidden rounded-md border border-border sm:flex">
          {availableViews.map((v) => (
            <Button
              key={v}
              variant={view === v ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewChange(v as View)}
              className={cn(
                'rounded-none border-r border-border px-3 last:border-r-0',
                'first:rounded-l-md last:rounded-r-md',
                view === v && 'pointer-events-none'
              )}
            >
              {viewLabels[v as View] || v}
            </Button>
          ))}
        </div>

        {/* Mobile view selector (dropdown) */}
        <div className="sm:hidden">
          <select
            value={view}
            onChange={(e) => handleViewChange(e.target.value as View)}
            className="h-7 rounded-md border border-border bg-background px-2 text-xs text-foreground"
          >
            {availableViews.map((v) => (
              <option key={v} value={v}>
                {viewLabels[v as View] || v}
              </option>
            ))}
          </select>
        </div>

        {/* Sync button */}
        {onSyncClick && (
          <Button
            variant="outline"
            size="sm"
            onClick={onSyncClick}
            disabled={isSyncing}
            className={cn('gap-1.5', isSyncing && 'cursor-wait')}
            title={
              isGoogleConnected
                ? 'Sync with Google Calendar'
                : 'Connect Google Calendar'
            }
          >
            <SyncIcon
              className={cn('size-3.5', isSyncing && 'animate-spin')}
            />
            <span className="hidden sm:inline">
              {isGoogleConnected ? 'Sync' : 'Connect'}
            </span>
          </Button>
        )}

        {/* Settings button */}
        {onSettingsClick && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onSettingsClick}
            aria-label="Calendar settings"
          >
            <SettingsIcon className="size-4" />
          </Button>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Minimal Toolbar Variant
// ============================================================================

export interface MinimalToolbarProps {
  /** Current period label */
  label: string

  /** Called when navigating backward */
  onPrev: () => void

  /** Called when navigating to today */
  onToday: () => void

  /** Called when navigating forward */
  onNext: () => void

  /** Whether today button should be highlighted */
  isToday?: boolean

  /** Custom class name */
  className?: string
}

/**
 * A minimal toolbar variant for embedded calendar views.
 * Shows only navigation controls and the period label.
 */
export function MinimalToolbar({
  label,
  onPrev,
  onToday,
  onNext,
  isToday,
  className,
}: MinimalToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 py-2',
        className
      )}
    >
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onPrev}
          aria-label="Previous"
        >
          <ChevronLeftIcon className="size-4" />
        </Button>

        <Button
          variant={isToday ? 'default' : 'ghost'}
          size="icon-sm"
          onClick={onToday}
          aria-label="Today"
        >
          <CalendarIcon className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onNext}
          aria-label="Next"
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </div>

      <span className="text-sm font-medium text-foreground">{label}</span>
    </div>
  )
}
