/**
 * query-builder.ts - Build calendar queries using the nxus-db query system
 *
 * Pure functions for constructing QueryDefinition objects for fetching
 * calendar events and tasks within a date range.
 */

import type { DateRange } from '../types/calendar-event.js'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '@nxus/db'
import type { QueryDefinition, QueryFilter, PropertyFilter } from '@nxus/db'
import { formatISO } from 'date-fns'

// ============================================================================
// Query Building Options
// ============================================================================

/**
 * Options for building a calendar query
 */
export interface CalendarQueryOptions {
  /** Date range to query events for */
  dateRange: DateRange

  /** Whether to include completed tasks (default: true) */
  includeCompleted?: boolean

  /** Additional supertag IDs to treat as tasks */
  taskSupertags?: string[]

  /** Additional supertag IDs to treat as events */
  eventSupertags?: string[]

  /** Maximum number of results (default: 1000) */
  limit?: number

  /** Field ID to use for task status (default: field:status) */
  statusFieldId?: string

  /** Values that indicate a task is completed */
  doneStatuses?: string[]
}

// ============================================================================
// Default Values
// ============================================================================

/**
 * Default status values that indicate completion
 */
export const DEFAULT_DONE_STATUSES = ['done', 'completed', 'finished', 'closed']

/**
 * Default query limit for calendar events
 */
export const DEFAULT_CALENDAR_QUERY_LIMIT = 1000

// ============================================================================
// Query Builders
// ============================================================================

/**
 * Build a query definition for fetching calendar events within a date range
 *
 * This constructs a query that:
 * 1. Matches nodes with Task or Event supertags (or custom supertags)
 * 2. Has a start_date field set
 * 3. Falls within the specified date range
 *
 * @param options - Query building options
 * @returns QueryDefinition ready for evaluation
 */
export function buildCalendarQuery(options: CalendarQueryOptions): QueryDefinition {
  const {
    dateRange,
    includeCompleted = true,
    taskSupertags = [],
    eventSupertags = [],
    limit = DEFAULT_CALENDAR_QUERY_LIMIT,
    statusFieldId = SYSTEM_FIELDS.STATUS,
    doneStatuses = DEFAULT_DONE_STATUSES,
  } = options

  const filters: QueryFilter[] = []

  // 1. Build supertag filter (Task OR Event OR custom supertags)
  const supertagFilters: QueryFilter[] = [
    {
      type: 'supertag',
      supertagId: SYSTEM_SUPERTAGS.TASK,
      includeInherited: true,
    },
    {
      type: 'supertag',
      supertagId: SYSTEM_SUPERTAGS.EVENT,
      includeInherited: true,
    },
    // Add custom task supertags
    ...taskSupertags.map((id) => ({
      type: 'supertag' as const,
      supertagId: id,
      includeInherited: true,
    })),
    // Add custom event supertags
    ...eventSupertags.map((id) => ({
      type: 'supertag' as const,
      supertagId: id,
      includeInherited: true,
    })),
  ]

  filters.push({
    type: 'or',
    filters: supertagFilters,
  })

  // 2. Must have start_date field
  filters.push({
    type: 'hasField',
    fieldId: SYSTEM_FIELDS.START_DATE,
    negate: false,
  })

  // 3. Start date within range
  // Events that START within the range OR events that started BEFORE and end AFTER
  // For simplicity, we query events where start_date <= range.end
  // The end date filtering is handled client-side for accuracy with recurring events
  filters.push({
    type: 'property',
    fieldId: SYSTEM_FIELDS.START_DATE,
    op: 'lte',
    value: formatISO(dateRange.end),
  } as PropertyFilter)

  // Also filter events that haven't ended before the range starts
  // This is complex because end_date is optional (for tasks/instant events)
  // We'll use an OR: either no end_date, or end_date >= range.start
  // For now, we do broad filtering and refine client-side

  // 4. Optionally exclude completed tasks
  if (!includeCompleted) {
    // Add a filter to exclude completed status values
    const excludeCompletedFilters: QueryFilter[] = doneStatuses.map((status) => ({
      type: 'property' as const,
      fieldId: statusFieldId,
      op: 'neq' as const,
      value: status,
    }))

    // Also include items that don't have a status field at all
    filters.push({
      type: 'or',
      filters: [
        {
          type: 'hasField',
          fieldId: statusFieldId,
          negate: true, // Does NOT have status field
        },
        {
          type: 'and',
          filters: excludeCompletedFilters,
        },
      ],
    })
  }

  return {
    filters,
    sort: {
      field: SYSTEM_FIELDS.START_DATE,
      direction: 'asc',
    },
    limit,
  }
}

