/**
 * rrule-utils.ts - Recurrence pattern utilities using rrule.js
 *
 * Pure functions for parsing, expanding, and formatting RFC 5545 recurrence rules.
 * Uses the rrule library for standards-compliant recurrence handling.
 */

import pkg from 'rrule'
const { RRule, RRuleSet, rrulestr } = pkg
import type { DateRange } from '../types/calendar-event.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Recurrence frequency options
 */
export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

/**
 * Day of week for weekly recurrence
 */
export type Weekday = 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA' | 'SU'

/**
 * Simplified recurrence pattern for UI
 */
export interface RecurrencePattern {
  /** Recurrence frequency */
  frequency: RecurrenceFrequency

  /** Interval (every N days/weeks/months/years) */
  interval: number

  /** Days of week for weekly recurrence */
  weekdays?: Weekday[]

  /** Day of month for monthly recurrence (1-31) */
  monthDay?: number

  /** End date for the recurrence (null = forever) */
  until?: Date

  /** Number of occurrences (alternative to until) */
  count?: number
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Map frequency strings to RRule constants
 */
const FREQ_MAP: Record<RecurrenceFrequency, number> = {
  daily: RRule.DAILY,
  weekly: RRule.WEEKLY,
  monthly: RRule.MONTHLY,
  yearly: RRule.YEARLY,
}

/**
 * Reverse map for RRule frequency to string
 */
const REVERSE_FREQ_MAP: Record<number, RecurrenceFrequency> = {
  [RRule.DAILY]: 'daily',
  [RRule.WEEKLY]: 'weekly',
  [RRule.MONTHLY]: 'monthly',
  [RRule.YEARLY]: 'yearly',
}

/**
 * Map weekday strings to RRule weekday objects
 */
const WEEKDAY_MAP: Record<Weekday, InstanceType<typeof RRule>['options']['byweekday'][0]> = {
  MO: RRule.MO,
  TU: RRule.TU,
  WE: RRule.WE,
  TH: RRule.TH,
  FR: RRule.FR,
  SA: RRule.SA,
  SU: RRule.SU,
}

/**
 * Weekday abbreviations for display
 */
const WEEKDAY_LABELS: Record<Weekday, string> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
}

/**
 * Short weekday labels
 */
const WEEKDAY_SHORT_LABELS: Record<Weekday, string> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
}

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse an RRULE string into an RRule object
 *
 * @param rruleStr - RFC 5545 RRULE string (may include DTSTART)
 * @returns Parsed RRule object, or null if invalid
 */
export function parseRRule(rruleStr: string): RRule | null {
  if (!rruleStr) return null

  try {
    // rrulestr handles both plain RRULE and DTSTART;RRULE formats
    const rule = rrulestr(rruleStr)
    return rule instanceof RRule ? rule : null
  } catch {
    console.warn('Failed to parse RRULE:', rruleStr)
    return null
  }
}

/**
 * Parse RRULE string to simplified pattern for UI
 */
export function parseToPattern(rruleStr: string): RecurrencePattern | null {
  const rule = parseRRule(rruleStr)
  if (!rule) return null

  const options = rule.options

  // Convert frequency
  const frequency = REVERSE_FREQ_MAP[options.freq]
  if (!frequency) return null

  const pattern: RecurrencePattern = {
    frequency,
    interval: options.interval || 1,
  }

  // Handle weekdays for weekly recurrence
  if (options.byweekday && options.byweekday.length > 0) {
    pattern.weekdays = options.byweekday.map((wd) => {
      // RRule weekday can be a number or Weekday object
      if (typeof wd === 'number') {
        const weekdays: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
        return weekdays[wd]
      }
      const weekdayNum = wd.weekday ?? wd
      const weekdays: Weekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
      return weekdays[typeof weekdayNum === 'number' ? weekdayNum : 0]
    })
  }

  // Handle monthly day
  if (options.bymonthday && options.bymonthday.length > 0) {
    pattern.monthDay = options.bymonthday[0]
  }

  // Handle end condition
  if (options.until) {
    pattern.until = options.until
  }
  if (options.count) {
    pattern.count = options.count
  }

  return pattern
}

// ============================================================================
// Building RRULE Strings
// ============================================================================

/**
 * Build an RRULE string from a simplified pattern
 *
 * @param pattern - Recurrence pattern
 * @param dtstart - Start date of the event
 * @returns RFC 5545 RRULE string
 */
