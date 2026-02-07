/**
 * sync-status-badge.tsx - Sync status indicators for calendar events
 *
 * Provides visual indicators for Google Calendar sync status:
 * - Individual event sync status badges
 * - Overall sync status indicator
 * - Connection status display
 */

import { cn } from '@nxus/ui'
import type { EventSyncStatus } from '../types/google-sync.js'

// ============================================================================
// Types
// ============================================================================

export interface SyncStatusBadgeProps {
  /** Sync status of the event */
  status: EventSyncStatus

  /** Whether the event has a Google Calendar ID */
  hasGcalId?: boolean

  /** Last sync timestamp */
  lastSyncAt?: Date

  /** Custom class name */
  className?: string

  /** Size variant */
  size?: 'sm' | 'md'

  /** Whether to show tooltip */
  showTooltip?: boolean
}

export interface SyncIndicatorProps {
  /** Whether synced to Google Calendar */
  isSynced: boolean

  /** Google Calendar event ID */
  gcalEventId?: string

  /** Last sync timestamp */
  gcalSyncedAt?: Date

  /** Custom class name */
  className?: string
}

export interface ConnectionStatusProps {
  /** Whether connected to Google */
  isConnected: boolean

  /** Connected email address */
  email?: string

  /** Whether currently syncing */
  isSyncing?: boolean

  /** Number of events pending sync */
  pendingCount?: number

  /** Error message if any */
  errorMessage?: string

  /** Custom class name */
  className?: string

  /** Size variant */
  size?: 'sm' | 'md' | 'lg'
}

// ============================================================================
// Icons
// ============================================================================

