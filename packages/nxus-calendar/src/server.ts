/**
 * @nxus/calendar/server - Server-side calendar operations
 *
 * This entry point exports server functions that require Node.js.
 * Only import this from server-side code (*.server.ts files).
 */

// Re-export everything from the main entry point
export * from './index.js'

// Server functions (require Node.js) - CRUD operations only
export * from './server/index.js'

// Google Calendar sync server functions
// These depend on googleapis (Node.js-only), so they're exported separately
export {
  getGoogleAuthUrlServerFn,
  handleGoogleCallbackServerFn,
  getGoogleSyncStatusServerFn,
  syncToGoogleCalendarServerFn,
  disconnectGoogleCalendarServerFn,
  getGoogleCalendarsServerFn,
  setGoogleCalendarIdServerFn,
} from './server/google-sync.server.js'

// Google Sync hooks (these import server functions that use googleapis,
// so they must be imported from the server entry point to avoid
// bundling Node.js-only code into the client)
export {
  useGoogleSyncStatus,
  useGoogleSync,
  useGoogleConnect,
  useGoogleCalendars,
  useGoogleCalendarSync,
  googleSyncKeys,
  type UseGoogleSyncStatusOptions,
  type UseGoogleSyncStatusResult,
  type UseGoogleSyncOptions,
  type UseGoogleSyncResult,
  type UseGoogleConnectResult,
  type UseGoogleCalendarsResult,
  type UseGoogleCalendarSyncOptions,
  type UseGoogleCalendarSyncResult,
} from './hooks/use-google-sync.js'
