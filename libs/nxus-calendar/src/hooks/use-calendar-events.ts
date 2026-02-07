/**
 * use-calendar-events.ts - React hook for fetching calendar events
 *
 * Uses TanStack Query to fetch events via server function with:
 * - Date range filtering
 * - Recurrence expansion for recurring events
 * - Integration with calendar settings store
 */

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type {
  CalendarEvent,
  DateRange,
  BigCalendarEvent,
} from '../types/calendar-event.js'
import { toBigCalendarEvent } from '../types/calendar-event.js'
import { expandRecurrence } from '../lib/rrule-utils.js'
import { getCalendarEventsServerFn } from '../server/index.js'
import { useCalendarSettingsStore } from '../stores/calendar-settings.store.js'

// ============================================================================
// Query Keys
// ============================================================================

/**
 * Query key factory for calendar events
 */
export const calendarEventKeys = {
  all: ['calendar-events'] as const,
  list: (dateRange: DateRange, includeCompleted: boolean) =>
    [
      'calendar-events',
      'list',
      dateRange.start.toISOString(),
      dateRange.end.toISOString(),
      includeCompleted,
    ] as const,
  detail: (eventId: string) => ['calendar-events', 'detail', eventId] as const,
}

// ============================================================================
// Types
// ============================================================================

export interface UseCalendarEventsOptions {
  /** The date range to fetch events for */
  dateRange: DateRange

  /** Whether to include completed tasks (defaults to settings value) */
  includeCompleted?: boolean

  /** Additional task supertags to include */
  taskSupertags?: string[]

  /** Additional event supertags to include */
  eventSupertags?: string[]

  /** Whether the query is enabled (defaults to true) */
  enabled?: boolean

  /** Stale time in ms (defaults to 30 seconds) */
  staleTime?: number

  /** Whether to expand recurring events client-side */
  expandRecurring?: boolean
}

export interface UseCalendarEventsResult {
  /** Array of calendar events */
  events: CalendarEvent[]

  /** Events formatted for react-big-calendar */
  bigCalendarEvents: BigCalendarEvent[]

  /** Whether the query is loading */
  isLoading: boolean

  /** Whether the query encountered an error */
  isError: boolean

  /** Error object if query failed */
  error: Error | null

  /** Refetch the events */
  refetch: () => void

