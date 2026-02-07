/**
 * date-utils.ts - Date manipulation utilities for calendar operations
 *
 * Pure functions for date calculations, timezone conversions, and formatting.
 * Uses date-fns for reliable date operations.
 */

import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  addDays,
  addWeeks,
  addMonths,
  subDays,
  subWeeks,
  subMonths,
  format,
  formatISO,
  parseISO,
  isValid,
  isSameDay,
  isBefore,
  isAfter,
  isWithinInterval,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  setHours,
  setMinutes,
  getHours,
  getMinutes,
} from 'date-fns'
import type { CalendarView, DateRange, WeekStart } from '../types/calendar-event.js'

// ============================================================================
// Date Range Calculations
// ============================================================================

/**
 * Get the visible date range for a calendar view
 *
 * @param view - Calendar view type
 * @param currentDate - The currently focused date
 * @param weekStartsOn - Which day the week starts on (0=Sun, 1=Mon, 6=Sat)
 * @returns Start and end dates for the visible range
 */
export function getDateRange(
  view: CalendarView,
  currentDate: Date,
  weekStartsOn: WeekStart = 0,
): DateRange {
  switch (view) {
    case 'day':
      return {
        start: startOfDay(currentDate),
        end: endOfDay(currentDate),
      }

    case 'week':
      return {
        start: startOfWeek(currentDate, { weekStartsOn }),
        end: endOfWeek(currentDate, { weekStartsOn }),
      }

    case 'month': {
      // For month view, include full weeks at start and end
      const monthStart = startOfMonth(currentDate)
      const monthEnd = endOfMonth(currentDate)
      return {
        start: startOfWeek(monthStart, { weekStartsOn }),
        end: endOfWeek(monthEnd, { weekStartsOn }),
      }
    }

    case 'agenda':
      // Agenda typically shows upcoming events (e.g., next 30 days)
      return {
        start: startOfDay(currentDate),
        end: endOfDay(addDays(currentDate, 30)),
      }

    default:
      return {
        start: startOfDay(currentDate),
        end: endOfDay(currentDate),
      }
  }
}

/**
 * Navigate to the next period based on view type
 */
export function getNextPeriodDate(view: CalendarView, currentDate: Date): Date {
  switch (view) {
    case 'day':
      return addDays(currentDate, 1)
    case 'week':
      return addWeeks(currentDate, 1)
    case 'month':
      return addMonths(currentDate, 1)
    case 'agenda':
      return addDays(currentDate, 7) // Move by a week for agenda
    default:
      return addDays(currentDate, 1)
  }
}

/**
 * Navigate to the previous period based on view type
 */
export function getPreviousPeriodDate(view: CalendarView, currentDate: Date): Date {
  switch (view) {
    case 'day':
      return subDays(currentDate, 1)
    case 'week':
      return subWeeks(currentDate, 1)
    case 'month':
      return subMonths(currentDate, 1)
    case 'agenda':
      return subDays(currentDate, 7)
    default:
      return subDays(currentDate, 1)
  }
}

// ============================================================================
// Timezone Handling
// ============================================================================

/**
 * Convert a local date to UTC ISO string for storage
 */
export function toUTC(date: Date): string {
  return formatISO(date, { representation: 'complete' })
}

/**
 * Parse a UTC ISO string to local Date object
 */
export function fromUTC(isoString: string): Date {
  const parsed = parseISO(isoString)
  if (!isValid(parsed)) {
    throw new Error(`Invalid ISO date string: ${isoString}`)
  }
  return parsed
}

/**
 * Safely parse a date string, returning null if invalid
 */
export function safeParseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return isValid(value) ? value : null

  try {
    const parsed = parseISO(value)
    return isValid(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Get the user's timezone offset in minutes
 */
export function getTimezoneOffset(): number {
  return new Date().getTimezoneOffset()
}

/**
 * Get the user's timezone name (e.g., "America/New_York")
 */
export function getTimezoneName(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format a time range for display
 *
 * @param start - Start time
 * @param end - End time
 * @param use24Hour - Whether to use 24-hour format
 * @returns Formatted time range string (e.g., "9:00 AM - 10:30 AM" or "09:00 - 10:30")
 */
export function formatTimeRange(start: Date, end: Date, use24Hour = false): string {
  const timeFormat = use24Hour ? 'HH:mm' : 'h:mm a'
  const startStr = format(start, timeFormat)
  const endStr = format(end, timeFormat)
  return `${startStr} - ${endStr}`
}

/**
 * Format a date for display in calendar header
 *
 * @param date - Date to format
 * @param view - Current calendar view (affects format)
 * @returns Formatted date string
 */
export function formatCalendarHeader(date: Date, view: CalendarView): string {
  switch (view) {
    case 'day':
      return format(date, 'EEEE, MMMM d, yyyy') // "Saturday, February 1, 2026"

    case 'week': {
      const weekStart = startOfWeek(date)
      const weekEnd = endOfWeek(date)
      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return format(weekStart, 'MMMM yyyy') // "February 2026"
      }
      return `${format(weekStart, 'MMM')} - ${format(weekEnd, 'MMM yyyy')}` // "Jan - Feb 2026"
    }

    case 'month':
      return format(date, 'MMMM yyyy') // "February 2026"

    case 'agenda':
      return format(date, 'MMMM yyyy') // "February 2026"

    default:
      return format(date, 'MMMM d, yyyy')
  }
}

/**
 * Format event duration for display
 *
 * @param start - Event start time
 * @param end - Event end time
 * @returns Human-readable duration (e.g., "1h 30m", "2 days")
 */
export function formatDuration(start: Date, end: Date): string {
  const totalMinutes = differenceInMinutes(end, start)

  if (totalMinutes < 60) {
    return `${totalMinutes}m`
  }

  const days = differenceInDays(end, start)
  if (days >= 1) {
    return `${days} day${days === 1 ? '' : 's'}`
  }

  const hours = differenceInHours(end, start)
  const remainingMinutes = totalMinutes % 60

  if (remainingMinutes === 0) {
    return `${hours}h`
  }

  return `${hours}h ${remainingMinutes}m`
}

/**
 * Format date for event display (date only, no time)
 */
export function formatEventDate(date: Date): string {
  return format(date, 'EEE, MMM d') // "Sat, Feb 1"
}

/**
 * Format time for display
 */
export function formatTime(date: Date, use24Hour = false): string {
  return format(date, use24Hour ? 'HH:mm' : 'h:mm a')
}

// ============================================================================
// Date Comparisons
// ============================================================================

/**
 * Check if two dates are on the same day
 */
export function areSameDay(date1: Date, date2: Date): boolean {
  return isSameDay(date1, date2)
}

/**
 * Check if a date is before another date
 */
export function isDateBefore(date: Date, compareDate: Date): boolean {
  return isBefore(date, compareDate)
}

/**
 * Check if a date is after another date
 */
export function isDateAfter(date: Date, compareDate: Date): boolean {
  return isAfter(date, compareDate)
}

/**
 * Check if a date falls within a range
 */
export function isDateInRange(date: Date, range: DateRange): boolean {
  return isWithinInterval(date, { start: range.start, end: range.end })
}

/**
 * Check if an event overlaps with a date range
 */
export function eventOverlapsRange(
  eventStart: Date,
  eventEnd: Date,
  range: DateRange,
): boolean {
  // Event overlaps if it starts before range ends AND ends after range starts
  return isBefore(eventStart, range.end) && isAfter(eventEnd, range.start)
}

// ============================================================================
// Time Slot Utilities
// ============================================================================

/**
 * Round a date to the nearest time slot
 *
 * @param date - Date to round
 * @param slotMinutes - Size of time slots in minutes (default: 30)
 * @returns Date rounded to nearest slot
 */
export function roundToSlot(date: Date, slotMinutes = 30): Date {
  const minutes = getMinutes(date)
  const roundedMinutes = Math.round(minutes / slotMinutes) * slotMinutes
  return setMinutes(setHours(startOfDay(date), getHours(date)), roundedMinutes)
}

/**
 * Snap a time to the grid (floor to nearest slot)
 */
export function snapToSlot(date: Date, slotMinutes = 30): Date {
  const minutes = getMinutes(date)
  const snappedMinutes = Math.floor(minutes / slotMinutes) * slotMinutes
  return setMinutes(setHours(startOfDay(date), getHours(date)), snappedMinutes)
}

/**
 * Create a default end time from a start time
 * Default duration is 1 hour for events, instant for tasks
 */
export function getDefaultEndTime(startTime: Date, isTask = false): Date {
  if (isTask) {
    return startTime // Tasks are instant by default
  }
  return addHours(startTime, 1)
}

/**
 * Add hours to a date
 */
function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

// ============================================================================
// All-Day Event Utilities
// ============================================================================

/**
 * Convert a datetime to an all-day date (strips time, uses date string format)
 */
export function toAllDayDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * Parse an all-day date string to a Date at midnight
 */
export function parseAllDayDate(dateStr: string): Date {
  const parsed = parseISO(dateStr)
  if (!isValid(parsed)) {
    throw new Error(`Invalid date string: ${dateStr}`)
  }
  return startOfDay(parsed)
}

/**
 * Check if an event spans multiple days
 */
export function isMultiDayEvent(start: Date, end: Date): boolean {
  return !isSameDay(start, end)
}

/**
 * Get the number of days an event spans
 */
export function getEventDayCount(start: Date, end: Date): number {
  return differenceInDays(endOfDay(end), startOfDay(start)) + 1
}

// ============================================================================
// Working Hours Utilities
// ============================================================================

/**
 * Check if a time is within working hours
 */
export function isWithinWorkingHours(
  date: Date,
  workingHoursStart: number,
  workingHoursEnd: number,
): boolean {
  const hour = getHours(date)
  return hour >= workingHoursStart && hour < workingHoursEnd
}

/**
 * Get working hours range for a date
 */
export function getWorkingHoursRange(
  date: Date,
  workingHoursStart: number,
  workingHoursEnd: number,
): DateRange {
  return {
    start: setHours(startOfDay(date), workingHoursStart),
    end: setHours(startOfDay(date), workingHoursEnd),
  }
}
