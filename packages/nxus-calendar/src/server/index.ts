/**
 * @nxus/calendar/server - Server function exports
 *
 * Re-exports all server functions for calendar operations.
 */

// Calendar event CRUD operations
export {
  getCalendarEventsServerFn,
  createCalendarEventServerFn,
  updateCalendarEventServerFn,
  deleteCalendarEventServerFn,
  completeTaskServerFn,
  getCalendarEventServerFn,
} from './calendar.server.js'

// Google Calendar sync operations
export {
  getGoogleAuthUrlServerFn,
  handleGoogleCallbackServerFn,
  getGoogleSyncStatusServerFn,
  syncToGoogleCalendarServerFn,
  disconnectGoogleCalendarServerFn,
  getGoogleCalendarsServerFn,
  setGoogleCalendarIdServerFn,
} from './google-sync.server.js'
