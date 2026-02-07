/**
 * google-sync.ts - Type definitions for Google Calendar synchronization
 *
 * Defines types for OAuth flow, sync status, and Google Calendar API interactions.
 */

import { z } from 'zod'

// ============================================================================
// Google Auth Types
// ============================================================================

/**
 * Google OAuth state for the sync flow
 */
export const GoogleAuthStateSchema = z.enum([
  'disconnected', // No Google account connected
  'connecting', // OAuth flow in progress
  'connected', // Successfully connected
  'expired', // Token expired, needs refresh
  'error', // Connection error
])
export type GoogleAuthState = z.infer<typeof GoogleAuthStateSchema>

/**
 * Google OAuth tokens (stored securely)
 */
export interface GoogleTokens {
  accessToken: string
  refreshToken: string
  expiresAt: Date
  scope: string
}

/**
 * Zod schema for token validation
 */
export const GoogleTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.date(),
  scope: z.string(),
})

/**
 * Google OAuth callback input
 */
export const GoogleCallbackInputSchema = z.object({
  /** Authorization code from Google */
  code: z.string(),

  /** State parameter for CSRF protection */
  state: z.string().optional(),
})
export type GoogleCallbackInput = z.infer<typeof GoogleCallbackInputSchema>

// ============================================================================
// Sync Status Types
// ============================================================================

/**
 * Sync status for an individual event
 */
export const EventSyncStatusSchema = z.enum([
  'not_synced', // Event has never been synced
  'synced', // Event is synced and up to date
  'pending', // Event has local changes waiting to sync
  'syncing', // Currently syncing
  'error', // Last sync failed
])
export type EventSyncStatus = z.infer<typeof EventSyncStatusSchema>

/**
 * Overall sync status for the calendar
 */
export const CalendarSyncStatusSchema = z.enum([
  'idle', // No sync in progress
  'syncing', // Sync in progress
  'success', // Last sync succeeded
  'partial', // Last sync had some failures
  'error', // Last sync failed completely
])
export type CalendarSyncStatus = z.infer<typeof CalendarSyncStatusSchema>

/**
 * Detailed sync status with metadata
 */
export interface SyncStatusInfo {
  /** Current sync state */
  status: CalendarSyncStatus

  /** Google account email (if connected) */
  connectedEmail?: string

  /** Google Calendar ID being synced to */
  calendarId?: string

  /** Timestamp of last successful sync */
  lastSyncAt?: Date

  /** Number of events synced in last operation */
  lastSyncCount?: number

  /** Error message if status is error */
  errorMessage?: string

  /** Number of events pending sync */
  pendingCount?: number
}

/**
 * Zod schema for SyncStatusInfo validation
 */
export const SyncStatusInfoSchema = z.object({
  status: CalendarSyncStatusSchema,
  connectedEmail: z.string().optional(),
  calendarId: z.string().optional(),
  lastSyncAt: z.date().optional(),
  lastSyncCount: z.number().optional(),
  errorMessage: z.string().optional(),
  pendingCount: z.number().optional(),
})

// ============================================================================
// Sync Operation Types
// ============================================================================

/**
 * Input for syncing events to Google Calendar
 */
export const SyncToGoogleInputSchema = z.object({
  /** Event IDs to sync (if empty, syncs all visible events) */
  eventIds: z.array(z.string()).optional(),

  /** Target Google Calendar ID (defaults to 'primary') */
  calendarId: z.string().optional().default('primary'),

  /** Force sync even if events appear up to date */
  force: z.boolean().optional().default(false),
})
export type SyncToGoogleInput = z.infer<typeof SyncToGoogleInputSchema>

/**
 * Result of a sync operation for a single event
 */
export interface EventSyncResult {
  /** Event node ID */
  eventId: string

  /** Whether sync succeeded */
  success: boolean

  /** Google Calendar event ID (if created/updated) */
  gcalEventId?: string

  /** Error message if failed */
  error?: string

  /** Operation performed */
  operation: 'created' | 'updated' | 'deleted' | 'skipped'
}

/**
 * Zod schema for EventSyncResult
 */
export const EventSyncResultSchema = z.object({
  eventId: z.string(),
  success: z.boolean(),
  gcalEventId: z.string().optional(),
  error: z.string().optional(),
  operation: z.enum(['created', 'updated', 'deleted', 'skipped']),
})

/**
 * Result of a bulk sync operation
 */
export interface SyncResult {
  /** Overall success (true if all events synced) */
  success: boolean

  /** Number of events successfully synced */
  syncedCount: number

  /** Number of events that failed to sync */
  failedCount: number

  /** Number of events skipped (already up to date) */
  skippedCount: number

  /** Individual results per event */
  results: EventSyncResult[]

  /** Overall error message if complete failure */
  error?: string
}

/**
 * Zod schema for SyncResult
 */
export const SyncResultSchema = z.object({
  success: z.boolean(),
  syncedCount: z.number(),
  failedCount: z.number(),
  skippedCount: z.number(),
  results: z.array(EventSyncResultSchema),
  error: z.string().optional(),
})

// ============================================================================
// Google Calendar API Types
// ============================================================================

