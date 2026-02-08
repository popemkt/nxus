import { describe, it, expect } from 'vitest'
import {
  buildCalendarQuery,
  buildEventByIdQuery,
  buildTasksQuery,
  buildEventsOnlyQuery,
  buildPendingSyncQuery,
  buildSyncedEventsQuery,
  createDateRangeFilter,
  addFilterToCalendarQuery,
  combineQueriesWithOr,
  DEFAULT_DONE_STATUSES,
  DEFAULT_CALENDAR_QUERY_LIMIT,
} from './query-builder.js'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '@nxus/db'

const dateRange = {
  start: new Date(2026, 0, 1),
  end: new Date(2026, 0, 31),
}

// ============================================================================
// buildCalendarQuery
// ============================================================================

describe('buildCalendarQuery', () => {
  it('builds a query with default options', () => {
    const query = buildCalendarQuery({ dateRange })
    expect(query.filters.length).toBeGreaterThanOrEqual(3) // supertag OR + hasField + property
    expect(query.sort).toEqual({
      field: SYSTEM_FIELDS.START_DATE,
      direction: 'asc',
    })
    expect(query.limit).toBe(DEFAULT_CALENDAR_QUERY_LIMIT)
  })

  it('includes Task and Event supertag filters', () => {
    const query = buildCalendarQuery({ dateRange })
    const orFilter = query.filters.find((f: any) => f.type === 'or')
    expect(orFilter).toBeDefined()
    const subFilters = (orFilter as any).filters
    const supertagIds = subFilters
      .filter((f: any) => f.type === 'supertag')
      .map((f: any) => f.supertagId)
    expect(supertagIds).toContain(SYSTEM_SUPERTAGS.TASK)
    expect(supertagIds).toContain(SYSTEM_SUPERTAGS.EVENT)
  })

  it('includes hasField filter for START_DATE', () => {
    const query = buildCalendarQuery({ dateRange })
    const hasField = query.filters.find(
      (f: any) => f.type === 'hasField' && f.fieldId === SYSTEM_FIELDS.START_DATE,
    )
    expect(hasField).toBeDefined()
  })

  it('includes date range property filter', () => {
    const query = buildCalendarQuery({ dateRange })
    const propFilter = query.filters.find(
      (f: any) => f.type === 'property' && f.fieldId === SYSTEM_FIELDS.START_DATE,
    )
    expect(propFilter).toBeDefined()
  })

  it('adds custom task supertags', () => {
    const query = buildCalendarQuery({
      dateRange,
      taskSupertags: ['custom-task-tag'],
    })
    const orFilter = query.filters.find((f: any) => f.type === 'or')
    const subFilters = (orFilter as any).filters
    const supertagIds = subFilters
      .filter((f: any) => f.type === 'supertag')
      .map((f: any) => f.supertagId)
    expect(supertagIds).toContain('custom-task-tag')
  })

  it('adds custom event supertags', () => {
    const query = buildCalendarQuery({
      dateRange,
      eventSupertags: ['custom-event-tag'],
    })
    const orFilter = query.filters.find((f: any) => f.type === 'or')
    const subFilters = (orFilter as any).filters
    const supertagIds = subFilters
      .filter((f: any) => f.type === 'supertag')
      .map((f: any) => f.supertagId)
    expect(supertagIds).toContain('custom-event-tag')
  })

  it('respects custom limit', () => {
    const query = buildCalendarQuery({ dateRange, limit: 50 })
    expect(query.limit).toBe(50)
  })

  it('excludes completed tasks when includeCompleted is false', () => {
    const query = buildCalendarQuery({ dateRange, includeCompleted: false })
    // Should have an extra OR filter for excluding completed
    expect(query.filters.length).toBeGreaterThan(3)
    const completionFilter = query.filters.find(
      (f: any) =>
        f.type === 'or' &&
        f.filters?.some((sf: any) => sf.type === 'hasField' && sf.negate === true),
    )
    expect(completionFilter).toBeDefined()
  })

  it('includes completed tasks by default', () => {
    const query = buildCalendarQuery({ dateRange })
    // Should NOT have the completion exclusion filter
    const completionFilter = query.filters.find(
      (f: any) =>
        f.type === 'or' &&
        f.filters?.some(
          (sf: any) =>
            sf.type === 'hasField' &&
            sf.negate === true &&
            sf.fieldId === SYSTEM_FIELDS.STATUS,
        ),
    )
    expect(completionFilter).toBeUndefined()
  })
})