/**
 * Build a query for fetching a single calendar event by node ID
 */
export function buildEventByIdQuery(nodeId: string): QueryDefinition {
  return {
    filters: [
      {
        type: 'property',
        fieldId: 'id', // Special handling needed - this is node.id, not a property
        op: 'eq',
        value: nodeId,
      },
    ],
    limit: 1,
  }
}

/**
 * Build a query for fetching tasks only (not regular events)
 */
export function buildTasksQuery(
  options: Omit<CalendarQueryOptions, 'eventSupertags'>,
): QueryDefinition {
  const {
    dateRange,
    includeCompleted = true,
    taskSupertags = [],
    limit = DEFAULT_CALENDAR_QUERY_LIMIT,
    statusFieldId = SYSTEM_FIELDS.STATUS,
    doneStatuses = DEFAULT_DONE_STATUSES,
  } = options

  const filters: QueryFilter[] = []

  // Only tasks (not events)
  const supertagFilters: QueryFilter[] = [
    {
      type: 'supertag',
      supertagId: SYSTEM_SUPERTAGS.TASK,
      includeInherited: true,
    },
    ...taskSupertags.map((id) => ({
      type: 'supertag' as const,
      supertagId: id,
      includeInherited: true,
    })),
  ]

  filters.push({
    type: 'or',
    filters: supertagFilters,
  })

  // Must have start_date
  filters.push({
    type: 'hasField',
    fieldId: SYSTEM_FIELDS.START_DATE,
    negate: false,
  })

  // Date range filter
  filters.push({
    type: 'property',
    fieldId: SYSTEM_FIELDS.START_DATE,
    op: 'gte',
    value: formatISO(dateRange.start),
  } as PropertyFilter)

  filters.push({
    type: 'property',
    fieldId: SYSTEM_FIELDS.START_DATE,
    op: 'lte',
    value: formatISO(dateRange.end),
  } as PropertyFilter)

  // Completion filter
  if (!includeCompleted) {
    const excludeCompletedFilters: QueryFilter[] = doneStatuses.map((status) => ({
      type: 'property' as const,
      fieldId: statusFieldId,
      op: 'neq' as const,
      value: status,
    }))

    filters.push({
      type: 'or',
      filters: [
        {
          type: 'hasField',
          fieldId: statusFieldId,
          negate: true,
        },
        {
          type: 'and',
          filters: excludeCompletedFilters,
        },
      ],
    })
  }

  return {
    filters,
    sort: {
      field: SYSTEM_FIELDS.START_DATE,
      direction: 'asc',
    },
    limit,
  }
}

/**
 * Build a query for fetching events only (not tasks)
 */