/**
 * Google Calendar list entry (for calendar selection)
 */
export interface GoogleCalendarInfo {
  /** Calendar ID */
  id: string

  /** Calendar display name */
  summary: string

  /** Whether this is the primary calendar */
  primary?: boolean

  /** Calendar color */
  backgroundColor?: string

  /** Access role */
  accessRole: 'reader' | 'writer' | 'owner'
}

/**
 * Zod schema for GoogleCalendarInfo
 */
export const GoogleCalendarInfoSchema = z.object({
  id: z.string(),
  summary: z.string(),
  primary: z.boolean().optional(),
  backgroundColor: z.string().optional(),
  accessRole: z.enum(['reader', 'writer', 'owner']),
})

/**
 * Google Calendar event representation (subset of full API)
 */
export interface GoogleCalendarEvent {
  /** Google event ID */
  id: string

  /** Event summary/title */
  summary: string

  /** Event description */
  description?: string

  /** Start time */
  start: {
    dateTime?: string // For timed events (ISO 8601)
    date?: string // For all-day events (YYYY-MM-DD)
    timeZone?: string
  }

  /** End time */
  end: {
    dateTime?: string
    date?: string
    timeZone?: string
  }

  /** Recurrence rule */
  recurrence?: string[]

  /** Event status */
  status?: 'confirmed' | 'tentative' | 'cancelled'

  /** HTML link to event */
  htmlLink?: string

  /** When the event was created */
  created?: string

  /** When the event was last updated */
  updated?: string
}

/**
 * Zod schema for GoogleCalendarEvent
 */
export const GoogleCalendarEventSchema = z.object({
  id: z.string(),
  summary: z.string(),
  description: z.string().optional(),
  start: z.object({
    dateTime: z.string().optional(),
    date: z.string().optional(),
    timeZone: z.string().optional(),
  }),
  end: z.object({
    dateTime: z.string().optional(),
    date: z.string().optional(),
    timeZone: z.string().optional(),
  }),
  recurrence: z.array(z.string()).optional(),
  status: z.enum(['confirmed', 'tentative', 'cancelled']).optional(),
  htmlLink: z.string().optional(),
  created: z.string().optional(),
  updated: z.string().optional(),
})

// ============================================================================
// Server Response Types
// ============================================================================

/**
 * Response type for Google auth URL
 */
export interface GetGoogleAuthUrlResponse {
  success: boolean
  url?: string
  error?: string
}

/**
 * Response type for Google OAuth callback
 */
export interface HandleGoogleCallbackResponse {
  success: boolean
  email?: string
  error?: string
}

/**
 * Response type for sync status check
 */
export interface GetSyncStatusResponse {
  success: boolean
  data?: SyncStatusInfo
  error?: string
}

/**
 * Response type for calendar list
 */
export interface GetGoogleCalendarsResponse {
  success: boolean
  calendars?: GoogleCalendarInfo[]
  error?: string
}

/**
 * Response type for sync operation
 */
export interface SyncToGoogleResponse {
  success: boolean
  data?: SyncResult
  error?: string
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Google Calendar sync configuration
 */
export interface GoogleSyncConfig {
  /** Whether sync is enabled */
  enabled: boolean

  /** Target calendar ID */
  calendarId: string

  /** Whether to auto-sync on event changes */
  autoSync: boolean

  /** Sync interval in minutes (0 = manual only) */
  syncInterval: number
}

/**
 * Zod schema for GoogleSyncConfig
 */
export const GoogleSyncConfigSchema = z.object({
  enabled: z.boolean(),
  calendarId: z.string(),
  autoSync: z.boolean(),
  syncInterval: z.number().min(0),
})

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if Google is connected and ready to sync
 */
export function isGoogleConnected(status: SyncStatusInfo): boolean {
  return !!status.connectedEmail && status.status !== 'error'
}

/**
 * Check if a sync is currently in progress
 */
export function isSyncing(status: SyncStatusInfo): boolean {
  return status.status === 'syncing'
}

/**
 * Check if there are events pending sync
 */
export function hasPendingSync(status: SyncStatusInfo): boolean {
  return (status.pendingCount ?? 0) > 0
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create default sync status (disconnected)
 */
export function createDefaultSyncStatus(): SyncStatusInfo {
  return {
    status: 'idle',
  }
}

/**
 * Get human-readable sync status message
 */
export function getSyncStatusMessage(status: SyncStatusInfo): string {
  switch (status.status) {
    case 'idle':
      if (!status.connectedEmail) {
        return 'Not connected to Google Calendar'
      }
      if (status.lastSyncAt) {
        return `Last synced ${formatRelativeTime(status.lastSyncAt)}`
      }
      return 'Ready to sync'

    case 'syncing':
      return 'Syncing...'

    case 'success':
      return `Synced ${status.lastSyncCount ?? 0} events`

    case 'partial':
      return 'Some events failed to sync'

    case 'error':
      return status.errorMessage ?? 'Sync failed'

    default:
      return 'Unknown status'
  }
}

/**
 * Format a date as relative time (simplified)
 */
function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / (1000 * 60))
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}
