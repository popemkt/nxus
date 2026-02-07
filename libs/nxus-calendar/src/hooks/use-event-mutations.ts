/**
 * use-event-mutations.ts - React hooks for calendar event mutations
 *
 * Provides TanStack Query mutations for:
 * - Creating new events and tasks
 * - Updating existing events
 * - Deleting events
 * - Completing/uncompleting tasks
 *
 * All mutations include optimistic updates and query invalidation.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query'
import type {
  CalendarEvent,
  CreateCalendarEventInput,
  UpdateCalendarEventInput,
  CompleteTaskInput,
} from '../types/calendar-event.js'
import {
  createCalendarEventServerFn,
  updateCalendarEventServerFn,
  deleteCalendarEventServerFn,
  completeTaskServerFn,
} from '../server/index.js'
import { calendarEventKeys } from './use-calendar-events.js'

// ============================================================================
// Types
// ============================================================================

export interface MutationCallbacks<TData = void> {
  /** Called when mutation succeeds */
  onSuccess?: (data: TData) => void

  /** Called when mutation fails */
  onError?: (error: Error) => void

  /** Called when mutation settles (success or error) */
  onSettled?: () => void
}

// ============================================================================
// Create Event Hook
// ============================================================================

export interface UseCreateEventOptions extends MutationCallbacks<CalendarEvent> {}

export interface UseCreateEventResult {
  /** Create a new calendar event */
  createEvent: (input: CreateCalendarEventInput) => Promise<CalendarEvent>

  /** Whether the mutation is in progress */
  isCreating: boolean

  /** Error from the mutation */
  error: Error | null

  /** Reset the mutation state */
  reset: () => void
}

/**
 * Hook for creating calendar events
 *
 * @param options - Callbacks for mutation lifecycle
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { createEvent, isCreating } = useCreateEvent({
 *   onSuccess: (event) => console.log('Created:', event.id),
 * })
 *
 * await createEvent({
 *   title: 'Team Meeting',
 *   startDate: new Date().toISOString(),
 *   isTask: false,
 * })
 * ```
 */
export function useCreateEvent(
  options: UseCreateEventOptions = {}
): UseCreateEventResult {
  const { onSuccess, onError, onSettled } = options
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: CreateCalendarEventInput) => {
      const result = await createCalendarEventServerFn({ data: input })

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to create event')
      }

      // Convert dates
      const event: CalendarEvent = {
        ...result.data,
        start: new Date(result.data.start),
        end: new Date(result.data.end),
        gcalSyncedAt: result.data.gcalSyncedAt
          ? new Date(result.data.gcalSyncedAt)
          : undefined,
      }

      return event
    },
    onSuccess: (data) => {
      // Invalidate all calendar event queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return Array.isArray(key) && key[0] === 'calendar-events'
        },
      })

      onSuccess?.(data)
    },
    onError: (error) => {
      onError?.(error as Error)
    },
    onSettled,
  })

  return {
    createEvent: mutation.mutateAsync,
    isCreating: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}

// ============================================================================
// Update Event Hook
// ============================================================================

export interface UseUpdateEventOptions extends MutationCallbacks<CalendarEvent> {}

export interface UseUpdateEventResult {
  /** Update an existing calendar event */
  updateEvent: (input: UpdateCalendarEventInput) => Promise<CalendarEvent>

  /** Whether the mutation is in progress */
  isUpdating: boolean

  /** Error from the mutation */
  error: Error | null

  /** Reset the mutation state */
  reset: () => void
}

/**
 * Hook for updating calendar events
 *
 * @param options - Callbacks for mutation lifecycle
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { updateEvent, isUpdating } = useUpdateEvent()
 *
 * await updateEvent({
 *   nodeId: 'event-123',
 *   title: 'Updated Title',
 *   startDate: newDate.toISOString(),
 * })
 * ```
 */
export function useUpdateEvent(
  options: UseUpdateEventOptions = {}
): UseUpdateEventResult {
  const { onSuccess, onError, onSettled } = options
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: UpdateCalendarEventInput) => {
      const result = await updateCalendarEventServerFn({ data: input })

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to update event')
      }

      // Convert dates
      const event: CalendarEvent = {
        ...result.data,
        start: new Date(result.data.start),
        end: new Date(result.data.end),
        gcalSyncedAt: result.data.gcalSyncedAt
          ? new Date(result.data.gcalSyncedAt)
          : undefined,
      }

      return event
    },
    onSuccess: (data, variables) => {
      // Invalidate list queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === 'calendar-events' &&
            key[1] === 'list'
          )
        },
      })

      // Update detail cache if it exists
      queryClient.setQueryData(
        calendarEventKeys.detail(variables.nodeId),
        data
      )

      onSuccess?.(data)
    },
    onError: (error) => {
      onError?.(error as Error)
    },
    onSettled,
  })

  return {
    updateEvent: mutation.mutateAsync,
    isUpdating: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}

// ============================================================================
// Delete Event Hook
// ============================================================================

export interface UseDeleteEventOptions extends MutationCallbacks<void> {}

export interface UseDeleteEventResult {
  /** Delete a calendar event */
  deleteEvent: (nodeId: string) => Promise<void>

  /** Whether the mutation is in progress */
  isDeleting: boolean

  /** Error from the mutation */
  error: Error | null

  /** Reset the mutation state */
  reset: () => void
}

