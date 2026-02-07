import { describe, it, expect } from 'vitest'
import {
  getDateRange,
  getNextPeriodDate,
  getPreviousPeriodDate,
  toUTC,
  fromUTC,
  safeParseDate,
  formatTimeRange,
  formatCalendarHeader,
  formatDuration,
  formatEventDate,
  formatTime,
  areSameDay,
  isDateBefore,
  isDateAfter,
  isDateInRange,
  eventOverlapsRange,
  roundToSlot,
  snapToSlot,
  getDefaultEndTime,
  toAllDayDate,
  parseAllDayDate,
  isMultiDayEvent,
  getEventDayCount,
  isWithinWorkingHours,
  getWorkingHoursRange,
} from './date-utils.js'

// ============================================================================
// getDateRange
// ============================================================================

describe('getDateRange', () => {
  const date = new Date(2026, 1, 7, 14, 30) // Feb 7, 2026, 2:30 PM

  it('returns start/end of day for day view', () => {
    const range = getDateRange('day', date)
    expect(range.start.getHours()).toBe(0)
    expect(range.start.getMinutes()).toBe(0)
    expect(range.end.getHours()).toBe(23)
    expect(range.end.getMinutes()).toBe(59)
    expect(range.start.getDate()).toBe(7)
    expect(range.end.getDate()).toBe(7)
  })

  it('returns start/end of week for week view', () => {
    const range = getDateRange('week', date)
    // Default weekStartsOn=0 (Sunday)
    expect(range.start.getDay()).toBe(0) // Sunday
    expect(range.end.getDay()).toBe(6) // Saturday
  })

  it('respects weekStartsOn for week view', () => {
    const range = getDateRange('week', date, 1) // Monday start
    expect(range.start.getDay()).toBe(1) // Monday
    expect(range.end.getDay()).toBe(0) // Sunday
  })

  it('returns full weeks around month for month view', () => {
    const range = getDateRange('month', date)
    // February 2026 starts on a Sunday (weekStartsOn=0)
    // Should include the whole first and last weeks of the month
    expect(range.start.getDate()).toBeLessThanOrEqual(1)
    expect(range.end.getMonth()).toBeGreaterThanOrEqual(1) // At least February
  })

  it('returns 30-day range for agenda view', () => {
    const range = getDateRange('agenda', date)
    // startOfDay(date) to endOfDay(date + 30) spans ~31 calendar days
    const diffMs = range.end.getTime() - range.start.getTime()
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))
    expect(diffDays).toBeGreaterThanOrEqual(30)
    expect(diffDays).toBeLessThanOrEqual(31)
  })

  it('falls back to day view for unknown view type', () => {
    const range = getDateRange('unknown' as any, date)
    expect(range.start.getDate()).toBe(7)
    expect(range.end.getDate()).toBe(7)
  })
})

// ============================================================================
// getNextPeriodDate / getPreviousPeriodDate
// ============================================================================

describe('getNextPeriodDate', () => {
  const date = new Date(2026, 1, 7) // Feb 7, 2026

  it('adds 1 day for day view', () => {
    const next = getNextPeriodDate('day', date)
    expect(next.getDate()).toBe(8)
  })

  it('adds 1 week for week view', () => {
    const next = getNextPeriodDate('week', date)
    expect(next.getDate()).toBe(14)
  })

  it('adds 1 month for month view', () => {
    const next = getNextPeriodDate('month', date)
    expect(next.getMonth()).toBe(2) // March
  })

  it('adds 7 days for agenda view', () => {
    const next = getNextPeriodDate('agenda', date)
    expect(next.getDate()).toBe(14)
  })
})

describe('getPreviousPeriodDate', () => {
  const date = new Date(2026, 1, 7) // Feb 7, 2026

  it('subtracts 1 day for day view', () => {
    const prev = getPreviousPeriodDate('day', date)
    expect(prev.getDate()).toBe(6)
  })

  it('subtracts 1 week for week view', () => {
    const prev = getPreviousPeriodDate('week', date)
    expect(prev.getDate()).toBe(31) // Jan 31
    expect(prev.getMonth()).toBe(0) // January
  })

  it('subtracts 1 month for month view', () => {
    const prev = getPreviousPeriodDate('month', date)
    expect(prev.getMonth()).toBe(0) // January
  })

  it('subtracts 7 days for agenda view', () => {
    const prev = getPreviousPeriodDate('agenda', date)
    expect(prev.getDate()).toBe(31) // Jan 31
  })
})

