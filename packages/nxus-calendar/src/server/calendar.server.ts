/**
 * calendar.server.ts - Server functions for calendar event CRUD operations
 *
 * Provides server-side functions for fetching, creating, updating, and deleting
 * calendar events and tasks using the node-based architecture.
 */

import { createServerFn } from '@tanstack/react-start'
import {
  initDatabase,
  saveDatabase,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  assembleNode,
  createNode,
  deleteNode,
  setProperty,
  updateNodeContent,
  getProperty,
  evaluateQuery,
  type AssembledNode,
} from '@nxus/db/server'
import {
  GetCalendarEventsInputSchema,
  CreateCalendarEventInputSchema,
  UpdateCalendarEventInputSchema,
  CompleteTaskInputSchema,
  DeleteCalendarEventInputSchema,
  type CalendarEvent,
  type GetCalendarEventsResponse,
  type CalendarEventMutationResponse,
  type ServerResponse,
} from '../types/calendar-event.js'
import { buildCalendarQuery } from '../lib/query-builder.js'
import { getNextInstance } from '../lib/rrule-utils.js'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Convert an assembled node to a CalendarEvent
 */
function nodeToCalendarEvent(node: AssembledNode): CalendarEvent {
  const startDateStr = getProperty<string>(node, 'start_date')
  const endDateStr = getProperty<string>(node, 'end_date')
  const allDay = getProperty<boolean>(node, 'all_day') ?? false
  const rrule = getProperty<string>(node, 'rrule')
  const reminder = getProperty<number>(node, 'reminder')
  const gcalEventId = getProperty<string>(node, 'gcal_event_id')
  const gcalSyncedAtStr = getProperty<string>(node, 'gcal_synced_at')
  const status = getProperty<string>(node, 'status')
  const description = getProperty<string>(node, 'description')

  // Determine if this is a task by checking supertags
  const isTask = node.supertags.some(
    (st) => st.systemId === SYSTEM_SUPERTAGS.TASK,
  )

  // Determine if completed (for tasks)
  const doneStatuses = ['done', 'completed', 'finished', 'closed']
  const isCompleted = isTask && status ? doneStatuses.includes(status.toLowerCase()) : false

  // Parse dates
  const start = startDateStr ? new Date(startDateStr) : new Date()
  let end = endDateStr ? new Date(endDateStr) : new Date(start)

  // If no end date, default to 1 hour after start for timed events
  if (!endDateStr && !allDay) {
    end = new Date(start.getTime() + 60 * 60 * 1000)
  }

  // For all-day events, ensure end is at least the same day
  if (allDay && !endDateStr) {
    end = start
  }

  return {
    id: node.id,
    nodeId: node.id,
    title: node.content || 'Untitled',
    start,
    end,
    allDay,
    isTask,
    isCompleted,
    rrule: rrule || undefined,
    hasReminder: reminder !== undefined && reminder !== null,
    reminderMinutes: reminder,
    gcalEventId: gcalEventId || undefined,
    gcalSyncedAt: gcalSyncedAtStr ? new Date(gcalSyncedAtStr) : undefined,
    description: description || undefined,
  }
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get calendar events within a date range
 *
 * Uses the query evaluator to fetch nodes with Task or Event supertags
 * that have a start_date within the specified range.
 */
export const getCalendarEventsServerFn = createServerFn({ method: 'POST' })
  .validator(GetCalendarEventsInputSchema)
  .handler(async ({ data }): Promise<GetCalendarEventsResponse> => {
    try {
      console.log('[getCalendarEventsServerFn] Input:', data)
      const {
        startDate,
        endDate,
        includeCompleted = true,
        taskSupertags = [],
        eventSupertags = [],
      } = data

      const db = initDatabase()

      // Build the query for calendar events
      const query = buildCalendarQuery({
        dateRange: {
          start: new Date(startDate),
          end: new Date(endDate),
        },
        includeCompleted,
        taskSupertags,
        eventSupertags,
      })

      // Evaluate the query
      const result = evaluateQuery(db, query)
      console.log('[getCalendarEventsServerFn] Found:', result.totalCount, 'events')

      // Convert nodes to CalendarEvent objects
      const events: CalendarEvent[] = result.nodes.map(nodeToCalendarEvent)

      // Additional client-side filtering: filter out events that end before the range starts
      const rangeStart = new Date(startDate)
      const filteredEvents = events.filter((event) => {
        // Keep events that overlap with the date range
        return event.end >= rangeStart
      })

      console.log('[getCalendarEventsServerFn] After filtering:', filteredEvents.length)
      return { success: true, data: filteredEvents }
    } catch (error) {
      console.error('[getCalendarEventsServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Create a new calendar event or task
 */
export const createCalendarEventServerFn = createServerFn({ method: 'POST' })
  .validator(CreateCalendarEventInputSchema)
  .handler(async ({ data }): Promise<CalendarEventMutationResponse> => {
    try {
      console.log('[createCalendarEventServerFn] Input:', data)
      const {
        title,
        startDate,
        endDate,
        allDay = false,
        isTask = false,
        rrule,
        reminder,
        description,
        ownerId,
      } = data

      const db = initDatabase()

      // Create the node with appropriate supertag
      const supertagId = isTask ? SYSTEM_SUPERTAGS.TASK : SYSTEM_SUPERTAGS.EVENT
      const nodeId = createNode(db, {
        content: title,
        supertagId,
        ownerId,
      })

      // Set start date (required)
      setProperty(db, nodeId, SYSTEM_FIELDS.START_DATE, startDate)

      // Set end date (optional, defaults to start + 1 hour if not all-day)
      if (endDate) {
        setProperty(db, nodeId, SYSTEM_FIELDS.END_DATE, endDate)
      } else if (!allDay) {
        // Default to 1 hour after start for timed events
        const defaultEnd = new Date(new Date(startDate).getTime() + 60 * 60 * 1000)
        setProperty(db, nodeId, SYSTEM_FIELDS.END_DATE, defaultEnd.toISOString())
      }

      // Set all-day flag
      setProperty(db, nodeId, SYSTEM_FIELDS.ALL_DAY, allDay)

      // Set optional fields
      if (rrule) {
        setProperty(db, nodeId, SYSTEM_FIELDS.RRULE, rrule)
      }

      if (reminder !== undefined) {
        setProperty(db, nodeId, SYSTEM_FIELDS.REMINDER, reminder)
      }

      if (description) {
        setProperty(db, nodeId, SYSTEM_FIELDS.DESCRIPTION, description)
      }

      // For tasks, set initial status
      if (isTask) {
        setProperty(db, nodeId, SYSTEM_FIELDS.STATUS, 'pending')
      }

      saveDatabase()

      // Assemble and return the created event
      const node = assembleNode(db, nodeId)
      if (!node) {
        return { success: false, error: 'Failed to assemble created node' }
      }

      const event = nodeToCalendarEvent(node)
      console.log('[createCalendarEventServerFn] Created:', nodeId)
      return { success: true, data: event }
    } catch (error) {
      console.error('[createCalendarEventServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Update an existing calendar event
 */
export const updateCalendarEventServerFn = createServerFn({ method: 'POST' })
  .validator(UpdateCalendarEventInputSchema)
  .handler(async ({ data }): Promise<CalendarEventMutationResponse> => {
    try {
      console.log('[updateCalendarEventServerFn] Input:', data)
      const {
        nodeId,
        title,
        startDate,
        endDate,
        allDay,
        rrule,
        reminder,
        description,
      } = data

      const db = initDatabase()

      // Update title if provided
      if (title !== undefined) {
        updateNodeContent(db, nodeId, title)
      }

      // Update dates
      if (startDate !== undefined) {
        setProperty(db, nodeId, SYSTEM_FIELDS.START_DATE, startDate)
      }

      if (endDate !== undefined) {
        setProperty(db, nodeId, SYSTEM_FIELDS.END_DATE, endDate)
      }

      // Update all-day flag
      if (allDay !== undefined) {
        setProperty(db, nodeId, SYSTEM_FIELDS.ALL_DAY, allDay)
      }

      // Update recurrence rule
      if (rrule !== undefined) {
        setProperty(db, nodeId, SYSTEM_FIELDS.RRULE, rrule)
      }

      // Update reminder
      if (reminder !== undefined) {
        setProperty(db, nodeId, SYSTEM_FIELDS.REMINDER, reminder)
      }

      // Update description
      if (description !== undefined) {
        setProperty(db, nodeId, SYSTEM_FIELDS.DESCRIPTION, description)
      }

      saveDatabase()

      // Assemble and return the updated event
      const node = assembleNode(db, nodeId)
      if (!node) {
        return { success: false, error: 'Event not found' }
      }

      const event = nodeToCalendarEvent(node)
      console.log('[updateCalendarEventServerFn] Updated:', nodeId)
      return { success: true, data: event }
    } catch (error) {
      console.error('[updateCalendarEventServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Delete a calendar event (soft delete)
 */
export const deleteCalendarEventServerFn = createServerFn({ method: 'POST' })
  .validator(DeleteCalendarEventInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<void>> => {
    try {
      console.log('[deleteCalendarEventServerFn] Input:', data)
      const { nodeId } = data

      const db = initDatabase()

      // Verify the node exists before deleting
      const node = assembleNode(db, nodeId)
      if (!node) {
        return { success: false, error: 'Event not found' }
      }

      // Soft delete the node
      deleteNode(db, nodeId)
      saveDatabase()

      console.log('[deleteCalendarEventServerFn] Deleted:', nodeId)
      return { success: true }
    } catch (error) {
      console.error('[deleteCalendarEventServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Toggle task completion status
 *
 * For recurring tasks:
 * - When marking complete: Mark current instance as done and create next instance
 * - When marking incomplete: Simply revert the status
 */
export const completeTaskServerFn = createServerFn({ method: 'POST' })
  .validator(CompleteTaskInputSchema)
  .handler(async ({ data }): Promise<CalendarEventMutationResponse> => {
    try {
      console.log('[completeTaskServerFn] Input:', data)
      const { nodeId, completed } = data

      const db = initDatabase()

      // Verify the node exists
      const node = assembleNode(db, nodeId)
      if (!node) {
        return { success: false, error: 'Task not found' }
      }

      // Verify it's a task
      const isTask = node.supertags.some(
        (st) => st.systemId === SYSTEM_SUPERTAGS.TASK,
      )
      if (!isTask) {
        return { success: false, error: 'Node is not a task' }
      }

      // Check if this is a recurring task
      const rrule = getProperty<string>(node, 'rrule')
      const isRecurring = !!rrule

      // Update the status
      const newStatus = completed ? 'done' : 'pending'
      setProperty(db, nodeId, SYSTEM_FIELDS.STATUS, newStatus)

      // For recurring tasks being marked as complete, create the next instance
      if (completed && isRecurring && rrule) {
        const currentStartStr = getProperty<string>(node, 'start_date')
        const currentEndStr = getProperty<string>(node, 'end_date')
        const allDay = getProperty<boolean>(node, 'all_day') ?? false
        const reminder = getProperty<number>(node, 'reminder')
        const description = getProperty<string>(node, 'description')

        const currentStart = currentStartStr ? new Date(currentStartStr) : new Date()
        const currentEnd = currentEndStr ? new Date(currentEndStr) : new Date(currentStart.getTime() + 60 * 60 * 1000)

        // Calculate duration of the task
        const duration = currentEnd.getTime() - currentStart.getTime()

        // Get the next occurrence based on the current start date
        const nextOccurrence = getNextInstance(rrule, currentStart)

        if (nextOccurrence) {
          // Create a new task node for the next occurrence
          const nextTaskId = createNode(db, {
            content: node.content,
            supertagId: SYSTEM_SUPERTAGS.TASK,
            ownerId: node.ownerId,
          })

          // Set the dates for the next occurrence
          setProperty(db, nextTaskId, SYSTEM_FIELDS.START_DATE, nextOccurrence.toISOString())
          setProperty(db, nextTaskId, SYSTEM_FIELDS.END_DATE, new Date(nextOccurrence.getTime() + duration).toISOString())
          setProperty(db, nextTaskId, SYSTEM_FIELDS.ALL_DAY, allDay)
          setProperty(db, nextTaskId, SYSTEM_FIELDS.RRULE, rrule)
          setProperty(db, nextTaskId, SYSTEM_FIELDS.STATUS, 'pending')

          // Copy optional fields
          if (reminder !== undefined && reminder !== null) {
            setProperty(db, nextTaskId, SYSTEM_FIELDS.REMINDER, reminder)
          }
          if (description) {
            setProperty(db, nextTaskId, SYSTEM_FIELDS.DESCRIPTION, description)
          }

          console.log('[completeTaskServerFn] Created next recurring task instance:', nextTaskId, 'at', nextOccurrence.toISOString())
        } else {
          console.log('[completeTaskServerFn] No more occurrences for recurring task')
        }

        // Remove the rrule from the completed task so it doesn't expand again
        // The recurrence pattern is now carried by the new instance
        setProperty(db, nodeId, SYSTEM_FIELDS.RRULE, '')
      }

      saveDatabase()

      // Assemble and return the updated event
      const updatedNode = assembleNode(db, nodeId)
      if (!updatedNode) {
        return { success: false, error: 'Failed to assemble updated task' }
      }

      const event = nodeToCalendarEvent(updatedNode)
      console.log('[completeTaskServerFn] Task marked as:', newStatus)
      return { success: true, data: event }
    } catch (error) {
      console.error('[completeTaskServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Get a single calendar event by node ID
 */
export const getCalendarEventServerFn = createServerFn({ method: 'POST' })
  .validator(DeleteCalendarEventInputSchema) // Same schema - just needs nodeId
  .handler(async ({ data }): Promise<CalendarEventMutationResponse> => {
    try {
      console.log('[getCalendarEventServerFn] Input:', data)
      const { nodeId } = data

      const db = initDatabase()

      const node = assembleNode(db, nodeId)
      if (!node) {
        return { success: false, error: 'Event not found' }
      }

      // Verify it's a calendar event or task
      const isCalendarNode = node.supertags.some(
        (st) =>
          st.systemId === SYSTEM_SUPERTAGS.TASK ||
          st.systemId === SYSTEM_SUPERTAGS.EVENT,
      )
      if (!isCalendarNode) {
        return { success: false, error: 'Node is not a calendar event or task' }
      }

      const event = nodeToCalendarEvent(node)
      return { success: true, data: event }
    } catch (error) {
      console.error('[getCalendarEventServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })
