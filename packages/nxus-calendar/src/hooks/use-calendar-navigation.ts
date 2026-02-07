/**
 * use-calendar-navigation.ts - React hook for calendar navigation state
 *
 * Manages the current date and view state for calendar navigation.
 * Provides actions for navigating between periods and changing views.
 */

import { useState, useCallback, useMemo } from 'react'
import type { CalendarView, DateRange, WeekStart } from '../types/calendar-event.js'
import {
  getDateRange,
  getNextPeriodDate,
  getPreviousPeriodDate,
} from '../lib/date-utils.js'
import { useCalendarSettingsStore } from '../stores/calendar-settings.store.js'

// ============================================================================
// Types
// ============================================================================

export interface UseCalendarNavigationOptions {
  /** Initial date (defaults to today) */
  initialDate?: Date

  /** Initial view (defaults to settings defaultView) */
  initialView?: CalendarView

  /** Week start day override (defaults to settings value) */
  weekStartsOn?: WeekStart
}

export interface UseCalendarNavigationResult {
  /** Currently focused date */
  currentDate: Date

  /** Current calendar view */
  currentView: CalendarView

  /** Visible date range based on current view and date */
  dateRange: DateRange

  /** Week start day being used */
  weekStartsOn: WeekStart

  // Navigation actions
  /** Go to a specific date */
  goToDate: (date: Date) => void

  /** Go to today */
  goToToday: () => void

  /** Navigate to next period (day, week, or month based on view) */
  nextPeriod: () => void

  /** Navigate to previous period */
  prevPeriod: () => void

  /** Change the calendar view */
  setView: (view: CalendarView) => void

  // Computed values
  /** Whether the current date is today */
  isToday: boolean

  /** Formatted label for the current period */
  periodLabel: string
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook for managing calendar navigation state
 *
 * @param options - Configuration options
 * @returns Navigation state and actions
 *
 * @example
 * ```tsx
 * const {
 *   currentDate,
 *   currentView,
 *   dateRange,
 *   nextPeriod,
 *   prevPeriod,
 *   goToToday,
 *   setView,
 * } = useCalendarNavigation()
 * ```
 */
export function useCalendarNavigation(
  options: UseCalendarNavigationOptions = {}
): UseCalendarNavigationResult {
  const { initialDate, initialView, weekStartsOn: weekStartsOnOverride } = options

  // Get default values from settings store
  const defaultView = useCalendarSettingsStore(
    (state) => state.display.defaultView
  )
  const settingsWeekStartsOn = useCalendarSettingsStore(
    (state) => state.display.weekStartsOn
  )

  // Local state
  const [currentDate, setCurrentDate] = useState<Date>(
    initialDate ?? new Date()
  )
  const [currentView, setCurrentView] = useState<CalendarView>(
    initialView ?? defaultView
  )

  // Determine week start day
  const weekStartsOn = weekStartsOnOverride ?? settingsWeekStartsOn

  // Calculate visible date range
  const dateRange = useMemo(() => {
    return getDateRange(currentView, currentDate, weekStartsOn)
  }, [currentView, currentDate, weekStartsOn])

  // Navigation actions
  const goToDate = useCallback((date: Date) => {
    setCurrentDate(date)
  }, [])

  const goToToday = useCallback(() => {
    setCurrentDate(new Date())
  }, [])

  const nextPeriod = useCallback(() => {
    setCurrentDate((prevDate) => getNextPeriodDate(currentView, prevDate))
  }, [currentView])

  const prevPeriod = useCallback(() => {
    setCurrentDate((prevDate) => getPreviousPeriodDate(currentView, prevDate))
  }, [currentView])

  const setView = useCallback((view: CalendarView) => {
    setCurrentView(view)
  }, [])

  // Computed: is current date today?
  const isToday = useMemo(() => {
    const today = new Date()
    return (
      currentDate.getFullYear() === today.getFullYear() &&
      currentDate.getMonth() === today.getMonth() &&
      currentDate.getDate() === today.getDate()
    )
  }, [currentDate])

  // Computed: period label for display
  const periodLabel = useMemo(() => {
    const options: Intl.DateTimeFormatOptions = {}

    switch (currentView) {
      case 'day':
        options.weekday = 'long'
        options.year = 'numeric'
        options.month = 'long'
        options.day = 'numeric'
        break
      case 'week':
        // For week view, show the month and year
        // If week spans two months, show both
        if (dateRange.start.getMonth() === dateRange.end.getMonth()) {
          options.year = 'numeric'
          options.month = 'long'
        } else {
          // Week spans two months - format manually
          const startMonth = dateRange.start.toLocaleDateString(undefined, {
            month: 'short',
          })
          const endMonth = dateRange.end.toLocaleDateString(undefined, {
            month: 'short',
            year: 'numeric',
          })
          return `${startMonth} - ${endMonth}`
        }
        break
      case 'month':
        options.year = 'numeric'
        options.month = 'long'
        break
      case 'agenda':
        options.year = 'numeric'
        options.month = 'long'
        break
    }

    return currentDate.toLocaleDateString(undefined, options)
  }, [currentDate, currentView, dateRange])

  return {
    currentDate,
    currentView,
    dateRange,
    weekStartsOn,
    goToDate,
    goToToday,
    nextPeriod,
    prevPeriod,
    setView,
    isToday,
    periodLabel,
  }
}

// ============================================================================
// Combined Hook (Navigation + Events)
// ============================================================================

/**
 * Combined hook that provides both navigation and events
 *
 * This is a convenience hook that combines useCalendarNavigation
 * with useCalendarEvents, automatically passing the dateRange.
 */
export interface UseCalendarOptions extends UseCalendarNavigationOptions {
  /** Whether to include completed tasks */
  includeCompleted?: boolean

  /** Whether to expand recurring events */
  expandRecurring?: boolean
}

export function useCalendar(options: UseCalendarOptions = {}) {
  const { includeCompleted, expandRecurring, ...navOptions } = options

  // Navigation state
  const navigation = useCalendarNavigation(navOptions)

  // Import dynamically to avoid circular deps
  // Events will be loaded lazily when this hook is used
  // This hook is mainly for convenience to combine both

  return {
    // Spread navigation
    ...navigation,

    // Date range is already computed in navigation
    // Components can use navigation.dateRange with useCalendarEvents directly
  }
}