// ============================================================================
// Timezone Handling
// ============================================================================

describe('toUTC', () => {
  it('returns an ISO string', () => {
    const date = new Date(2026, 0, 15, 10, 30)
    const result = toUTC(date)
    expect(result).toContain('2026-01-15')
    expect(typeof result).toBe('string')
  })
})

describe('fromUTC', () => {
  it('parses a valid ISO string', () => {
    const result = fromUTC('2026-01-15T10:30:00Z')
    expect(result instanceof Date).toBe(true)
    expect(result.getUTCFullYear()).toBe(2026)
    expect(result.getUTCMonth()).toBe(0)
    expect(result.getUTCDate()).toBe(15)
  })

  it('throws on invalid ISO string', () => {
    expect(() => fromUTC('not-a-date')).toThrow('Invalid ISO date string')
  })
})

describe('safeParseDate', () => {
  it('returns null for null', () => {
    expect(safeParseDate(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(safeParseDate(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(safeParseDate('')).toBeNull()
  })

  it('returns valid Date for valid ISO string', () => {
    const result = safeParseDate('2026-01-15T10:30:00Z')
    expect(result).not.toBeNull()
    expect(result!.getUTCFullYear()).toBe(2026)
  })

  it('returns null for invalid string', () => {
    expect(safeParseDate('not-a-date')).toBeNull()
  })

  it('returns Date object as-is if valid', () => {
    const date = new Date(2026, 0, 15)
    const result = safeParseDate(date)
    expect(result).toBe(date)
  })

  it('returns null for invalid Date object', () => {
    const invalid = new Date('invalid')
    expect(safeParseDate(invalid)).toBeNull()
  })
})

// ============================================================================
// Formatting
// ============================================================================

describe('formatTimeRange', () => {
  const start = new Date(2026, 0, 15, 9, 0)
  const end = new Date(2026, 0, 15, 10, 30)

  it('formats in 12-hour mode by default', () => {
    const result = formatTimeRange(start, end)
    expect(result).toBe('9:00 AM - 10:30 AM')
  })

  it('formats in 24-hour mode', () => {
    const result = formatTimeRange(start, end, true)
    expect(result).toBe('09:00 - 10:30')
  })
})

describe('formatCalendarHeader', () => {
  const date = new Date(2026, 1, 7) // Feb 7, 2026 (Saturday)

  it('formats day view', () => {
    const result = formatCalendarHeader(date, 'day')
    expect(result).toContain('Saturday')
    expect(result).toContain('February')
    expect(result).toContain('7')
    expect(result).toContain('2026')
  })

  it('formats week view with same month', () => {
    // Feb 7, 2026 week: Feb 1-7 (Sun-Sat) — same month
    const result = formatCalendarHeader(date, 'week')
    expect(result).toContain('2026')
  })

  it('formats month view', () => {
    const result = formatCalendarHeader(date, 'month')
    expect(result).toBe('February 2026')
  })

  it('formats agenda view', () => {
    const result = formatCalendarHeader(date, 'agenda')
    expect(result).toBe('February 2026')
  })
})

describe('formatDuration', () => {
  it('formats minutes only', () => {
    const start = new Date(2026, 0, 1, 9, 0)
    const end = new Date(2026, 0, 1, 9, 45)
    expect(formatDuration(start, end)).toBe('45m')
  })

  it('formats exact hours', () => {
    const start = new Date(2026, 0, 1, 9, 0)
    const end = new Date(2026, 0, 1, 11, 0)
    expect(formatDuration(start, end)).toBe('2h')
  })

  it('formats hours and minutes', () => {
    const start = new Date(2026, 0, 1, 9, 0)
    const end = new Date(2026, 0, 1, 10, 30)
    expect(formatDuration(start, end)).toBe('1h 30m')
  })

  it('formats multi-day events', () => {
    const start = new Date(2026, 0, 1, 9, 0)
    const end = new Date(2026, 0, 3, 9, 0)
    expect(formatDuration(start, end)).toBe('2 days')
  })

  it('formats single day', () => {
    const start = new Date(2026, 0, 1, 0, 0)
    const end = new Date(2026, 0, 2, 0, 0)
    expect(formatDuration(start, end)).toBe('1 day')
  })
})

describe('formatEventDate', () => {
  it('formats a date correctly', () => {
    const date = new Date(2026, 1, 7) // Saturday
    const result = formatEventDate(date)
    expect(result).toBe('Sat, Feb 7')
  })
})

describe('formatTime', () => {
  it('formats in 12-hour mode by default', () => {
    const date = new Date(2026, 0, 1, 14, 30)
    expect(formatTime(date)).toBe('2:30 PM')
  })

  it('formats in 24-hour mode', () => {
    const date = new Date(2026, 0, 1, 14, 30)
    expect(formatTime(date, true)).toBe('14:30')
  })
})

// ============================================================================
// Date Comparisons
// ============================================================================

describe('areSameDay', () => {
  it('returns true for same day', () => {
    const a = new Date(2026, 0, 15, 9, 0)
    const b = new Date(2026, 0, 15, 17, 0)
    expect(areSameDay(a, b)).toBe(true)
  })

  it('returns false for different days', () => {
    const a = new Date(2026, 0, 15)
    const b = new Date(2026, 0, 16)
    expect(areSameDay(a, b)).toBe(false)
  })
})

describe('isDateBefore', () => {
  it('returns true when date is before', () => {
    const a = new Date(2026, 0, 1)
    const b = new Date(2026, 0, 2)
    expect(isDateBefore(a, b)).toBe(true)
  })

  it('returns false when date is after', () => {
    const a = new Date(2026, 0, 2)
    const b = new Date(2026, 0, 1)
    expect(isDateBefore(a, b)).toBe(false)
  })
})

describe('isDateAfter', () => {
  it('returns true when date is after', () => {
    const a = new Date(2026, 0, 2)
    const b = new Date(2026, 0, 1)
    expect(isDateAfter(a, b)).toBe(true)
  })

  it('returns false when date is before', () => {
    const a = new Date(2026, 0, 1)
    const b = new Date(2026, 0, 2)
    expect(isDateAfter(a, b)).toBe(false)
  })
})

describe('isDateInRange', () => {
  const range = {
    start: new Date(2026, 0, 10),
    end: new Date(2026, 0, 20),
  }

  it('returns true for date in range', () => {
    expect(isDateInRange(new Date(2026, 0, 15), range)).toBe(true)
  })

  it('returns true for date at start', () => {
    expect(isDateInRange(new Date(2026, 0, 10), range)).toBe(true)
  })

  it('returns true for date at end', () => {
    expect(isDateInRange(new Date(2026, 0, 20), range)).toBe(true)
  })

  it('returns false for date before range', () => {
    expect(isDateInRange(new Date(2026, 0, 5), range)).toBe(false)
  })

  it('returns false for date after range', () => {
    expect(isDateInRange(new Date(2026, 0, 25), range)).toBe(false)
  })
})

describe('eventOverlapsRange', () => {
  const range = {
    start: new Date(2026, 0, 10),
    end: new Date(2026, 0, 20),
  }

  it('returns true for event fully within range', () => {
    expect(
      eventOverlapsRange(new Date(2026, 0, 12), new Date(2026, 0, 18), range),
    ).toBe(true)
  })

  it('returns true for event starting before and ending within', () => {
    expect(
      eventOverlapsRange(new Date(2026, 0, 5), new Date(2026, 0, 15), range),
    ).toBe(true)
  })

  it('returns true for event starting within and ending after', () => {
    expect(
      eventOverlapsRange(new Date(2026, 0, 15), new Date(2026, 0, 25), range),
    ).toBe(true)
  })

  it('returns true for event spanning entire range', () => {
    expect(
      eventOverlapsRange(new Date(2026, 0, 5), new Date(2026, 0, 25), range),
    ).toBe(true)
  })

  it('returns false for event entirely before range', () => {
    expect(
      eventOverlapsRange(new Date(2026, 0, 1), new Date(2026, 0, 5), range),
    ).toBe(false)
  })

  it('returns false for event entirely after range', () => {
    expect(
      eventOverlapsRange(new Date(2026, 0, 25), new Date(2026, 0, 30), range),
    ).toBe(false)
  })
})

// ============================================================================
// Time Slot Utilities
// ============================================================================

describe('roundToSlot', () => {
  it('rounds to nearest 30-minute slot', () => {
    const date = new Date(2026, 0, 1, 14, 14) // 2:14 PM
    const result = roundToSlot(date)
    expect(result.getHours()).toBe(14)
    expect(result.getMinutes()).toBe(0)
  })

  it('rounds up past halfway', () => {
    const date = new Date(2026, 0, 1, 14, 16) // 2:16 PM
    const result = roundToSlot(date)
    expect(result.getHours()).toBe(14)
    expect(result.getMinutes()).toBe(30)
  })

  it('supports custom slot size', () => {
    const date = new Date(2026, 0, 1, 14, 10)
    const result = roundToSlot(date, 15)
    expect(result.getMinutes()).toBe(15)
  })
})

describe('snapToSlot', () => {
  it('floors to nearest 30-minute slot', () => {
    const date = new Date(2026, 0, 1, 14, 45)
    const result = snapToSlot(date)
    expect(result.getHours()).toBe(14)
    expect(result.getMinutes()).toBe(30)
  })

  it('keeps exact slot times', () => {
    const date = new Date(2026, 0, 1, 14, 30)
    const result = snapToSlot(date)
    expect(result.getHours()).toBe(14)
    expect(result.getMinutes()).toBe(30)
  })
})

describe('getDefaultEndTime', () => {
  it('returns 1 hour later for events', () => {
    const start = new Date(2026, 0, 1, 14, 0)
    const end = getDefaultEndTime(start)
    expect(end.getHours()).toBe(15)
  })

  it('returns same time for tasks', () => {
    const start = new Date(2026, 0, 1, 14, 0)
    const end = getDefaultEndTime(start, true)
    expect(end.getTime()).toBe(start.getTime())
  })
})

// ============================================================================
// All-Day Event Utilities
// ============================================================================

describe('toAllDayDate', () => {
  it('formats date as YYYY-MM-DD', () => {
    const date = new Date(2026, 1, 7)
    expect(toAllDayDate(date)).toBe('2026-02-07')
  })
})

describe('parseAllDayDate', () => {
  it('parses a valid date string to midnight', () => {
    const result = parseAllDayDate('2026-02-07')
    expect(result.getFullYear()).toBe(2026)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(7)
    expect(result.getHours()).toBe(0)
    expect(result.getMinutes()).toBe(0)
  })

  it('throws on invalid date string', () => {
    expect(() => parseAllDayDate('not-a-date')).toThrow('Invalid date string')
  })
})

describe('isMultiDayEvent', () => {
  it('returns false for same-day events', () => {
    const start = new Date(2026, 0, 15, 9, 0)
    const end = new Date(2026, 0, 15, 17, 0)
    expect(isMultiDayEvent(start, end)).toBe(false)
  })

  it('returns true for multi-day events', () => {
    const start = new Date(2026, 0, 15)
    const end = new Date(2026, 0, 17)
    expect(isMultiDayEvent(start, end)).toBe(true)
  })
})

describe('getEventDayCount', () => {
  it('returns 1 for same-day event', () => {
    const start = new Date(2026, 0, 15, 9, 0)
    const end = new Date(2026, 0, 15, 17, 0)
    expect(getEventDayCount(start, end)).toBe(1)
  })

  it('returns 3 for a 3-day event', () => {
    const start = new Date(2026, 0, 15)
    const end = new Date(2026, 0, 17)
    expect(getEventDayCount(start, end)).toBe(3)
  })
})

// ============================================================================
// Working Hours Utilities
// ============================================================================

describe('isWithinWorkingHours', () => {
  it('returns true for time within working hours', () => {
    const date = new Date(2026, 0, 1, 10, 0)
    expect(isWithinWorkingHours(date, 9, 18)).toBe(true)
  })

  it('returns true at start of working hours', () => {
    const date = new Date(2026, 0, 1, 9, 0)
    expect(isWithinWorkingHours(date, 9, 18)).toBe(true)
  })

  it('returns false at end of working hours', () => {
    const date = new Date(2026, 0, 1, 18, 0)
    expect(isWithinWorkingHours(date, 9, 18)).toBe(false)
  })

  it('returns false before working hours', () => {
    const date = new Date(2026, 0, 1, 7, 0)
    expect(isWithinWorkingHours(date, 9, 18)).toBe(false)
  })
})

describe('getWorkingHoursRange', () => {
  it('returns range with correct hours', () => {
    const date = new Date(2026, 0, 15)
    const range = getWorkingHoursRange(date, 9, 18)
    expect(range.start.getHours()).toBe(9)
    expect(range.end.getHours()).toBe(18)
    expect(range.start.getDate()).toBe(15)
    expect(range.end.getDate()).toBe(15)
  })
})