// ============================================================================
// buildEventByIdQuery
// ============================================================================

describe('buildEventByIdQuery', () => {
  it('builds a query for a specific node', () => {
    const query = buildEventByIdQuery('node-123')
    expect(query.limit).toBe(1)
    expect(query.filters).toHaveLength(1)
    expect(query.filters[0]).toMatchObject({
      type: 'property',
      fieldId: 'id',
      op: 'eq',
      value: 'node-123',
    })
  })
})

// ============================================================================
// buildTasksQuery
// ============================================================================

describe('buildTasksQuery', () => {
  it('includes only Task supertag (not Event)', () => {
    const query = buildTasksQuery({ dateRange })
    const orFilter = query.filters.find((f: any) => f.type === 'or')
    const subFilters = (orFilter as any).filters
    const supertagIds = subFilters
      .filter((f: any) => f.type === 'supertag')
      .map((f: any) => f.supertagId)
    expect(supertagIds).toContain(SYSTEM_SUPERTAGS.TASK)
    expect(supertagIds).not.toContain(SYSTEM_SUPERTAGS.EVENT)
  })

  it('includes date range filters (gte and lte)', () => {
    const query = buildTasksQuery({ dateRange })
    const propFilters = query.filters.filter(
      (f: any) => f.type === 'property' && f.fieldId === SYSTEM_FIELDS.START_DATE,
    )
    expect(propFilters).toHaveLength(2) // gte + lte
    const ops = propFilters.map((f: any) => f.op)
    expect(ops).toContain('gte')
    expect(ops).toContain('lte')
  })

  it('sorts by START_DATE ascending', () => {
    const query = buildTasksQuery({ dateRange })
    expect(query.sort).toEqual({
      field: SYSTEM_FIELDS.START_DATE,
      direction: 'asc',
    })
  })
})

// ============================================================================
// buildEventsOnlyQuery
// ============================================================================

describe('buildEventsOnlyQuery', () => {
  it('includes only Event supertag (not Task)', () => {
    const query = buildEventsOnlyQuery({ dateRange })
    const orFilter = query.filters.find((f: any) => f.type === 'or')
    const subFilters = (orFilter as any).filters
    const supertagIds = subFilters
      .filter((f: any) => f.type === 'supertag')
      .map((f: any) => f.supertagId)
    expect(supertagIds).toContain(SYSTEM_SUPERTAGS.EVENT)
    expect(supertagIds).not.toContain(SYSTEM_SUPERTAGS.TASK)
  })

  it('uses lte filter only (no gte for broad retrieval)', () => {
    const query = buildEventsOnlyQuery({ dateRange })
    const propFilters = query.filters.filter(
      (f: any) => f.type === 'property' && f.fieldId === SYSTEM_FIELDS.START_DATE,
    )
    expect(propFilters).toHaveLength(1)
    expect(propFilters[0].op).toBe('lte')
  })
})

// ============================================================================
// buildPendingSyncQuery
// ============================================================================

