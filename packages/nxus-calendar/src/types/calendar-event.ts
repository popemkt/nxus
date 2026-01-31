/**
 * calendar-event.ts - Type definitions for calendar events and tasks
 *
 * Defines the core data structures for calendar display and manipulation.
 * These types bridge the node-based architecture with react-big-calendar.
 */

import { z } from 'zod'

// ============================================================================
// Calendar View Types
// ============================================================================

/**
 * Supported calendar view types
 */
export const CalendarViewSchema = z.enum(['day', 'week', 'month', 'agenda'])
export type CalendarView = z.infer<typeof CalendarViewSchema>

/**
 * Time format preference
 */
export const TimeFormatSchema = z.enum(['12h', '24h'])
export type TimeFormat = z.infer<typeof TimeFormatSchema>

/**
 * Week start day (0 = Sunday, 1 = Monday, 6 = Saturday)
 */
export const WeekStartSchema = z.union([z.literal(0), z.literal(1), z.literal(6)])
export type WeekStart = z.infer<typeof WeekStartSchema>

/**
 * How to display completed tasks
 */
export const CompletedTaskStyleSchema = z.enum(['muted', 'strikethrough', 'hidden'])
export type CompletedTaskStyle = z.infer<typeof CompletedTaskStyleSchema>

// ============================================================================
// Calendar Event Types
// ============================================================================

/**
 * Core calendar event representation
 *
 * This is the internal representation used throughout the calendar package.
 * It abstracts away the node-based storage details.
 */
export interface CalendarEvent {
  /** Unique identifier (node ID) */
  id: string

  /** Event title (from node content) */
  title: string

  /** Start datetime */
  start: Date

  /** End datetime */
  end: Date

  /** Whether this is an all-day event */
  allDay: boolean

  /** Whether this is a task (vs regular event) */
  isTask: boolean

  /** Whether the task is completed (only meaningful if isTask is true) */
  isCompleted: boolean

  /** RFC 5545 recurrence rule string (if recurring) */
  rrule?: string

  /** Whether this event has a reminder set */
  hasReminder: boolean

  /** Reminder offset in minutes before start time */
  reminderMinutes?: number

  /** Google Calendar event ID (if synced) */
  gcalEventId?: string

  /** Timestamp of last Google Calendar sync */
  gcalSyncedAt?: Date

  /** Reference to the source node ID */
  nodeId: string

  /** Optional display color */
  color?: string

  /** Optional description/notes */
  description?: string

  /** For recurring events: the parent event ID this instance was generated from */
  recurringEventId?: string

  /** For recurring events: which instance date this represents (for modification tracking) */
  originalStart?: Date
}

/**
 * Zod schema for CalendarEvent validation
 */
export const CalendarEventSchema = z.object({
  id: z.string(),
  title: z.string(),
  start: z.date(),
  end: z.date(),
  allDay: z.boolean(),
  isTask: z.boolean(),
  isCompleted: z.boolean(),
  rrule: z.string().optional(),
  hasReminder: z.boolean(),
  reminderMinutes: z.number().optional(),
  gcalEventId: z.string().optional(),
  gcalSyncedAt: z.date().optional(),
  nodeId: z.string(),
  color: z.string().optional(),
  description: z.string().optional(),
  recurringEventId: z.string().optional(),
  originalStart: z.date().optional(),
})

/**
 * react-big-calendar compatible event object
 *
 * This wraps CalendarEvent with the structure expected by react-big-calendar.
 * The 'resource' field contains the full event data for custom rendering.
 */
export interface BigCalendarEvent {
  /** Unique identifier for the event */
  id: string

  /** Display title */
  title: string

  /** Start datetime */
  start: Date

  /** End datetime */
  end: Date

  /** All-day flag */
  allDay?: boolean

  /** Full calendar event data for custom rendering */
  resource: CalendarEvent
}

// ============================================================================
// Event Creation/Update Types
// ============================================================================

/**
 * Input schema for creating a new calendar event
 */
export const CreateCalendarEventInputSchema = z.object({
  /** Event title */
  title: z.string().min(1, 'Title is required'),

  /** Start datetime (ISO string) */
  startDate: z.string(),

  /** End datetime (ISO string, optional - defaults to start + 1 hour) */
  endDate: z.string().optional(),

  /** Whether this is an all-day event */
  allDay: z.boolean().default(false),

  /** Whether this is a task (vs regular event) */
  isTask: z.boolean().default(false),

  /** RFC 5545 recurrence rule string */
  rrule: z.string().optional(),

  /** Reminder offset in minutes before start */
  reminder: z.number().optional(),

  /** Optional description/notes */
  description: z.string().optional(),

  /** Optional parent node ID for hierarchy */
  ownerId: z.string().optional(),
})
export type CreateCalendarEventInput = z.infer<typeof CreateCalendarEventInputSchema>

