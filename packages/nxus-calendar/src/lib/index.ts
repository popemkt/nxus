/**
 * lib/index.ts - Re-exports all calendar utility functions
 *
 * This is the main entry point for importing utilities from @nxus/calendar.
 * All functions here are pure (no React dependencies) and can be used
 * in both client and server code.
 */

// Date utilities
export {
  // Date range calculations
  getDateRange,
  getNextPeriodDate,
  getPreviousPeriodDate,
  // Timezone handling
  toUTC,
  fromUTC,
  safeParseDate,
  getTimezoneOffset,
  getTimezoneName,
  // Formatting
  formatTimeRange,
  formatCalendarHeader,
  formatDuration,
  formatEventDate,
  formatTime,
  // Date comparisons
  areSameDay,
  isDateBefore,
  isDateAfter,
  isDateInRange,
  eventOverlapsRange,
  // Time slot utilities
  roundToSlot,
  snapToSlot,
  getDefaultEndTime,
  // All-day event utilities
  toAllDayDate,
  parseAllDayDate,
  isMultiDayEvent,
  getEventDayCount,
  // Working hours utilities
  isWithinWorkingHours,
  getWorkingHoursRange,
} from './date-utils.js'

// RRULE utilities
export {
  // Types
  type RecurrenceFrequency,
  type Weekday,
  type RecurrencePattern,
  // Parsing
  parseRRule,
  parseToPattern,
  // Building
  buildRRule,
  createDailyRule,
  createWeeklyRule,
  createMonthlyRule,
  createWeekdayRule,
  // Expansion
  expandRecurrence,
  getNextInstance,
  getPreviousInstance,
  isOccurrence,
  // Formatting
  formatRRuleHumanReadable,
  formatPatternHumanReadable,
  formatRRuleShort,
  // Validation
  isValidRRule,
  hasEndCondition,
  getRecurrenceEnd,
  // Presets
  RECURRENCE_PRESETS,
  RECURRENCE_PRESET_LABELS,
} from './rrule-utils.js'

// Query builder utilities
export {
  // Types
  type CalendarQueryOptions,
  // Constants
  DEFAULT_DONE_STATUSES,
  DEFAULT_CALENDAR_QUERY_LIMIT,
  // Query builders
  buildCalendarQuery,
  buildEventByIdQuery,
  buildTasksQuery,
  buildEventsOnlyQuery,
  buildPendingSyncQuery,
  buildSyncedEventsQuery,
  // Filter helpers
  createDateRangeFilter,
  addFilterToCalendarQuery,
  combineQueriesWithOr,
} from './query-builder.js'
