/**
 * components/index.ts - React component exports for @nxus/calendar
 *
 * Re-exports all calendar UI components.
 */

// Calendar Container
export {
  CalendarContainer,
  CalendarEmptyState,
  CalendarSkeleton,
  type CalendarContainerProps,
  type CalendarEmptyStateProps,
  type CalendarSkeletonProps,
} from './calendar-container.js'

// Calendar Toolbar
export {
  CalendarToolbar,
  MinimalToolbar,
  type CalendarToolbarProps,
  type MinimalToolbarProps,
} from './calendar-toolbar.js'

// Event Block
export {
  EventBlock,
  AgendaEvent,
  type EventBlockProps,
  type AgendaEventProps,
} from './event-block.js'

// Task Checkbox
export {
  TaskCheckbox,
  type TaskCheckboxProps,
} from './task-checkbox.js'

// Create Event Modal
export {
  CreateEventModal,
  type CreateEventModalProps,
} from './create-event-modal.js'

// Event Modal (view/edit/delete)
export {
  EventModal,
  type EventModalProps,
} from './event-modal.js'

// Recurrence Selector
export {
  RecurrenceSelector,
  type RecurrenceSelectorProps,
} from './recurrence-selector.js'

// Sync Status Components
export {
  SyncStatusBadge,
  SyncIndicator,
  ConnectionStatus,
  SyncButton,
  type SyncStatusBadgeProps,
  type SyncIndicatorProps,
  type ConnectionStatusProps,
  type SyncButtonProps,
} from './sync-status-badge.js'

// Calendar Settings
export {
  CalendarSettings,
  type CalendarSettingsProps,
} from './calendar-settings.js'
