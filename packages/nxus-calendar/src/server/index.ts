/**
 * @nxus/calendar/server - Server function exports
 *
 * Re-exports all server functions for calendar operations.
 *
 * NOTE: Google Calendar sync operations are NOT exported here because they
 * depend on the `googleapis` package which is Node.js-only. Import them
 * separately from './google-sync.server.js' when needed.
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

// Google Calendar sync operations are exported from google-sync.server.js
// but NOT re-exported here to prevent googleapis from being bundled into client code.
// Import directly: import { ... } from '@nxus/calendar/server/google-sync'