/**
 * Hook for deleting calendar events
 *
 * @param options - Callbacks for mutation lifecycle
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { deleteEvent, isDeleting } = useDeleteEvent({
 *   onSuccess: () => console.log('Event deleted'),
 * })
 *
 * await deleteEvent('event-123')
 * ```
 */
export function useDeleteEvent(
  options: UseDeleteEventOptions = {}
): UseDeleteEventResult {
  const { onSuccess, onError, onSettled } = options
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (nodeId: string) => {
      const result = await deleteCalendarEventServerFn({ data: { nodeId } })

      if (!result.success) {
        throw new Error(result.error ?? 'Failed to delete event')
      }
    },
    onSuccess: (_, nodeId) => {
      // Invalidate list queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === 'calendar-events' &&
            key[1] === 'list'
          )
        },
      })

      // Remove from detail cache
      queryClient.removeQueries({
        queryKey: calendarEventKeys.detail(nodeId),
      })

      onSuccess?.()
    },
    onError: (error) => {
      onError?.(error as Error)
    },
    onSettled,
  })

  return {
    deleteEvent: mutation.mutateAsync,
    isDeleting: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}

// ============================================================================
// Complete Task Hook
// ============================================================================

export interface UseCompleteTaskOptions extends MutationCallbacks<CalendarEvent> {}

export interface UseCompleteTaskResult {
  /** Toggle task completion status */
  completeTask: (input: CompleteTaskInput) => Promise<CalendarEvent>

  /** Whether the mutation is in progress */
  isCompleting: boolean

  /** Error from the mutation */
  error: Error | null

  /** Reset the mutation state */
  reset: () => void
}

/**
 * Hook for completing/uncompleting tasks
 *
 * @param options - Callbacks for mutation lifecycle
 * @returns Mutation function and state
 *
 * @example
 * ```tsx
 * const { completeTask, isCompleting } = useCompleteTask()
 *
 * // Mark task as completed
 * await completeTask({ nodeId: 'task-123', completed: true })
 *
 * // Mark task as not completed
 * await completeTask({ nodeId: 'task-123', completed: false })
 * ```
 */
export function useCompleteTask(
  options: UseCompleteTaskOptions = {}
): UseCompleteTaskResult {
  const { onSuccess, onError, onSettled } = options
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async (input: CompleteTaskInput) => {
      const result = await completeTaskServerFn({ data: input })

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Failed to complete task')
      }

      // Convert dates
      const event: CalendarEvent = {
        ...result.data,
        start: new Date(result.data.start),
        end: new Date(result.data.end),
        gcalSyncedAt: result.data.gcalSyncedAt
          ? new Date(result.data.gcalSyncedAt)
          : undefined,
      }

      return event
    },
    onSuccess: (data, variables) => {
      // Invalidate list queries
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === 'calendar-events' &&
            key[1] === 'list'
          )
        },
      })

      // Update detail cache if it exists
      queryClient.setQueryData(
        calendarEventKeys.detail(variables.nodeId),
        data
      )

      onSuccess?.(data)
    },
    onError: (error) => {
      onError?.(error as Error)
    },
    onSettled,
  })

  return {
    completeTask: mutation.mutateAsync,
    isCompleting: mutation.isPending,
    error: mutation.error as Error | null,
    reset: mutation.reset,
  }
}

// ============================================================================
// Combined Mutations Hook
// ============================================================================

/**
 * Combined hook that provides all event mutations
 *
 * @returns All mutation functions and states
 *
 * @example
 * ```tsx
 * const {
 *   createEvent,
 *   updateEvent,
 *   deleteEvent,
 *   completeTask,
 *   isLoading,
 * } = useEventMutations()
 * ```
 */
export function useEventMutations() {
  const create = useCreateEvent()
  const update = useUpdateEvent()
  const remove = useDeleteEvent()
  const complete = useCompleteTask()

  return {
    // Actions
    createEvent: create.createEvent,
    updateEvent: update.updateEvent,
    deleteEvent: remove.deleteEvent,
    completeTask: complete.completeTask,

    // Combined loading state
    isLoading:
      create.isCreating ||
      update.isUpdating ||
      remove.isDeleting ||
      complete.isCompleting,

    // Individual states
    isCreating: create.isCreating,
    isUpdating: update.isUpdating,
    isDeleting: remove.isDeleting,
    isCompleting: complete.isCompleting,

    // Errors
    createError: create.error,
    updateError: update.error,
    deleteError: remove.error,
    completeError: complete.error,

    // Reset functions
    resetCreate: create.reset,
    resetUpdate: update.reset,
    resetDelete: remove.reset,
    resetComplete: complete.reset,
  }
}

// ============================================================================
// Cache Invalidation Hook
// ============================================================================

/**
 * Hook for manually invalidating calendar event caches
 *
 * @returns Invalidation functions
 */
export function useCalendarEventInvalidation() {
  const queryClient = useQueryClient()

  return {
    /** Invalidate all calendar event caches */
    invalidateAll: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return Array.isArray(key) && key[0] === 'calendar-events'
        },
      })
    },

    /** Invalidate list queries only */
    invalidateLists: () => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey
          return (
            Array.isArray(key) &&
            key[0] === 'calendar-events' &&
            key[1] === 'list'
          )
        },
      })
    },

    /** Invalidate a specific event's cache */
    invalidateEvent: (eventId: string) => {
      queryClient.invalidateQueries({
        queryKey: calendarEventKeys.detail(eventId),
      })
    },
  }
}
