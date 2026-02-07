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

// Google Sync hooks are NOT exported from the client bundle
// because they import server functions that depend on Node.js-only libraries (googleapis).
// Import them directly from '@nxus/calendar/server' or the individual hook file
// if you need Google sync functionality.

// Touch Gestures
export {
  useTouchGestures,
  isTouchDevice,
  useIsTouchDevice,
  type TouchGestureOptions,
  type TouchGestureResult,
} from './use-touch-gestures.js'

// Keyboard Shortcuts
export {
  useKeyboardShortcuts,
  CALENDAR_SHORTCUTS,
  formatShortcut,
  type KeyboardShortcutOptions,
  type ShortcutInfo,
} from './use-keyboard-shortcuts.js'