describe('buildPendingSyncQuery', () => {
  it('filters for events without gcal_event_id', () => {
    const query = buildPendingSyncQuery()
    const noGcalFilter = query.filters.find(
      (f: any) => f.type === 'hasField' && f.fieldId === SYSTEM_FIELDS.GCAL_EVENT_ID,
    )
    expect(noGcalFilter).toBeDefined()
    expect((noGcalFilter as any).negate).toBe(true) // Does NOT have gcal_event_id
  })

  it('includes both Task and Event supertags', () => {
    const query = buildPendingSyncQuery()
    const orFilter = query.filters.find((f: any) => f.type === 'or')
    expect(orFilter).toBeDefined()
  })

  it('respects custom limit', () => {
    const query = buildPendingSyncQuery(50)
    expect(query.limit).toBe(50)
  })

  it('defaults to limit of 100', () => {
    const query = buildPendingSyncQuery()
    expect(query.limit).toBe(100)
  })
})

// ============================================================================
// buildSyncedEventsQuery
// ============================================================================

describe('buildSyncedEventsQuery', () => {
  it('filters for events with gcal_event_id', () => {
    const query = buildSyncedEventsQuery()
    const hasGcalFilter = query.filters.find(
      (f: any) => f.type === 'hasField' && f.fieldId === SYSTEM_FIELDS.GCAL_EVENT_ID,
    )
    expect(hasGcalFilter).toBeDefined()
    expect((hasGcalFilter as any).negate).toBe(false)
  })

  it('defaults to limit of 500', () => {
    const query = buildSyncedEventsQuery()
    expect(query.limit).toBe(500)
  })
})

// ============================================================================
// Filter Helpers
// ============================================================================

describe('createDateRangeFilter', () => {
  it('creates an AND filter with gte and lte', () => {
    const start = new Date(2026, 0, 1)
    const end = new Date(2026, 0, 31)
    const filter = createDateRangeFilter('start_date', start, end) as any
    expect(filter.type).toBe('and')
    expect(filter.filters).toHaveLength(2)
    expect(filter.filters[0].op).toBe('gte')
    expect(filter.filters[1].op).toBe('lte')
  })
})

describe('addFilterToCalendarQuery', () => {
  it('appends a filter to an existing query', () => {
    const query = buildCalendarQuery({ dateRange })
    const originalCount = query.filters.length
    const newFilter = { type: 'property' as const, fieldId: 'color', op: 'eq' as const, value: 'red' }
    const updated = addFilterToCalendarQuery(query, newFilter as any)
    expect(updated.filters.length).toBe(originalCount + 1)
    expect(updated.filters[updated.filters.length - 1]).toBe(newFilter)
  })

  it('does not mutate the original query', () => {
    const query = buildCalendarQuery({ dateRange })
    const originalCount = query.filters.length
    addFilterToCalendarQuery(query, { type: 'property', fieldId: 'x', op: 'eq', value: 'y' } as any)
    expect(query.filters.length).toBe(originalCount)
  })
})

describe('combineQueriesWithOr', () => {
  it('returns empty query for no queries', () => {
    const result = combineQueriesWithOr([])
    expect(result.filters).toEqual([])
    expect(result.limit).toBe(DEFAULT_CALENDAR_QUERY_LIMIT)
  })

  it('returns the single query unchanged', () => {
    const query = buildCalendarQuery({ dateRange })
    const result = combineQueriesWithOr([query])
    expect(result).toBe(query)
  })

  it('combines multiple queries with OR', () => {
    const q1 = buildCalendarQuery({ dateRange, limit: 100 })
    const q2 = buildTasksQuery({ dateRange, limit: 200 })
    const result = combineQueriesWithOr([q1, q2])
    expect(result.filters).toHaveLength(1)
    expect((result.filters[0] as any).type).toBe('or')
    // Limit should be max of all queries
    expect(result.limit).toBe(Math.max(100, 200))
  })
})

// ============================================================================
// Constants
// ============================================================================

describe('DEFAULT_DONE_STATUSES', () => {
  it('contains expected values', () => {
    expect(DEFAULT_DONE_STATUSES).toContain('done')
    expect(DEFAULT_DONE_STATUSES).toContain('completed')
    expect(DEFAULT_DONE_STATUSES).toContain('finished')
    expect(DEFAULT_DONE_STATUSES).toContain('closed')
  })
})
