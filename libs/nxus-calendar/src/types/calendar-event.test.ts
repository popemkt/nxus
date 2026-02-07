import { describe, it, expect } from 'vitest'
import {
  CalendarViewSchema,
  TimeFormatSchema,
  WeekStartSchema,
  CompletedTaskStyleSchema,
  CalendarEventSchema,
  CreateCalendarEventInputSchema,
  UpdateCalendarEventInputSchema,
  CompleteTaskInputSchema,
  DeleteCalendarEventInputSchema,
  isTaskEvent,
  isRecurringEvent,
  isSyncedToGoogle,
  toBigCalendarEvent,
  createDefaultEvent,
} from './calendar-event.js'
import type { CalendarEvent } from './calendar-event.js'

// ============================================================================
// Zod Schema Validations
// ============================================================================

describe('CalendarViewSchema', () => {
  it('accepts valid views', () => {
    expect(CalendarViewSchema.parse('day')).toBe('day')
    expect(CalendarViewSchema.parse('week')).toBe('week')
    expect(CalendarViewSchema.parse('month')).toBe('month')
    expect(CalendarViewSchema.parse('agenda')).toBe('agenda')
  })

  it('rejects invalid views', () => {
    expect(() => CalendarViewSchema.parse('year')).toThrow()
  })
})

describe('TimeFormatSchema', () => {
  it('accepts valid formats', () => {
    expect(TimeFormatSchema.parse('12h')).toBe('12h')
    expect(TimeFormatSchema.parse('24h')).toBe('24h')
  })

  it('rejects invalid formats', () => {
    expect(() => TimeFormatSchema.parse('48h')).toThrow()
  })
})

describe('WeekStartSchema', () => {
  it('accepts valid week starts', () => {
    expect(WeekStartSchema.parse(0)).toBe(0)
    expect(WeekStartSchema.parse(1)).toBe(1)
    expect(WeekStartSchema.parse(6)).toBe(6)
  })

  it('rejects invalid week starts', () => {
    expect(() => WeekStartSchema.parse(3)).toThrow()
  })
})

describe('CompletedTaskStyleSchema', () => {
  it('accepts valid styles', () => {
    expect(CompletedTaskStyleSchema.parse('muted')).toBe('muted')
    expect(CompletedTaskStyleSchema.parse('strikethrough')).toBe('strikethrough')
    expect(CompletedTaskStyleSchema.parse('hidden')).toBe('hidden')
  })
})

describe('CreateCalendarEventInputSchema', () => {
  it('validates a minimal event', () => {
    const result = CreateCalendarEventInputSchema.parse({
      title: 'Test Event',
      startDate: '2026-01-15T09:00:00Z',
    })
    expect(result.title).toBe('Test Event')
    expect(result.allDay).toBe(false)
    expect(result.isTask).toBe(false)
  })

  it('rejects empty title', () => {
    expect(() =>
      CreateCalendarEventInputSchema.parse({
        title: '',
        startDate: '2026-01-15T09:00:00Z',
      }),
    ).toThrow()
  })

  it('validates all optional fields', () => {
    const result = CreateCalendarEventInputSchema.parse({
      title: 'Full Event',
      startDate: '2026-01-15T09:00:00Z',
      endDate: '2026-01-15T10:00:00Z',
      allDay: true,
      isTask: true,
      rrule: 'RRULE:FREQ=DAILY',
      reminder: 15,
      description: 'Some notes',
      ownerId: 'parent-123',
    })
    expect(result.allDay).toBe(true)
    expect(result.isTask).toBe(true)
    expect(result.reminder).toBe(15)
  })
})

describe('UpdateCalendarEventInputSchema', () => {
  it('requires nodeId', () => {
    const result = UpdateCalendarEventInputSchema.parse({ nodeId: 'node-123' })
    expect(result.nodeId).toBe('node-123')
  })

  it('accepts partial updates', () => {
    const result = UpdateCalendarEventInputSchema.parse({
      nodeId: 'node-123',
      title: 'Updated Title',
    })
    expect(result.title).toBe('Updated Title')
    expect(result.startDate).toBeUndefined()
  })
})

describe('CompleteTaskInputSchema', () => {
  it('validates completion input', () => {
    const result = CompleteTaskInputSchema.parse({
      nodeId: 'node-123',
      completed: true,
    })
    expect(result.completed).toBe(true)
  })
})

describe('DeleteCalendarEventInputSchema', () => {
  it('validates deletion input', () => {
    const result = DeleteCalendarEventInputSchema.parse({ nodeId: 'node-123' })
    expect(result.nodeId).toBe('node-123')
  })
})

// ============================================================================
// Type Guards
// ============================================================================

function createMockEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Test Event',
    start: new Date(2026, 0, 15, 9, 0),
    end: new Date(2026, 0, 15, 10, 0),
    allDay: false,
    isTask: false,
    isCompleted: false,
    hasReminder: false,
    nodeId: 'node-1',
    ...overrides,
  }
}

describe('isTaskEvent', () => {
  it('returns true for tasks', () => {
    expect(isTaskEvent(createMockEvent({ isTask: true }))).toBe(true)
  })

  it('returns false for non-tasks', () => {
    expect(isTaskEvent(createMockEvent({ isTask: false }))).toBe(false)
  })
})

describe('isRecurringEvent', () => {
  it('returns true for recurring events', () => {
    expect(isRecurringEvent(createMockEvent({ rrule: 'RRULE:FREQ=DAILY' }))).toBe(true)
  })

  it('returns false for non-recurring events', () => {
    expect(isRecurringEvent(createMockEvent())).toBe(false)
  })
})

describe('isSyncedToGoogle', () => {
  it('returns true for synced events', () => {
    expect(isSyncedToGoogle(createMockEvent({ gcalEventId: 'gcal-123' }))).toBe(true)
  })

  it('returns false for unsynced events', () => {
    expect(isSyncedToGoogle(createMockEvent())).toBe(false)
  })
})

// ============================================================================
// Helper Functions
// ============================================================================

describe('toBigCalendarEvent', () => {
  it('converts CalendarEvent to BigCalendarEvent', () => {
    const event = createMockEvent({ id: 'evt-1', title: 'Meeting', allDay: true })
    const bigEvent = toBigCalendarEvent(event)
    expect(bigEvent.id).toBe('evt-1')
    expect(bigEvent.title).toBe('Meeting')
    expect(bigEvent.start).toBe(event.start)
    expect(bigEvent.end).toBe(event.end)
    expect(bigEvent.allDay).toBe(true)
    expect(bigEvent.resource).toBe(event)
  })
})

describe('createDefaultEvent', () => {
  it('creates an event with default values', () => {
    const event = createDefaultEvent()
    expect(event.id).toBe('')
    expect(event.title).toBe('')
    expect(event.allDay).toBe(false)
    expect(event.isTask).toBe(false)
    expect(event.isCompleted).toBe(false)
    expect(event.hasReminder).toBe(false)
    expect(event.nodeId).toBe('')
  })

  it('applies overrides', () => {
    const event = createDefaultEvent({
      id: 'custom-id',
      title: 'Custom Event',
      isTask: true,
    })
    expect(event.id).toBe('custom-id')
    expect(event.title).toBe('Custom Event')
    expect(event.isTask).toBe(true)
    expect(event.allDay).toBe(false) // Non-overridden default
  })

  it('creates end time 1 hour after start', () => {
    const event = createDefaultEvent()
    const diffMs = event.end.getTime() - event.start.getTime()
    expect(diffMs).toBe(60 * 60 * 1000) // 1 hour in ms
  })
})
