/**
 * hooks/index.ts - React hooks exports for @nxus/calendar
 *
 * Re-exports all calendar-related React hooks.
 */

// Calendar Events
export {
  useCalendarEvents,
  useCalendarEvent,
  calendarEventKeys,
  type UseCalendarEventsOptions,
  type UseCalendarEventsResult,
  type UseCalendarEventOptions,
  type UseCalendarEventResult,
} from './use-calendar-events.js'

// Calendar Navigation
export {
  useCalendarNavigation,
  useCalendar,
  type UseCalendarNavigationOptions,
  type UseCalendarNavigationResult,
  type UseCalendarOptions,
} from './use-calendar-navigation.js'

// Event Mutations
export {
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  useCompleteTask,
  useEventMutations,
  useCalendarEventInvalidation,
  type UseCreateEventOptions,
  type UseCreateEventResult,
  type UseUpdateEventOptions,
  type UseUpdateEventResult,
  type UseDeleteEventOptions,
  type UseDeleteEventResult,
  type UseCompleteTaskOptions,
  type UseCompleteTaskResult,
  type MutationCallbacks,
} from './use-event-mutations.js'