  /** Whether the data is being refetched */
  isFetching: boolean
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Fetch calendar events for a date range
 *
 * @param options - Configuration options
 * @returns Events data and query state
 *
 * @example
 * ```tsx
 * const { events, isLoading } = useCalendarEvents({
 *   dateRange: { start: new Date(), end: addDays(new Date(), 7) },
 * })
 * ```
 */
export function useCalendarEvents(
  options: UseCalendarEventsOptions
): UseCalendarEventsResult {
  const {
    dateRange,
    includeCompleted,
    taskSupertags: additionalTaskSupertags,
    eventSupertags: additionalEventSupertags,
    enabled = true,
    staleTime = 30 * 1000,
    expandRecurring = true,
  } = options

  // Get settings from store
  const showCompletedTasks = useCalendarSettingsStore(
    (state) => state.display.showCompletedTasks
  )
  const settingsTaskSupertags = useCalendarSettingsStore(
    (state) => state.supertags.taskSupertags
  )
  const settingsEventSupertags = useCalendarSettingsStore(
    (state) => state.supertags.eventSupertags
  )

  // Merge supertags from settings and options
  const taskSupertags = useMemo(() => {
    const combined = new Set([
      ...settingsTaskSupertags,
      ...(additionalTaskSupertags ?? []),
    ])
    return Array.from(combined)
  }, [settingsTaskSupertags, additionalTaskSupertags])

  const eventSupertags = useMemo(() => {
    const combined = new Set([
      ...settingsEventSupertags,
      ...(additionalEventSupertags ?? []),
    ])
    return Array.from(combined)
  }, [settingsEventSupertags, additionalEventSupertags])

  // Determine if we should include completed tasks
  const shouldIncludeCompleted = includeCompleted ?? showCompletedTasks

  const query = useQuery({
    queryKey: calendarEventKeys.list(dateRange, shouldIncludeCompleted),
    queryFn: async () => {
      const result = await getCalendarEventsServerFn({
        data: {
          startDate: dateRange.start.toISOString(),
          endDate: dateRange.end.toISOString(),
          includeCompleted: shouldIncludeCompleted,
          taskSupertags,
          eventSupertags,
        },
      })

      if (!result.success) {
        throw new Error(result.error ?? 'Failed to fetch calendar events')
      }

      // Convert date strings back to Date objects
      const events: CalendarEvent[] = (result.data ?? []).map((event) => ({
        ...event,
        start: new Date(event.start),
        end: new Date(event.end),
        gcalSyncedAt: event.gcalSyncedAt
          ? new Date(event.gcalSyncedAt)
          : undefined,
        originalStart: event.originalStart
          ? new Date(event.originalStart)
          : undefined,
      }))

      return events
    },
    enabled,
    staleTime,
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  })

  // Expand recurring events client-side
  const expandedEvents = useMemo(() => {
    const baseEvents = query.data ?? []

    if (!expandRecurring) {
      return baseEvents
    }

    const expanded: CalendarEvent[] = []

    for (const event of baseEvents) {
      if (event.rrule) {
        // Expand recurring event into instances
        const instances = expandRecurrence(event.rrule, dateRange)

        for (const instanceDate of instances) {
          // Calculate the duration of the original event
          const duration = event.end.getTime() - event.start.getTime()

          // Create an instance for each occurrence
          const instance: CalendarEvent = {
            ...event,
            // Create a unique ID for this instance
            id: `${event.id}_${instanceDate.getTime()}`,
            start: instanceDate,
            end: new Date(instanceDate.getTime() + duration),
            // Mark this as a recurring instance
            recurringEventId: event.id,
            originalStart: instanceDate,
          }

          expanded.push(instance)
        }
      } else {
        // Non-recurring event, add as-is
        expanded.push(event)
      }
    }

    // Sort by start date
    expanded.sort((a, b) => a.start.getTime() - b.start.getTime())

    return expanded
  }, [query.data, expandRecurring, dateRange])

  // Convert to BigCalendar format
  const bigCalendarEvents = useMemo(() => {
    return expandedEvents.map(toBigCalendarEvent)
  }, [expandedEvents])

  return {
    events: expandedEvents,
    bigCalendarEvents,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: () => query.refetch(),
    isFetching: query.isFetching,
  }
}

// ============================================================================
// Single Event Hook
// ============================================================================

export interface UseCalendarEventOptions {
  /** Event/node ID */
  eventId: string | null

  /** Whether the query is enabled */
  enabled?: boolean
}

export interface UseCalendarEventResult {
  /** The calendar event */
  event: CalendarEvent | null

  /** Whether the query is loading */
  isLoading: boolean

  /** Whether the query encountered an error */
  isError: boolean

  /** Error object if query failed */
  error: Error | null

  /** Refetch the event */
  refetch: () => void
}

/**
 * Fetch a single calendar event by ID
 *
 * @param options - Configuration options
 * @returns Event data and query state
 */
export function useCalendarEvent(
  options: UseCalendarEventOptions
): UseCalendarEventResult {
  const { eventId, enabled = true } = options

  const query = useQuery({
    queryKey: calendarEventKeys.detail(eventId ?? ''),
    queryFn: async () => {
      if (!eventId) {
        throw new Error('Event ID is required')
      }

      // Import dynamically to avoid circular deps
      const { getCalendarEventServerFn } = await import('../server/index.js')

      const result = await getCalendarEventServerFn({
        data: { nodeId: eventId },
      })

      if (!result.success) {
        throw new Error(result.error ?? 'Failed to fetch calendar event')
      }

      if (!result.data) {
        return null
      }

      // Convert date strings back to Date objects
      const event: CalendarEvent = {
        ...result.data,
        start: new Date(result.data.start),
        end: new Date(result.data.end),
        gcalSyncedAt: result.data.gcalSyncedAt
          ? new Date(result.data.gcalSyncedAt)
          : undefined,
        originalStart: result.data.originalStart
          ? new Date(result.data.originalStart)
          : undefined,
      }

      return event
    },
    enabled: enabled && !!eventId,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })

  return {
    event: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error as Error | null,
    refetch: () => query.refetch(),
  }
}
