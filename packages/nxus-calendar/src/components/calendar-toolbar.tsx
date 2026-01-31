/**
 * calendar-toolbar.tsx - Custom toolbar for the calendar
 *
 * Provides:
 * - View switcher (Day | Week | Month | Agenda)
 * - Date navigation (< Today >)
 * - Period label display
 * - Google sync button with status indicators
 */

import { useCallback } from 'react'
import type { ToolbarProps, View } from 'react-big-calendar'
import { Button } from '@nxus/ui'
import { cn } from '@nxus/ui'
import type { BigCalendarEvent } from '../types/calendar-event.js'

// ============================================================================
// Types
// ============================================================================

export interface CalendarToolbarProps extends ToolbarProps<BigCalendarEvent, object> {
  /** Whether Google sync is connected */
  isGoogleConnected?: boolean

  /** Whether sync is in progress */
  isSyncing?: boolean

  /** Number of events pending sync */
  pendingCount?: number

  /** Connected Google email */
  connectedEmail?: string

  /** Sync error message */
  syncError?: string

  /** Called when sync button is clicked */
  onSyncClick?: () => void

  /** Called when connect button is clicked (for non-connected state) */
  onConnectClick?: () => void

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

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

function CloudOffIcon({ className }: { className?: string }) {
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
      <path d="m2 2 20 20" />
      <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
      <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
    </svg>
  )
}

function AlertCircleIcon({ className }: { className?: string }) {
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
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
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
// Google Sync Toolbar Button
// ============================================================================

interface GoogleSyncToolbarButtonProps {
  isConnected: boolean
  isSyncing: boolean
  pendingCount: number
  connectedEmail?: string
  error?: string
  onSyncClick?: () => void
  onConnectClick?: () => void
}

/**
 * Google sync button with status indicators for the toolbar
 */
function GoogleSyncToolbarButton({
  isConnected,
  isSyncing,
  pendingCount,
  connectedEmail,
  error,
  onSyncClick,
  onConnectClick,
}: GoogleSyncToolbarButtonProps) {
  // Error state
  if (error) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onSyncClick}
        className="gap-1.5 text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
        title={error}
      >
        <AlertCircleIcon className="size-3.5" />
        <span className="hidden sm:inline">Error</span>
      </Button>
    )
  }

  // Not connected state
  if (!isConnected) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onConnectClick ?? onSyncClick}
        className="gap-1.5"
        title="Connect to Google Calendar"
      >
        <CloudOffIcon className="size-3.5" />
        <span className="hidden sm:inline">Connect</span>
      </Button>
    )
  }

  // Syncing state
  if (isSyncing) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        className="gap-1.5 cursor-wait"
        title="Syncing with Google Calendar..."
      >
        <SyncIcon className="size-3.5 animate-spin" />
        <span className="hidden sm:inline">Syncing...</span>
      </Button>
    )
  }

  // Connected state
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onSyncClick}
      className="gap-1.5"
      title={
        pendingCount > 0
          ? `Sync ${pendingCount} pending events to Google Calendar`
          : connectedEmail
            ? `Connected as ${connectedEmail}`
            : 'Sync with Google Calendar'
      }
    >
      <GoogleIcon className="size-3.5" />
      <span className="hidden sm:inline">Sync</span>
      {pendingCount > 0 && (
        <span className="ml-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
          {pendingCount}
        </span>
      )}
    </Button>
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
  pendingCount = 0,
  connectedEmail,
  syncError,
  onSyncClick,
  onConnectClick,
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

        {/* Google Sync button */}
        {(onSyncClick || onConnectClick) && (
          <GoogleSyncToolbarButton
            isConnected={isGoogleConnected ?? false}
            isSyncing={isSyncing ?? false}
            pendingCount={pendingCount}
            connectedEmail={connectedEmail}
            error={syncError}
            onSyncClick={onSyncClick}
            onConnectClick={onConnectClick}
          />
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
