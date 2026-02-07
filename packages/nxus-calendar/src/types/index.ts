/**
 * types/index.ts - Re-exports all calendar type definitions
 *
 * This is the main entry point for importing types from @nxus/calendar.
 */

// Calendar event types and schemas
export {
  // View types
  CalendarViewSchema,
  type CalendarView,
  TimeFormatSchema,
  type TimeFormat,
  WeekStartSchema,
  type WeekStart,
  CompletedTaskStyleSchema,
  type CompletedTaskStyle,
  // Core event types
  type CalendarEvent,
  CalendarEventSchema,
  type BigCalendarEvent,
  // Input schemas
  CreateCalendarEventInputSchema,
  type CreateCalendarEventInput,
  UpdateCalendarEventInputSchema,
  type UpdateCalendarEventInput,
  CompleteTaskInputSchema,
  type CompleteTaskInput,
  DeleteCalendarEventInputSchema,
  type DeleteCalendarEventInput,
  GetCalendarEventsInputSchema,
  type GetCalendarEventsInput,
  // Response types
  type ServerResponse,
  type GetCalendarEventsResponse,
  type CalendarEventMutationResponse,
  // Utility types
  type DateRange,
  DateRangeSchema,
  type EventDropInfo,
  type EventResizeInfo,
  type SlotSelectInfo,
  // Type guards
  isTaskEvent,
  isRecurringEvent,
  isSyncedToGoogle,
  // Helper functions
  toBigCalendarEvent,
  createDefaultEvent,
} from './calendar-event.js'

// Google sync types and schemas
export {
  // Auth types
  GoogleAuthStateSchema,
  type GoogleAuthState,
  type GoogleTokens,
  GoogleTokensSchema,
  GoogleCallbackInputSchema,
  type GoogleCallbackInput,
  // Sync status types
  EventSyncStatusSchema,
  type EventSyncStatus,
  CalendarSyncStatusSchema,
  type CalendarSyncStatus,
  type SyncStatusInfo,
  SyncStatusInfoSchema,
  // Sync operation types
  SyncToGoogleInputSchema,
  type SyncToGoogleInput,
  type EventSyncResult,
  EventSyncResultSchema,
  type SyncResult,
  SyncResultSchema,
  // Google Calendar API types
  type GoogleCalendarInfo,
  GoogleCalendarInfoSchema,
  type GoogleCalendarEvent,
  GoogleCalendarEventSchema,
  // Response types
  type GetGoogleAuthUrlResponse,
  type HandleGoogleCallbackResponse,
  type GetSyncStatusResponse,
  type GetGoogleCalendarsResponse,
  type SyncToGoogleResponse,
  // Configuration types
  type GoogleSyncConfig,
  GoogleSyncConfigSchema,
  // Type guards
  isGoogleConnected,
  isSyncing,
  hasPendingSync,
  // Helper functions
  createDefaultSyncStatus,
  getSyncStatusMessage,
} from './google-sync.js'