export function buildRRule(pattern: RecurrencePattern, dtstart: Date): string {
  const options: Partial<InstanceType<typeof RRule>['options']> = {
    freq: FREQ_MAP[pattern.frequency],
    interval: pattern.interval,
    dtstart,
  }

  // Add weekdays for weekly recurrence
  if (pattern.weekdays && pattern.weekdays.length > 0) {
    options.byweekday = pattern.weekdays.map((wd) => WEEKDAY_MAP[wd])
  }

  // Add month day for monthly recurrence
  if (pattern.monthDay !== undefined) {
    options.bymonthday = [pattern.monthDay]
  }

  // Add end condition
  if (pattern.until) {
    options.until = pattern.until
  } else if (pattern.count) {
    options.count = pattern.count
  }

  const rule = new RRule(options as ConstructorParameters<typeof RRule>[0])
  return rule.toString()
}

/**
 * Create a simple daily recurrence rule
 */
export function createDailyRule(dtstart: Date, interval = 1): string {
  return buildRRule({ frequency: 'daily', interval }, dtstart)
}

/**
 * Create a simple weekly recurrence rule
 */
export function createWeeklyRule(
  dtstart: Date,
  weekdays?: Weekday[],
  interval = 1,
): string {
  return buildRRule({ frequency: 'weekly', interval, weekdays }, dtstart)
}

/**
 * Create a simple monthly recurrence rule
 */
export function createMonthlyRule(
  dtstart: Date,
  monthDay?: number,
  interval = 1,
): string {
  return buildRRule({ frequency: 'monthly', interval, monthDay }, dtstart)
}

/**
 * Create weekday-only recurrence (Mon-Fri)
 */
export function createWeekdayRule(dtstart: Date): string {
  return buildRRule(
    {
      frequency: 'weekly',
      interval: 1,
      weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'],
    },
    dtstart,
  )
}

// ============================================================================
// Expansion
// ============================================================================

/**
 * Expand a recurring event into instances within a date range
 *
 * @param rruleStr - RFC 5545 RRULE string
 * @param range - Date range to expand within
 * @param maxInstances - Maximum number of instances to return (default: 500)
 * @returns Array of dates representing each occurrence
 */
export function expandRecurrence(
  rruleStr: string,
  range: DateRange,
  maxInstances = 500,
): Date[] {
  const rule = parseRRule(rruleStr)
  if (!rule) return []

  try {
    // Get occurrences within the range
    const instances = rule.between(range.start, range.end, true)

    // Limit the number of instances
    return instances.slice(0, maxInstances)
  } catch (error) {
    console.warn('Failed to expand recurrence:', error)
    return []
  }
}

/**
 * Get the next occurrence of a recurring event after a given date
 *
 * @param rruleStr - RFC 5545 RRULE string
 * @param afterDate - Find the next occurrence after this date
 * @returns Next occurrence date, or null if none
 */
export function getNextInstance(rruleStr: string, afterDate: Date): Date | null {
  const rule = parseRRule(rruleStr)
  if (!rule) return null

  try {
    return rule.after(afterDate)
  } catch {
    return null
  }
}

/**
 * Get the previous occurrence of a recurring event before a given date
 */
export function getPreviousInstance(rruleStr: string, beforeDate: Date): Date | null {
  const rule = parseRRule(rruleStr)
  if (!rule) return null

  try {
    return rule.before(beforeDate)
  } catch {
    return null
  }
}

/**
 * Check if a date is an occurrence of a recurring pattern
 */