function CheckCircleIcon({ className }: { className?: string }) {
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
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function CloudIcon({ className }: { className?: string }) {
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
      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
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

function RefreshIcon({ className }: { className?: string }) {
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

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a date as relative time (e.g., "2 min ago", "1 hour ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

/**
 * Get tooltip text for sync status
 */
function getSyncTooltip(
  status: EventSyncStatus,
  lastSyncAt?: Date
): string {
  switch (status) {
    case 'synced':
      return lastSyncAt
        ? `Synced ${formatRelativeTime(lastSyncAt)}`
        : 'Synced with Google Calendar'
    case 'pending':
      return 'Changes pending sync'
    case 'syncing':
      return 'Syncing to Google Calendar...'
    case 'error':
      return 'Sync failed - click to retry'
    case 'not_synced':
    default:
      return 'Not synced to Google Calendar'
  }
}

// ============================================================================
// SyncStatusBadge Component
// ============================================================================

/**
 * Badge showing sync status for individual events
 *
 * @example
 * ```tsx
 * <SyncStatusBadge status="synced" lastSyncAt={event.gcalSyncedAt} />
 * ```
 */
export function SyncStatusBadge({
  status,
  hasGcalId,
  lastSyncAt,
  className,
  size = 'sm',
  showTooltip = true,
}: SyncStatusBadgeProps) {
  // Determine effective status based on gcalId
  const effectiveStatus: EventSyncStatus =
    status === 'not_synced' && hasGcalId ? 'synced' : status

  const sizeClasses = {
    sm: 'h-3.5 w-3.5',
    md: 'h-4 w-4',
  }

  const iconSize = sizeClasses[size]
  const tooltip = showTooltip ? getSyncTooltip(effectiveStatus, lastSyncAt) : undefined

  switch (effectiveStatus) {
    case 'synced':
      return (
        <span
          className={cn('inline-flex items-center text-green-600', className)}
          title={tooltip}
        >
          <CheckCircleIcon className={iconSize} />
        </span>
      )

    case 'pending':
      return (
        <span
          className={cn('inline-flex items-center text-amber-500', className)}
          title={tooltip}
        >
          <CloudIcon className={iconSize} />
        </span>
      )

    case 'syncing':
      return (
        <span
          className={cn('inline-flex items-center text-blue-500', className)}
          title={tooltip}
        >
          <RefreshIcon className={cn(iconSize, 'animate-spin')} />
        </span>
      )

    case 'error':
      return (
        <span
          className={cn('inline-flex items-center text-red-500', className)}
          title={tooltip}
        >
          <AlertCircleIcon className={iconSize} />
        </span>
      )

    case 'not_synced':
    default:
      return (
        <span
          className={cn(
            'inline-flex items-center text-muted-foreground/50',
            className
          )}
          title={tooltip}
        >
          <CloudOffIcon className={iconSize} />
        </span>
      )
  }
}

// ============================================================================
// SyncIndicator Component
// ============================================================================

/**
 * Simple sync indicator for event cards/blocks
 *
 * Shows a small icon indicating if the event is synced to Google Calendar.
 *
 * @example
 * ```tsx
 * <SyncIndicator
 *   isSynced={!!event.gcalEventId}
 *   gcalSyncedAt={event.gcalSyncedAt}
 * />
 * ```
 */
export function SyncIndicator({
  isSynced,
  gcalEventId,
  gcalSyncedAt,
  className,
}: SyncIndicatorProps) {
  if (!isSynced && !gcalEventId) {
    return null // Don't show anything for non-synced events
  }

  const tooltip = gcalSyncedAt
    ? `Synced ${formatRelativeTime(gcalSyncedAt)}`
    : 'Synced with Google Calendar'

  return (
    <span
      className={cn(
        'inline-flex items-center text-green-600/80',
        className
      )}
      title={tooltip}
    >
      <GoogleIcon className="h-3 w-3" />
    </span>
  )
}

// ============================================================================
// ConnectionStatus Component
// ============================================================================

/**
 * Display component for Google Calendar connection status
 *
 * Shows connection state, syncing status, and pending event count.
 *
 * @example
 * ```tsx
 * <ConnectionStatus
 *   isConnected={true}
 *   email="user@gmail.com"
 *   isSyncing={false}
 *   pendingCount={3}
 * />
 * ```
 */
export function ConnectionStatus({
  isConnected,
  email,
  isSyncing,
  pendingCount = 0,
  errorMessage,
  className,
  size = 'md',
}: ConnectionStatusProps) {
  const sizeClasses = {
    sm: {
      container: 'gap-1.5 text-xs',
      icon: 'h-3.5 w-3.5',
      badge: 'px-1.5 py-0.5 text-[10px]',
    },
    md: {
      container: 'gap-2 text-sm',
      icon: 'h-4 w-4',
      badge: 'px-2 py-0.5 text-xs',
    },
    lg: {
      container: 'gap-2.5 text-base',
      icon: 'h-5 w-5',
      badge: 'px-2.5 py-1 text-sm',
    },
  }

  const sizes = sizeClasses[size]

  // Error state
  if (errorMessage) {
    return (
      <div
        className={cn(
          'inline-flex items-center text-red-500',
          sizes.container,
          className
        )}
        title={errorMessage}
      >
        <AlertCircleIcon className={sizes.icon} />
        <span className="truncate max-w-[150px]">Error</span>
      </div>
    )
  }

  // Not connected
  if (!isConnected) {
    return (
      <div
        className={cn(
          'inline-flex items-center text-muted-foreground',
          sizes.container,
          className
        )}
      >
        <CloudOffIcon className={sizes.icon} />
        <span>Not connected</span>
      </div>
    )
  }

  // Syncing
  if (isSyncing) {
    return (
      <div
        className={cn(
          'inline-flex items-center text-blue-500',
          sizes.container,
          className
        )}
      >
        <RefreshIcon className={cn(sizes.icon, 'animate-spin')} />
        <span>Syncing...</span>
      </div>
    )
  }

  // Connected
  return (
    <div
      className={cn(
        'inline-flex items-center text-green-600',
        sizes.container,
        className
      )}
    >
      <GoogleIcon className={sizes.icon} />
      <span className="truncate max-w-[150px]">{email || 'Connected'}</span>
      {pendingCount > 0 && (
        <span
          className={cn(
            'rounded-full bg-amber-100 text-amber-700 font-medium',
            sizes.badge
          )}
          title={`${pendingCount} events pending sync`}
        >
          {pendingCount}
        </span>
      )}
    </div>
  )
}

// ============================================================================
// SyncButton Component
// ============================================================================

export interface SyncButtonProps {
  /** Whether connected to Google */
  isConnected: boolean

  /** Whether currently syncing */
  isSyncing?: boolean

  /** Number of pending events */
  pendingCount?: number

  /** Click handler */
  onClick?: () => void

  /** Button disabled state */
  disabled?: boolean

  /** Custom class name */
  className?: string

  /** Variant */
  variant?: 'default' | 'outline' | 'ghost'

  /** Size */
  size?: 'sm' | 'md'

  /** Whether to show the label */
  showLabel?: boolean
}

/**
 * Button for triggering Google Calendar sync
 *
 * Shows different states based on connection and sync status.
 *
 * @example
 * ```tsx
 * <SyncButton
 *   isConnected={isConnected}
 *   isSyncing={isSyncing}
 *   pendingCount={3}
 *   onClick={handleSync}
 * />
 * ```
 */
export function SyncButton({
  isConnected,
  isSyncing,
  pendingCount = 0,
  onClick,
  disabled,
  className,
  variant = 'outline',
  size = 'sm',
  showLabel = true,
}: SyncButtonProps) {
  const sizeClasses = {
    sm: {
      button: 'h-8 px-3 text-sm',
      icon: 'h-3.5 w-3.5',
      badge: 'ml-1.5 px-1.5 py-0.5 text-[10px]',
    },
    md: {
      button: 'h-9 px-4 text-sm',
      icon: 'h-4 w-4',
      badge: 'ml-2 px-2 py-0.5 text-xs',
    },
  }

  const sizes = sizeClasses[size]

  const variantClasses = {
    default:
      'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
    outline:
      'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
  }

  const label = isConnected ? (isSyncing ? 'Syncing...' : 'Sync') : 'Connect'

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || isSyncing}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2',
        'focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        sizes.button,
        variantClasses[variant],
        isSyncing && 'cursor-wait',
        className
      )}
      title={
        isConnected
          ? pendingCount > 0
            ? `Sync ${pendingCount} pending events`
            : 'Sync with Google Calendar'
          : 'Connect to Google Calendar'
      }
    >
      {isSyncing ? (
        <RefreshIcon className={cn(sizes.icon, 'animate-spin')} />
      ) : isConnected ? (
        <GoogleIcon className={sizes.icon} />
      ) : (
        <CloudIcon className={sizes.icon} />
      )}

      {showLabel && <span>{label}</span>}

      {isConnected && pendingCount > 0 && !isSyncing && (
        <span
          className={cn(
            'rounded-full bg-amber-100 text-amber-700 font-medium',
            sizes.badge
          )}
        >
          {pendingCount}
        </span>
      )}
    </button>
  )
}
