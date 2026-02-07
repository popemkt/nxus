import { describe, it, expect } from 'vitest'
import {
  parseRRule,
  parseToPattern,
  buildRRule,
  createDailyRule,
  createWeeklyRule,
  createMonthlyRule,
  createWeekdayRule,
  expandRecurrence,
  getNextInstance,
  getPreviousInstance,
  isOccurrence,
  formatRRuleHumanReadable,
  formatPatternHumanReadable,
  formatRRuleShort,
  isValidRRule,
  hasEndCondition,
  getRecurrenceEnd,
  RECURRENCE_PRESETS,
  RECURRENCE_PRESET_LABELS,
} from './rrule-utils.js'
import type { RecurrencePattern } from './rrule-utils.js'

// ============================================================================
// parseRRule
// ============================================================================

describe('parseRRule', () => {
  it('parses a valid daily RRULE', () => {
    const rule = parseRRule('RRULE:FREQ=DAILY;INTERVAL=1')
    expect(rule).not.toBeNull()
  })

  it('parses a valid weekly RRULE with BYDAY', () => {
    const rule = parseRRule('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(rule).not.toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseRRule('')).toBeNull()
  })

  it('returns null for invalid RRULE', () => {
    expect(parseRRule('NOT_A_RULE')).toBeNull()
  })
})

// ============================================================================
// parseToPattern
// ============================================================================

describe('parseToPattern', () => {
  it('parses daily recurrence', () => {
    const pattern = parseToPattern('RRULE:FREQ=DAILY;INTERVAL=2')
    expect(pattern).not.toBeNull()
    expect(pattern!.frequency).toBe('daily')
    expect(pattern!.interval).toBe(2)
  })

  it('parses weekly recurrence with weekdays', () => {
    const pattern = parseToPattern('RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR')
    expect(pattern).not.toBeNull()
    expect(pattern!.frequency).toBe('weekly')
    expect(pattern!.weekdays).toContain('MO')
    expect(pattern!.weekdays).toContain('WE')
    expect(pattern!.weekdays).toContain('FR')
  })

  it('parses monthly recurrence with day of month', () => {
    const pattern = parseToPattern('RRULE:FREQ=MONTHLY;BYMONTHDAY=15')
    expect(pattern).not.toBeNull()
    expect(pattern!.frequency).toBe('monthly')
    expect(pattern!.monthDay).toBe(15)
  })

  it('parses recurrence with count', () => {
    const pattern = parseToPattern('RRULE:FREQ=DAILY;COUNT=10')
    expect(pattern).not.toBeNull()
    expect(pattern!.count).toBe(10)
  })

  it('returns null for invalid input', () => {
    expect(parseToPattern('')).toBeNull()
    expect(parseToPattern('invalid')).toBeNull()
  })
})

// ============================================================================
// buildRRule
// ============================================================================

describe('buildRRule', () => {
  const dtstart = new Date(2026, 0, 1, 9, 0) // Jan 1, 2026, 9 AM

  it('builds a daily rule', () => {
    const rrule = buildRRule({ frequency: 'daily', interval: 1 }, dtstart)
    expect(rrule).toContain('FREQ=DAILY')
  })

  it('builds a weekly rule with weekdays', () => {
    const rrule = buildRRule(
      { frequency: 'weekly', interval: 1, weekdays: ['MO', 'FR'] },
      dtstart,
    )
    expect(rrule).toContain('FREQ=WEEKLY')
    expect(rrule).toContain('BYDAY')
  })

  it('builds a monthly rule with day of month', () => {
    const rrule = buildRRule(
      { frequency: 'monthly', interval: 1, monthDay: 15 },
      dtstart,
    )
    expect(rrule).toContain('FREQ=MONTHLY')
    expect(rrule).toContain('BYMONTHDAY=15')
  })

  it('builds a rule with count', () => {
    const rrule = buildRRule(
      { frequency: 'daily', interval: 1, count: 5 },
      dtstart,
    )
    expect(rrule).toContain('COUNT=5')
  })

  it('builds a rule with interval > 1', () => {
    const rrule = buildRRule({ frequency: 'weekly', interval: 2 }, dtstart)
    expect(rrule).toContain('INTERVAL=2')
  })
})

// ============================================================================
// Convenience Builders
// ============================================================================

describe('createDailyRule', () => {
  it('creates a daily rule', () => {
    const rule = createDailyRule(new Date(2026, 0, 1))
    expect(rule).toContain('FREQ=DAILY')
  })

  it('supports custom interval', () => {
    const rule = createDailyRule(new Date(2026, 0, 1), 3)
    expect(rule).toContain('INTERVAL=3')
  })
})

describe('createWeeklyRule', () => {
  it('creates a weekly rule', () => {
    const rule = createWeeklyRule(new Date(2026, 0, 1))
    expect(rule).toContain('FREQ=WEEKLY')
  })

  it('supports weekdays', () => {
    const rule = createWeeklyRule(new Date(2026, 0, 1), ['MO', 'WE'])
    expect(rule).toContain('BYDAY')
  })
})

describe('createMonthlyRule', () => {
  it('creates a monthly rule', () => {
    const rule = createMonthlyRule(new Date(2026, 0, 1))
    expect(rule).toContain('FREQ=MONTHLY')
  })

  it('supports month day', () => {
    const rule = createMonthlyRule(new Date(2026, 0, 1), 15)
    expect(rule).toContain('BYMONTHDAY=15')
  })
})

describe('createWeekdayRule', () => {
  it('creates a weekday-only rule', () => {
    const rule = createWeekdayRule(new Date(2026, 0, 1))
    expect(rule).toContain('FREQ=WEEKLY')
    expect(rule).toContain('BYDAY')
    // Should include MO through FR
    expect(rule).toContain('MO')
    expect(rule).toContain('FR')
  })
})

// ============================================================================
// expandRecurrence
// ============================================================================

describe('expandRecurrence', () => {
  it('expands daily recurrence within range', () => {
    const dtstart = new Date(Date.UTC(2026, 0, 1, 9, 0))
    const rrule = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:FREQ=DAILY;INTERVAL=1;COUNT=30`
    const range = {
      start: new Date(Date.UTC(2026, 0, 1)),
      end: new Date(Date.UTC(2026, 0, 10, 23, 59, 59)),
    }
    const instances = expandRecurrence(rrule, range)
    expect(instances.length).toBe(10)
  })

  it('returns empty array for invalid RRULE', () => {
    const range = {
      start: new Date(2026, 0, 1),
      end: new Date(2026, 0, 31),
    }
    expect(expandRecurrence('', range)).toEqual([])
    expect(expandRecurrence('invalid', range)).toEqual([])
  })

  it('respects maxInstances limit', () => {
    const dtstart = new Date(Date.UTC(2026, 0, 1, 9, 0))
    const rrule = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:FREQ=DAILY;INTERVAL=1`
    const range = {
      start: new Date(Date.UTC(2026, 0, 1)),
      end: new Date(Date.UTC(2026, 11, 31)),
    }
    const instances = expandRecurrence(rrule, range, 5)
    expect(instances.length).toBe(5)
  })
})

// ============================================================================
// getNextInstance / getPreviousInstance
// ============================================================================

describe('getNextInstance', () => {
  it('gets the next occurrence', () => {
    const dtstart = new Date(Date.UTC(2026, 0, 1, 9, 0))
    const rrule = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:FREQ=DAILY;INTERVAL=1;COUNT=30`
    const next = getNextInstance(rrule, new Date(Date.UTC(2026, 0, 5, 9, 0)))
    expect(next).not.toBeNull()
    expect(next!.getUTCDate()).toBe(6)
  })

  it('returns null for invalid RRULE', () => {
    expect(getNextInstance('', new Date())).toBeNull()
  })
})

describe('getPreviousInstance', () => {
  it('gets the previous occurrence', () => {
    const dtstart = new Date(Date.UTC(2026, 0, 1, 9, 0))
    const rrule = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:FREQ=DAILY;INTERVAL=1;COUNT=30`
    const prev = getPreviousInstance(rrule, new Date(Date.UTC(2026, 0, 5, 9, 0)))
    expect(prev).not.toBeNull()
    expect(prev!.getUTCDate()).toBe(4)
  })

  it('returns null for invalid RRULE', () => {
    expect(getPreviousInstance('', new Date())).toBeNull()
  })
})

// ============================================================================
// isOccurrence
// ============================================================================

describe('isOccurrence', () => {
  it('returns true for a date that is an occurrence', () => {
    const dtstart = new Date(Date.UTC(2026, 0, 1, 9, 0))
    const rrule = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:FREQ=DAILY;INTERVAL=1;COUNT=30`
    expect(isOccurrence(rrule, new Date(Date.UTC(2026, 0, 5, 9, 0)))).toBe(true)
  })

  it('returns false for invalid RRULE', () => {
    expect(isOccurrence('', new Date())).toBe(false)
  })
})

// ============================================================================
// Formatting
// ============================================================================

describe('formatRRuleHumanReadable', () => {
  it('formats a daily rule', () => {
    const result = formatRRuleHumanReadable('RRULE:FREQ=DAILY;INTERVAL=1')
    expect(result.toLowerCase()).toContain('day')
  })

  it('returns "Invalid recurrence" for invalid input', () => {
    expect(formatRRuleHumanReadable('')).toBe('Invalid recurrence')
  })
})

describe('formatPatternHumanReadable', () => {
  it('formats daily pattern', () => {
    const result = formatPatternHumanReadable({ frequency: 'daily', interval: 1 })
    expect(result).toBe('Every day')
  })

  it('formats weekly pattern', () => {
    const result = formatPatternHumanReadable({ frequency: 'weekly', interval: 1 })
    expect(result).toBe('Every week')
  })

  it('formats monthly pattern', () => {
    const result = formatPatternHumanReadable({ frequency: 'monthly', interval: 1 })
    expect(result).toBe('Every month')
  })

  it('formats yearly pattern', () => {
    const result = formatPatternHumanReadable({ frequency: 'yearly', interval: 1 })
    expect(result).toBe('Every year')
  })

  it('formats interval > 1', () => {
    const result = formatPatternHumanReadable({ frequency: 'daily', interval: 3 })
    expect(result).toBe('Every 3 dais')
  })

  it('formats weekdays', () => {
    const pattern: RecurrencePattern = {
      frequency: 'weekly',
      interval: 1,
      weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'],
    }
    expect(formatPatternHumanReadable(pattern)).toBe('Every week on weekdays')
  })

  it('formats weekends', () => {
    const pattern: RecurrencePattern = {
      frequency: 'weekly',
      interval: 1,
      weekdays: ['SA', 'SU'],
    }
    expect(formatPatternHumanReadable(pattern)).toBe('Every week on weekends')
  })

  it('formats specific days', () => {
    const pattern: RecurrencePattern = {
      frequency: 'weekly',
      interval: 1,
      weekdays: ['MO', 'WE'],
    }
    expect(formatPatternHumanReadable(pattern)).toBe('Every week on Mon, Wed')
  })

  it('formats with month day', () => {
    const pattern: RecurrencePattern = {
      frequency: 'monthly',
      interval: 1,
      monthDay: 15,
    }
    expect(formatPatternHumanReadable(pattern)).toBe('Every month on day 15')
  })

  it('formats with count', () => {
    const pattern: RecurrencePattern = {
      frequency: 'daily',
      interval: 1,
      count: 10,
    }
    expect(formatPatternHumanReadable(pattern)).toBe('Every day for 10 times')
  })
})

describe('formatRRuleShort', () => {
  it('returns "Daily" for daily rule', () => {
    expect(formatRRuleShort('RRULE:FREQ=DAILY;INTERVAL=1')).toBe('Daily')
  })

  it('returns "Weekly" for weekly rule', () => {
    expect(formatRRuleShort('RRULE:FREQ=WEEKLY;INTERVAL=1')).toBe('Weekly')
  })

  it('returns "Monthly" for monthly rule', () => {
    expect(formatRRuleShort('RRULE:FREQ=MONTHLY;INTERVAL=1')).toBe('Monthly')
  })

  it('returns "Yearly" for yearly rule', () => {
    expect(formatRRuleShort('RRULE:FREQ=YEARLY;INTERVAL=1')).toBe('Yearly')
  })

  it('returns "Weekdays" for weekday rule', () => {
    expect(formatRRuleShort('RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR')).toBe('Weekdays')
  })

  it('returns "Repeats" for invalid input', () => {
    expect(formatRRuleShort('')).toBe('Repeats')
  })
})

// ============================================================================
// Validation
// ============================================================================

describe('isValidRRule', () => {
  it('returns true for valid RRULE', () => {
    expect(isValidRRule('RRULE:FREQ=DAILY;INTERVAL=1')).toBe(true)
  })

  it('returns false for invalid RRULE', () => {
    expect(isValidRRule('NOT_VALID')).toBe(false)
    expect(isValidRRule('')).toBe(false)
  })
})

describe('hasEndCondition', () => {
  it('returns true for RRULE with COUNT', () => {
    expect(hasEndCondition('RRULE:FREQ=DAILY;COUNT=10')).toBe(true)
  })

  it('returns true for RRULE with UNTIL', () => {
    expect(hasEndCondition('RRULE:FREQ=DAILY;UNTIL=20260131T000000Z')).toBe(true)
  })

  it('returns false for infinite RRULE', () => {
    expect(hasEndCondition('RRULE:FREQ=DAILY;INTERVAL=1')).toBe(false)
  })

  it('returns false for invalid RRULE', () => {
    expect(hasEndCondition('')).toBe(false)
  })
})

describe('getRecurrenceEnd', () => {
  it('returns end date for RRULE with UNTIL', () => {
    const end = getRecurrenceEnd('RRULE:FREQ=DAILY;UNTIL=20260131T000000Z')
    expect(end).not.toBeNull()
    expect(end!.getUTCMonth()).toBe(0)
    expect(end!.getUTCDate()).toBe(31)
  })

  it('returns last occurrence for RRULE with COUNT', () => {
    const dtstart = new Date(Date.UTC(2026, 0, 1, 9, 0))
    const rrule = `DTSTART:${dtstart.toISOString().replace(/[-:]/g, '').split('.')[0]}Z\nRRULE:FREQ=DAILY;INTERVAL=1;COUNT=5`
    const end = getRecurrenceEnd(rrule)
    expect(end).not.toBeNull()
    expect(end!.getUTCDate()).toBe(5)
  })

  it('returns null for infinite RRULE', () => {
    expect(getRecurrenceEnd('RRULE:FREQ=DAILY;INTERVAL=1')).toBeNull()
  })

  it('returns null for invalid RRULE', () => {
    expect(getRecurrenceEnd('')).toBeNull()
  })
})

// ============================================================================
// Presets
// ============================================================================

describe('RECURRENCE_PRESETS', () => {
  it('has expected presets', () => {
    expect(RECURRENCE_PRESETS.none).toBeNull()
    expect(RECURRENCE_PRESETS.daily).toMatchObject({ frequency: 'daily', interval: 1 })
    expect(RECURRENCE_PRESETS.weekly).toMatchObject({ frequency: 'weekly', interval: 1 })
    expect(RECURRENCE_PRESETS.biweekly).toMatchObject({ frequency: 'weekly', interval: 2 })
    expect(RECURRENCE_PRESETS.monthly).toMatchObject({ frequency: 'monthly', interval: 1 })
    expect(RECURRENCE_PRESETS.yearly).toMatchObject({ frequency: 'yearly', interval: 1 })
  })

  it('weekdays preset has MO-FR', () => {
    expect(RECURRENCE_PRESETS.weekdays.weekdays).toEqual(['MO', 'TU', 'WE', 'TH', 'FR'])
  })
})

describe('RECURRENCE_PRESET_LABELS', () => {
  it('has labels for all presets', () => {
    const presetKeys = Object.keys(RECURRENCE_PRESETS)
    const labelKeys = Object.keys(RECURRENCE_PRESET_LABELS)
    expect(labelKeys).toEqual(expect.arrayContaining(presetKeys))
  })

  it('has human-readable labels', () => {
    expect(RECURRENCE_PRESET_LABELS.none).toBe('Does not repeat')
    expect(RECURRENCE_PRESET_LABELS.daily).toBe('Daily')
    expect(RECURRENCE_PRESET_LABELS.weekdays).toBe('Every weekday (Mon-Fri)')
  })
})