export function isOccurrence(rruleStr: string, date: Date): boolean {
  const rule = parseRRule(rruleStr)
  if (!rule) return false

  try {
    // Check if there's an occurrence on this exact date
    const occurrences = rule.between(
      new Date(date.getTime() - 1000), // 1 second before
      new Date(date.getTime() + 1000), // 1 second after
      true,
    )
    return occurrences.length > 0
  } catch {
    return false
  }
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format an RRULE as human-readable text
 *
 * @param rruleStr - RFC 5545 RRULE string
 * @returns Human-readable description (e.g., "Every week on Monday, Wednesday")
 */
export function formatRRuleHumanReadable(rruleStr: string): string {
  const rule = parseRRule(rruleStr)
  if (!rule) return 'Invalid recurrence'

  try {
    return rule.toText()
  } catch {
    // Fall back to pattern-based formatting
    const pattern = parseToPattern(rruleStr)
    if (!pattern) return 'Invalid recurrence'

    return formatPatternHumanReadable(pattern)
  }
}

/**
 * Format a recurrence pattern as human-readable text
 */
export function formatPatternHumanReadable(pattern: RecurrencePattern): string {
  const parts: string[] = []

  // Frequency and interval
  if (pattern.interval === 1) {
    switch (pattern.frequency) {
      case 'daily':
        parts.push('Every day')
        break
      case 'weekly':
        parts.push('Every week')
        break
      case 'monthly':
        parts.push('Every month')
        break
      case 'yearly':
        parts.push('Every year')
        break
    }
  } else {
    const unit = pattern.frequency.replace('ly', '')
    parts.push(`Every ${pattern.interval} ${unit}s`)
  }

  // Weekdays
  if (pattern.weekdays && pattern.weekdays.length > 0) {
    if (pattern.weekdays.length === 5 && !pattern.weekdays.includes('SA') && !pattern.weekdays.includes('SU')) {
      parts.push('on weekdays')
    } else if (pattern.weekdays.length === 2 && pattern.weekdays.includes('SA') && pattern.weekdays.includes('SU')) {
      parts.push('on weekends')
    } else {
      const dayNames = pattern.weekdays.map((wd) => WEEKDAY_SHORT_LABELS[wd])
      parts.push(`on ${dayNames.join(', ')}`)
    }
  }

  // Month day
  if (pattern.monthDay !== undefined) {
    parts.push(`on day ${pattern.monthDay}`)
  }

  // End condition
  if (pattern.until) {
    const endDate = pattern.until.toLocaleDateString()
    parts.push(`until ${endDate}`)
  } else if (pattern.count) {
    parts.push(`for ${pattern.count} times`)
  }

  return parts.join(' ')
}

/**
 * Get a short description of the recurrence for badges/icons
 */
export function formatRRuleShort(rruleStr: string): string {
  const pattern = parseToPattern(rruleStr)
  if (!pattern) return 'Repeats'

  if (pattern.interval === 1) {
    switch (pattern.frequency) {
      case 'daily':
        return 'Daily'
      case 'weekly':
        if (pattern.weekdays?.length === 5 && !pattern.weekdays.includes('SA') && !pattern.weekdays.includes('SU')) {
          return 'Weekdays'
        }
        return 'Weekly'
      case 'monthly':
        return 'Monthly'
      case 'yearly':
        return 'Yearly'
    }
  }

  return `Every ${pattern.interval} ${pattern.frequency.replace('ly', '')}s`
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate an RRULE string
 */
export function isValidRRule(rruleStr: string): boolean {
  return parseRRule(rruleStr) !== null
}

/**
 * Check if a recurrence has an end condition
 */
export function hasEndCondition(rruleStr: string): boolean {
  const pattern = parseToPattern(rruleStr)
  if (!pattern) return false
  return pattern.until !== undefined || pattern.count !== undefined
}

/**
 * Get the end date of a recurrence (if finite)
 */
export function getRecurrenceEnd(rruleStr: string): Date | null {
  const pattern = parseToPattern(rruleStr)
  if (!pattern) return null

  if (pattern.until) {
    return pattern.until
  }

  // If count is set, calculate the last occurrence
  if (pattern.count) {
    const rule = parseRRule(rruleStr)
    if (rule) {
      const allOccurrences = rule.all((_, i) => i < pattern.count!)
      if (allOccurrences.length > 0) {
        return allOccurrences[allOccurrences.length - 1]
      }
    }
  }

  return null // Infinite recurrence
}

// ============================================================================
// Preset Patterns
// ============================================================================

/**
 * Common recurrence presets for quick selection
 */
export const RECURRENCE_PRESETS = {
  none: null,
  daily: { frequency: 'daily', interval: 1 } as RecurrencePattern,
  weekdays: {
    frequency: 'weekly',
    interval: 1,
    weekdays: ['MO', 'TU', 'WE', 'TH', 'FR'] as Weekday[],
  } as RecurrencePattern,
  weekly: { frequency: 'weekly', interval: 1 } as RecurrencePattern,
  biweekly: { frequency: 'weekly', interval: 2 } as RecurrencePattern,
  monthly: { frequency: 'monthly', interval: 1 } as RecurrencePattern,
  yearly: { frequency: 'yearly', interval: 1 } as RecurrencePattern,
} as const

/**
 * Labels for recurrence presets
 */
export const RECURRENCE_PRESET_LABELS: Record<keyof typeof RECURRENCE_PRESETS, string> = {
  none: 'Does not repeat',
  daily: 'Daily',
  weekdays: 'Every weekday (Mon-Fri)',
  weekly: 'Weekly',
  biweekly: 'Every 2 weeks',
  monthly: 'Monthly',
  yearly: 'Yearly',
}