export function buildEventsOnlyQuery(
  options: Omit<CalendarQueryOptions, 'taskSupertags' | 'includeCompleted' | 'statusFieldId' | 'doneStatuses'>,
): QueryDefinition {
  const {
    dateRange,
    eventSupertags = [],
    limit = DEFAULT_CALENDAR_QUERY_LIMIT,
  } = options

  const filters: QueryFilter[] = []

  // Only events
  const supertagFilters: QueryFilter[] = [
    {
      type: 'supertag',
      supertagId: SYSTEM_SUPERTAGS.EVENT,
      includeInherited: true,
    },
    ...eventSupertags.map((id) => ({
      type: 'supertag' as const,
      supertagId: id,
      includeInherited: true,
    })),
  ]

  filters.push({
    type: 'or',
    filters: supertagFilters,
  })

  // Must have start_date
  filters.push({
    type: 'hasField',
    fieldId: SYSTEM_FIELDS.START_DATE,
    negate: false,
  })

  // Date range filter
  filters.push({
    type: 'property',
    fieldId: SYSTEM_FIELDS.START_DATE,
    op: 'lte',
    value: formatISO(dateRange.end),
  } as PropertyFilter)

  return {
    filters,
    sort: {
      field: SYSTEM_FIELDS.START_DATE,
      direction: 'asc',
    },
    limit,
  }
}

/**
 * Build a query for events that need syncing to Google Calendar
 *
 * Finds events that either:
 * - Have never been synced (no gcal_event_id)
 * - Have been modified since last sync (updatedAt > gcal_synced_at)
 */
export function buildPendingSyncQuery(limit = 100): QueryDefinition {
  const filters: QueryFilter[] = [
    // Must be a calendar event (Task or Event)
    {
      type: 'or',
      filters: [
        {
          type: 'supertag',
          supertagId: SYSTEM_SUPERTAGS.TASK,
          includeInherited: true,
        },
        {
          type: 'supertag',
          supertagId: SYSTEM_SUPERTAGS.EVENT,
          includeInherited: true,
        },
      ],
    },
    // Must have start_date
    {
      type: 'hasField',
      fieldId: SYSTEM_FIELDS.START_DATE,
      negate: false,
    },
    // Never synced (no gcal_event_id)
    // Note: We'll filter modified-since-sync client-side since it requires
    // comparing two different fields which isn't directly supported
    {
      type: 'hasField',
      fieldId: SYSTEM_FIELDS.GCAL_EVENT_ID,
      negate: true, // Does NOT have gcal_event_id = never synced
    },
  ]

  return {
    filters,
    sort: {
      field: SYSTEM_FIELDS.START_DATE,
      direction: 'asc',
    },
    limit,
  }
}

/**
 * Build a query for events synced to Google Calendar
 */
export function buildSyncedEventsQuery(limit = 500): QueryDefinition {
  return {
    filters: [
      // Must have gcal_event_id
      {
        type: 'hasField',
        fieldId: SYSTEM_FIELDS.GCAL_EVENT_ID,
        negate: false,
      },
    ],
    sort: {
      field: SYSTEM_FIELDS.START_DATE,
      direction: 'asc',
    },
    limit,
  }
}

// ============================================================================
// Filter Helpers
// ============================================================================

/**
 * Create a date range property filter
 */
export function createDateRangeFilter(
  fieldId: string,
  start: Date,
  end: Date,
): QueryFilter {
  return {
    type: 'and',
    filters: [
      {
        type: 'property',
        fieldId,
        op: 'gte',
        value: formatISO(start),
      } as PropertyFilter,
      {
        type: 'property',
        fieldId,
        op: 'lte',
        value: formatISO(end),
      } as PropertyFilter,
    ],
  }
}

/**
 * Add a filter to an existing query definition
 */
export function addFilterToCalendarQuery(
  query: QueryDefinition,
  filter: QueryFilter,
): QueryDefinition {
  return {
    ...query,
    filters: [...query.filters, filter],
  }
}

/**
 * Combine multiple queries with OR (useful for multi-calendar queries)
 */
export function combineQueriesWithOr(queries: QueryDefinition[]): QueryDefinition {
  if (queries.length === 0) {
    return { filters: [], limit: DEFAULT_CALENDAR_QUERY_LIMIT }
  }

  if (queries.length === 1) {
    return queries[0]
  }

  return {
    filters: [
      {
        type: 'or',
        filters: queries.flatMap((q) => q.filters),
      },
    ],
    sort: queries[0].sort,
    limit: Math.max(...queries.map((q) => q.limit ?? DEFAULT_CALENDAR_QUERY_LIMIT)),
  }
}