/**
 * Input schema for updating an existing calendar event
 */
export const UpdateCalendarEventInputSchema = z.object({
  /** Node ID of the event to update */
  nodeId: z.string(),

  /** Updated title */
  title: z.string().optional(),

  /** Updated start datetime (ISO string) */
  startDate: z.string().optional(),

  /** Updated end datetime (ISO string) */
  endDate: z.string().optional(),

  /** Updated all-day flag */
  allDay: z.boolean().optional(),

  /** Updated recurrence rule */
  rrule: z.string().optional(),

  /** Updated reminder offset */
  reminder: z.number().optional(),

  /** Updated description */
  description: z.string().optional(),
})
export type UpdateCalendarEventInput = z.infer<typeof UpdateCalendarEventInputSchema>

/**
 * Input schema for completing/uncompleting a task
 */
export const CompleteTaskInputSchema = z.object({
  /** Node ID of the task */
  nodeId: z.string(),

  /** Whether the task is completed */
  completed: z.boolean(),
})
export type CompleteTaskInput = z.infer<typeof CompleteTaskInputSchema>

/**
 * Input schema for deleting a calendar event
 */
export const DeleteCalendarEventInputSchema = z.object({
  /** Node ID of the event to delete */
  nodeId: z.string(),
})
export type DeleteCalendarEventInput = z.infer<typeof DeleteCalendarEventInputSchema>

// ============================================================================
// Query Types
// ============================================================================

/**
 * Input schema for fetching calendar events
 */
export const GetCalendarEventsInputSchema = z.object({
  /** Start of the date range (ISO string) */
  startDate: z.string(),

  /** End of the date range (ISO string) */
  endDate: z.string(),

  /** Whether to include completed tasks */
  includeCompleted: z.boolean().optional().default(true),

  /** Additional supertag IDs to include as tasks */
  taskSupertags: z.array(z.string()).optional(),

  /** Additional supertag IDs to include as events */
  eventSupertags: z.array(z.string()).optional(),
})
export type GetCalendarEventsInput = z.infer<typeof GetCalendarEventsInputSchema>

// ============================================================================
// Server Response Types
// ============================================================================

/**
 * Standard server function response wrapper
 */
export interface ServerResponse<T> {
  success: boolean
  data?: T
  error?: string
}

/**
 * Response type for getCalendarEvents
 */
export type GetCalendarEventsResponse = ServerResponse<CalendarEvent[]>

/**
 * Response type for event mutations
 */
export type CalendarEventMutationResponse = ServerResponse<CalendarEvent>

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Date range for calendar queries
 */
export interface DateRange {
  start: Date
  end: Date
}

/**
 * Zod schema for date range validation
 */
export const DateRangeSchema = z.object({
  start: z.date(),
  end: z.date(),
})

/**
 * Event drop info from react-big-calendar drag-and-drop
 */
export interface EventDropInfo {
  event: BigCalendarEvent
  start: Date
  end: Date
  isAllDay: boolean
}

/**
 * Event resize info from react-big-calendar
 */
export interface EventResizeInfo {
  event: BigCalendarEvent
  start: Date
  end: Date
}

/**
 * Slot selection info from react-big-calendar
 */
export interface SlotSelectInfo {
  start: Date
  end: Date
  slots: Date[]
  action: 'select' | 'click' | 'doubleClick'
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if an event is a task
 */
export function isTaskEvent(event: CalendarEvent): boolean {
  return event.isTask
}

/**
 * Type guard to check if an event is recurring
 */
export function isRecurringEvent(event: CalendarEvent): boolean {
  return !!event.rrule
}

/**
 * Type guard to check if an event is synced to Google Calendar
 */
export function isSyncedToGoogle(event: CalendarEvent): boolean {
  return !!event.gcalEventId
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert CalendarEvent to BigCalendarEvent
 */
export function toBigCalendarEvent(event: CalendarEvent): BigCalendarEvent {
  return {
    id: event.id,
    title: event.title,
    start: event.start,
    end: event.end,
    allDay: event.allDay,
    resource: event,
  }
}

/**
 * Create a default CalendarEvent with required fields
 */
export function createDefaultEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  const now = new Date()
  const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)

  return {
    id: '',
    title: '',
    start: now,
    end: oneHourLater,
    allDay: false,
    isTask: false,
    isCompleted: false,
    hasReminder: false,
    nodeId: '',
    ...overrides,
  }
}
