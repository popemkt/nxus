/**
 * event-block.tsx - Custom event component for react-big-calendar
 *
 * Renders calendar events with:
 * - Task checkbox for task items
 * - Reminder and recurring indicators
 * - Sync status badge
 * - Proper styling based on event type and completion status
 */

import { useMemo } from 'react'
import type { EventProps } from 'react-big-calendar'
import { cn } from '@nxus/ui'
import type { BigCalendarEvent, CalendarEvent, CompletedTaskStyle } from '../types/calendar-event.js'
import { isTaskEvent, isRecurringEvent, isSyncedToGoogle } from '../types/calendar-event.js'
import { useCalendarSettingsStore } from '../stores/calendar-settings.store.js'
import { TaskCheckbox } from './task-checkbox.js'

// ============================================================================
// Types
// ============================================================================

export interface EventBlockProps extends EventProps<BigCalendarEvent> {
  /** Called when a task checkbox is toggled */
  onTaskToggle?: (event: CalendarEvent, completed: boolean) => Promise<void> | void

  /** Called when the event is clicked */
  onEventClick?: (event: CalendarEvent) => void
}

// ============================================================================
// Icons
// ============================================================================

function ReminderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  )
}

function RecurringIcon({ className }: { className?: string }) {
  return (
    <svg
      className={cn('shrink-0', className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

function SyncedIcon({ className }: { className?: string }) {
  return (
    <span
      className={cn('shrink-0 rounded-full bg-[var(--success)]', className)}
      title="Synced to Google Calendar"
    />
  )
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a time range for display
 */
function formatTimeRange(
  start: Date,
  end: Date,
  allDay: boolean,
  timeFormat: '12h' | '24h'
): string {
  if (allDay) return 'All day'

  const formatOptions: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: timeFormat === '12h',
  }

  const startStr = start.toLocaleTimeString(undefined, formatOptions)
  const endStr = end.toLocaleTimeString(undefined, formatOptions)

  return `${startStr} - ${endStr}`
}

// ============================================================================
// Component
// ============================================================================

/**
 * Custom event component for react-big-calendar.
 *
 * Handles rendering of both regular events and tasks, with proper
 * styling based on event type, completion status, and sync status.
 *
 * @example
 * ```tsx
 * <Calendar
 *   components={{
 *     event: (props) => (
 *       <EventBlock
 *         {...props}
 *         onTaskToggle={async (event, completed) => {
 *           await completeTask({ nodeId: event.nodeId, completed })
 *         }}
 *         onEventClick={(event) => setSelectedEvent(event)}
 *       />
 *     ),
 *   }}
 * />
 * ```
 */
export function EventBlock({
  event: bigCalEvent,
  title,
  onTaskToggle,
  onEventClick,
}: EventBlockProps) {
  // Extract the CalendarEvent from the BigCalendarEvent wrapper
  const event = bigCalEvent.resource

  // Get display settings from store
  const completedTaskStyle = useCalendarSettingsStore(
    (state) => state.display.completedTaskStyle
  )
  const timeFormat = useCalendarSettingsStore((state) => state.display.timeFormat)

  // Compute event characteristics
  const isTask = isTaskEvent(event)
  const isRecurring = isRecurringEvent(event)
  const isSynced = isSyncedToGoogle(event)
  const isCompleted = event.isCompleted

  // Time display
  const timeDisplay = useMemo(
    () => formatTimeRange(event.start, event.end, event.allDay, timeFormat),
    [event.start, event.end, event.allDay, timeFormat]
  )

  // Build data attributes for CSS styling
  const dataAttributes = useMemo(
    () => ({
      'data-event-type': isTask ? 'task' : 'event',
      'data-completed': isCompleted ? 'true' : undefined,
      'data-completed-style': isCompleted ? completedTaskStyle : undefined,
      'data-recurring': isRecurring ? 'true' : undefined,
      'data-has-reminder': event.hasReminder ? 'true' : undefined,
      'data-synced': isSynced ? 'true' : undefined,
    }),
    [isTask, isCompleted, completedTaskStyle, isRecurring, event.hasReminder, isSynced]
  )

  // Handle task checkbox toggle
  const handleTaskToggle = async (completed: boolean) => {
    if (onTaskToggle) {
      await onTaskToggle(event, completed)
    }
  }

  // Handle event click
  const handleClick = () => {
    if (onEventClick) {
      onEventClick(event)
    }
  }

  // Should we show the strikethrough style?
  const showStrikethrough =
    isCompleted && completedTaskStyle === 'strikethrough'

  return (
    <div
      className="rbc-event-content"
      onClick={handleClick}
      {...dataAttributes}
    >
      {/* Task checkbox (only for tasks) */}
      {isTask && (
        <TaskCheckbox
          checked={isCompleted}
          onToggle={handleTaskToggle}
          size="sm"
          className="mr-1"
        />
      )}

      {/* Reminder indicator */}
      {event.hasReminder && <ReminderIcon className="size-2.5 opacity-80" />}

      {/* Event title */}
      <span
        className={cn(
          'flex-1 truncate',
          showStrikethrough && 'line-through'
        )}
      >
        {title || event.title}
      </span>

      {/* Recurring indicator */}
      {isRecurring && <RecurringIcon className="size-2.5 opacity-70" />}

      {/* Sync status */}
      {isSynced && <SyncedIcon className="ml-auto size-1.5" />}
    </div>
  )
}

// ============================================================================
// Agenda Event Component
// ============================================================================

export interface AgendaEventProps {
  event: BigCalendarEvent
  onTaskToggle?: (event: CalendarEvent, completed: boolean) => Promise<void> | void
  onEventClick?: (event: CalendarEvent) => void
}

/**
 * Event component specifically for the agenda view.
 * Shows more detail than the compact calendar event.
 */
export function AgendaEvent({
  event: bigCalEvent,
  onTaskToggle,
  onEventClick,
}: AgendaEventProps) {
  const event = bigCalEvent.resource
  const isTask = isTaskEvent(event)
  const isCompleted = event.isCompleted
  const completedTaskStyle = useCalendarSettingsStore(
    (state) => state.display.completedTaskStyle
  )

  const handleTaskToggle = async (completed: boolean) => {
    if (onTaskToggle) {
      await onTaskToggle(event, completed)
    }
  }

  const handleClick = () => {
    if (onEventClick) {
      onEventClick(event)
    }
  }

  const showStrikethrough =
    isCompleted && completedTaskStyle === 'strikethrough'

  return (
    <div
      className={cn(
        'flex items-center gap-2 py-0.5',
        isCompleted && completedTaskStyle === 'muted' && 'opacity-60'
      )}
      onClick={handleClick}
    >
      {isTask && (
        <TaskCheckbox
          checked={isCompleted}
          onToggle={handleTaskToggle}
          size="default"
        />
      )}
      <span
        className={cn(
          'flex-1',
          showStrikethrough && 'line-through text-muted-foreground'
        )}
      >
        {event.title}
      </span>
      {event.hasReminder && <ReminderIcon className="size-3 text-muted-foreground" />}
      {isRecurringEvent(event) && (
        <RecurringIcon className="size-3 text-muted-foreground" />
      )}
      {isSyncedToGoogle(event) && (
        <SyncedIcon className="size-2" />
      )}
    </div>
  )
}
