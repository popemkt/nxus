/**
 * calendar-container.tsx - Main calendar container component
 *
 * Integrates react-big-calendar with the Nxus design system.
 * Provides:
 * - Multiple view support (day, week, month, agenda)
 * - Custom event rendering with task checkboxes
 * - Date navigation
 * - Slot selection for event creation
 * - Drag-and-drop event rescheduling (client-side only)
 */

import type { CSSProperties, ComponentType } from 'react'
import { useCallback, useMemo, useState, useEffect } from 'react'
/**
 * react-big-calendar module structure:
 * - CommonJS (lib/index.js): Exports named exports via Object.defineProperty
 * - ESM (dist/react-big-calendar.esm.js): Exports named exports only (Calendar, dateFnsLocalizer, etc.)
 *
 * The package.json has:
 * - "main": "lib/index.js" (CommonJS)
 * - "module": "dist/react-big-calendar.esm.js" (ESM)
 *
 * Vite will use the ESM version during both SSR and client bundling, so we use named imports.
 */
import { Calendar as BigCalendar, dateFnsLocalizer } from 'react-big-calendar'
import type { View, SlotInfo, CalendarProps } from 'react-big-calendar'
/**
 * Type-only import for the drag-and-drop addon.
 * The actual module is loaded dynamically on the client to avoid SSR issues
 * (the addon is CommonJS-only and uses `require` which doesn't work in Vite's ESM SSR).
 */
import type { EventInteractionArgs, withDragAndDropProps } from 'react-big-calendar/lib/addons/dragAndDrop'
import {
  format,
  parse,
  startOfWeek as dateFnsStartOfWeek,
  getDay,
} from 'date-fns'
import { enUS } from 'date-fns/locale'
import { cn } from '@nxus/ui'
import type {
  BigCalendarEvent,
  CalendarEvent,
  CalendarView,
  SlotSelectInfo,
  EventDropInfo,
  EventResizeInfo,
  WeekStart,
} from '../types/calendar-event.js'
import { useCalendarSettingsStore } from '../stores/calendar-settings.store.js'
import { CalendarToolbar, type CalendarToolbarProps } from './calendar-toolbar.js'
import { EventBlock, AgendaEvent } from './event-block.js'

// Import calendar CSS (custom theme overrides)
import '../styles/calendar.css'

// Type for the enhanced calendar component with drag-and-drop
type DragAndDropCalendarProps = CalendarProps<BigCalendarEvent, object> &
  withDragAndDropProps<BigCalendarEvent, object>
type DragAndDropCalendarComponent = ComponentType<DragAndDropCalendarProps>

// ============================================================================
// Localizer Setup
// ============================================================================

const locales = {
  'en-US': enUS,
}

/**
 * Create a date-fns localizer for react-big-calendar
 */
function createLocalizer(weekStartsOn: WeekStart) {
  return dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date: Date) =>
      dateFnsStartOfWeek(date, { weekStartsOn, locale: enUS }),
    getDay,
    locales,
  })
}

// ============================================================================
// Types
// ============================================================================

export interface CalendarContainerProps {
  /** Events to display on the calendar */
  events: BigCalendarEvent[]

  /** Current date being viewed */
  currentDate: Date

  /** Current view mode */
  currentView: CalendarView

  /** Called when the view changes */
  onViewChange: (view: CalendarView) => void

  /** Called when the date changes via navigation */
  onNavigate: (date: Date) => void

  /** Called when a time slot is selected (for creating events) */
  onSelectSlot?: (slotInfo: SlotSelectInfo) => void

  /** Called when an event is clicked */
  onSelectEvent?: (event: CalendarEvent) => void

  /** Called when a task checkbox is toggled */
  onTaskToggle?: (event: CalendarEvent, completed: boolean) => Promise<void> | void

  /** Called when an event is dropped to a new time (drag and drop) */
  onEventDrop?: (info: EventDropInfo) => Promise<void> | void

  /** Called when an event is resized */
  onEventResize?: (info: EventResizeInfo) => Promise<void> | void

  /** Whether drag and drop is enabled (default: true) */
  draggable?: boolean

  /** Whether event resizing is enabled (default: true) */
  resizable?: boolean

  /** Whether the calendar is in a loading state */
  isLoading?: boolean

  /** Whether events are being fetched */
  isFetching?: boolean

  /** Google sync props (passed to toolbar) */
  isGoogleConnected?: boolean
  isSyncing?: boolean
  onSyncClick?: () => void

  /** Called when settings button is clicked */
  onSettingsClick?: () => void

  /** Custom class name */
  className?: string

  /** Minimum calendar height */
  minHeight?: number | string

  /** Whether to show the toolbar */
  showToolbar?: boolean

  /** Custom toolbar props */
  toolbarProps?: Partial<CalendarToolbarProps>

  /** Whether selection is enabled (default: true) */
  selectable?: boolean

  /** Step size in minutes for time slots (default: 15) */
  step?: number

  /** Number of time slots per section (default: 4 for 1-hour sections with 15-min steps) */
  timeslots?: number
}

// ============================================================================
// View Mapping
// ============================================================================

// Map CalendarView to react-big-calendar View type
const viewMap: Record<CalendarView, View> = {
  day: 'day',
  week: 'week',
  month: 'month',
  agenda: 'agenda',
}

// Reverse mapping
const reverseViewMap: Record<View, CalendarView> = {
  day: 'day',
  week: 'week',
  month: 'month',
  agenda: 'agenda',
  work_week: 'week', // Map work_week to week
}

// ============================================================================
// Component
// ============================================================================

/**
 * Main calendar container that wraps react-big-calendar.
 *
 * This component integrates all calendar functionality:
 * - Renders events using custom EventBlock component
 * - Handles navigation and view switching
 * - Supports slot selection for event creation
 * - Integrates with calendar settings store
 *
 * @example
 * ```tsx
 * const { currentDate, currentView, dateRange, goToDate, setView } = useCalendarNavigation()
 * const { events, bigCalendarEvents, isLoading } = useCalendarEvents({ dateRange })
 *
 * <CalendarContainer
 *   events={bigCalendarEvents}
 *   currentDate={currentDate}
 *   currentView={currentView}
 *   onViewChange={setView}
 *   onNavigate={goToDate}
 *   onSelectSlot={(slot) => setCreateEventSlot(slot)}
 *   onSelectEvent={(event) => setSelectedEvent(event)}
 *   onTaskToggle={(event, completed) => completeTask({ nodeId: event.nodeId, completed })}
 *   isLoading={isLoading}
 * />
 * ```
 */
export function CalendarContainer({
  events,
  currentDate,
  currentView,
  onViewChange,
  onNavigate,
  onSelectSlot,
  onSelectEvent,
  onTaskToggle,
  onEventDrop,
  onEventResize,
  draggable = true,
  resizable = true,
  isLoading,
  isFetching,
  isGoogleConnected,
  isSyncing,
  onSyncClick,
  onSettingsClick,
  className,
  minHeight = 600,
  showToolbar = true,
  toolbarProps,
  selectable = true,
  step = 15,
  timeslots = 4,
}: CalendarContainerProps) {
  // Get settings from store
  const weekStartsOn = useCalendarSettingsStore(
    (state) => state.display.weekStartsOn
  )
  const timeFormat = useCalendarSettingsStore(
    (state) => state.display.timeFormat
  )
  const workingHoursStart = useCalendarSettingsStore(
    (state) => state.display.workingHoursStart
  )

  // Dynamically load the base react-big-calendar CSS on the client.
  // Static imports of node_module CSS fail during SSR (Unknown file extension ".css"),
  // so we use the same dynamic import pattern as the DnD addon CSS below.
  useEffect(() => {
    import('react-big-calendar/lib/css/react-big-calendar.css').catch(() => {
      // CSS import may "fail" in some environments but still applies styles
    })
  }, [])

  // State for dynamically loaded drag-and-drop calendar component
  // The drag-and-drop addon is CommonJS-only and must be loaded on the client
  const [DragAndDropCalendar, setDragAndDropCalendar] =
    useState<DragAndDropCalendarComponent | null>(null)

  // Dynamically load the drag-and-drop addon on the client
  useEffect(() => {
    // Only load if drag or resize is enabled
    if (!draggable && !resizable) return

    let mounted = true

    import('react-big-calendar/lib/addons/dragAndDrop')
      .then((module) => {
        if (!mounted) return
        // Handle both default export and module.default patterns
        const withDragAndDrop = (module as any).default ?? module
        // Also import the CSS
        import('react-big-calendar/lib/addons/dragAndDrop/styles.css')
        // Create the enhanced calendar component
        const EnhancedCalendar = withDragAndDrop(BigCalendar)
        setDragAndDropCalendar(() => EnhancedCalendar)
      })
      .catch((err) => {
        console.warn('Failed to load drag-and-drop addon:', err)
      })

    return () => {
      mounted = false
    }
  }, [draggable, resizable])

  // Create localizer with current week start setting
  const localizer = useMemo(
    () => createLocalizer(weekStartsOn),
    [weekStartsOn]
  )

  // Available views
  const views = useMemo(
    () => ({
      day: true,
      week: true,
      month: true,
      agenda: true,
    }),
    []
  )

  // Time format for display
  const formats = useMemo(
    () => ({
      timeGutterFormat: (date: Date) =>
        format(date, timeFormat === '12h' ? 'h a' : 'HH:mm'),
      eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) => {
        const formatStr = timeFormat === '12h' ? 'h:mm a' : 'HH:mm'
        return `${format(start, formatStr)} - ${format(end, formatStr)}`
      },
      selectRangeFormat: ({ start, end }: { start: Date; end: Date }) => {
        const formatStr = timeFormat === '12h' ? 'h:mm a' : 'HH:mm'
        return `${format(start, formatStr)} - ${format(end, formatStr)}`
      },
      dayFormat: (date: Date) => format(date, 'EEE d'),
      dayHeaderFormat: (date: Date) => format(date, 'EEEE, MMMM d'),
      dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
        `${format(start, 'MMM d')} - ${format(end, 'MMM d, yyyy')}`,
      monthHeaderFormat: (date: Date) => format(date, 'MMMM yyyy'),
      agendaDateFormat: (date: Date) => format(date, 'EEE, MMM d'),
      agendaTimeFormat: (date: Date) =>
        format(date, timeFormat === '12h' ? 'h:mm a' : 'HH:mm'),
      agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) => {
        const formatStr = timeFormat === '12h' ? 'h:mm a' : 'HH:mm'
        return `${format(start, formatStr)} - ${format(end, formatStr)}`
      },
    }),
    [timeFormat]
  )

  // Scroll to working hours start time
  const scrollToTime = useMemo(() => {
    const today = new Date()
    today.setHours(workingHoursStart, 0, 0, 0)
    return today
  }, [workingHoursStart])

  // Handle view change
  const handleViewChange = useCallback(
    (view: View) => {
      onViewChange(reverseViewMap[view] || 'week')
    },
    [onViewChange]
  )

  // Handle slot selection
  const handleSelectSlot = useCallback(
    (slotInfo: SlotInfo) => {
      if (onSelectSlot) {
        const info: SlotSelectInfo = {
          start: slotInfo.start,
          end: slotInfo.end,
          slots: slotInfo.slots,
          action: slotInfo.action as 'select' | 'click' | 'doubleClick',
        }
        onSelectSlot(info)
      }
    },
    [onSelectSlot]
  )

  // Handle event selection
  const handleSelectEvent = useCallback(
    (event: BigCalendarEvent) => {
      if (onSelectEvent) {
        onSelectEvent(event.resource)
      }
    },
    [onSelectEvent]
  )

  // Handle event drop (drag and drop rescheduling)
  const handleEventDrop = useCallback(
    (args: EventInteractionArgs<BigCalendarEvent>) => {
      if (onEventDrop) {
        const info: EventDropInfo = {
          event: args.event,
          start: args.start as Date,
          end: args.end as Date,
          isAllDay: args.isAllDay ?? args.event.allDay ?? false,
        }
        onEventDrop(info)
      }
    },
    [onEventDrop]
  )

  // Handle event resize
  const handleEventResize = useCallback(
    (args: EventInteractionArgs<BigCalendarEvent>) => {
      if (onEventResize) {
        const info: EventResizeInfo = {
          event: args.event,
          start: args.start as Date,
          end: args.end as Date,
        }
        onEventResize(info)
      }
    },
    [onEventResize]
  )

  // Determine if an event is draggable (completed tasks are not draggable)
  const draggableAccessor = useCallback(
    (event: BigCalendarEvent) => {
      if (!draggable) return false
      // Don't allow dragging completed tasks
      const calEvent = event.resource
      if (calEvent.isTask && calEvent.isCompleted) {
        return false
      }
      return true
    },
    [draggable]
  )

  // Determine if an event is resizable (completed tasks are not resizable)
  const resizableAccessor = useCallback(
    (event: BigCalendarEvent) => {
      if (!resizable) return false
      // Don't allow resizing completed tasks
      const calEvent = event.resource
      if (calEvent.isTask && calEvent.isCompleted) {
        return false
      }
      return true
    },
    [resizable]
  )

  // Custom components
  const components = useMemo(
    () => ({
      toolbar: showToolbar
        ? (props: CalendarToolbarProps) => (
            <CalendarToolbar
              {...props}
              isGoogleConnected={isGoogleConnected}
              isSyncing={isSyncing}
              onSyncClick={onSyncClick}
              onSettingsClick={onSettingsClick}
              {...toolbarProps}
            />
          )
        : () => null,
      event: (props: { event: BigCalendarEvent; title: string }) => (
        <EventBlock
          {...props}
          onTaskToggle={onTaskToggle}
          onEventClick={onSelectEvent}
        />
      ),
      agenda: {
        event: (props: { event: BigCalendarEvent }) => (
          <AgendaEvent
            {...props}
            onTaskToggle={onTaskToggle}
            onEventClick={onSelectEvent}
          />
        ),
      },
    }),
    [
      showToolbar,
      isGoogleConnected,
      isSyncing,
      onSyncClick,
      onSettingsClick,
      onTaskToggle,
      onSelectEvent,
      toolbarProps,
    ]
  )

  // Event prop getter for styling
  const eventPropGetter = useCallback(
    (event: BigCalendarEvent): { className?: string; style?: CSSProperties } => {
      const calEvent = event.resource
      const classNames: string[] = []

      // Add class based on event type
      if (calEvent.isTask) {
        classNames.push('calendar-event-task')
        if (calEvent.isCompleted) {
          classNames.push('calendar-event-completed')
        }
      } else {
        classNames.push('calendar-event-event')
      }

      // Add class for recurring events
      if (calEvent.rrule) {
        classNames.push('calendar-event-recurring')
      }

      // Add class for events with reminders
      if (calEvent.hasReminder) {
        classNames.push('calendar-event-has-reminder')
      }

      // Add class for synced events
      if (calEvent.gcalEventId) {
        classNames.push('calendar-event-synced')
      }

      return {
        className: classNames.join(' '),
      }
    },
    []
  )

  // Day prop getter for styling
  const dayPropGetter = useCallback((date: Date) => {
    const today = new Date()
    const isToday =
      date.getFullYear() === today.getFullYear() &&
      date.getMonth() === today.getMonth() &&
      date.getDate() === today.getDate()

    return {
      className: isToday ? 'rbc-today' : undefined,
    }
  }, [])

  // Shared props for both calendar variants (with and without drag-and-drop)
  const baseCalendarProps = useMemo(
    () => ({
      localizer,
      events,
      date: currentDate,
      view: viewMap[currentView],
      views,
      onNavigate,
      onView: handleViewChange,
      onSelectSlot: handleSelectSlot,
      onSelectEvent: handleSelectEvent,
      selectable,
      step,
      timeslots,
      scrollToTime,
      formats,
      components,
      eventPropGetter,
      dayPropGetter,
      popup: true as const,
      showMultiDayTimes: true as const,
      messages: {
        today: 'Today',
        previous: 'Back',
        next: 'Next',
        month: 'Month',
        week: 'Week',
        day: 'Day',
        agenda: 'Agenda',
        date: 'Date',
        time: 'Time',
        event: 'Event',
        noEventsInRange: 'No events in this range.',
        showMore: (total: number) => `+${total} more`,
      },
    }),
    [
      localizer,
      events,
      currentDate,
      currentView,
      views,
      onNavigate,
      handleViewChange,
      handleSelectSlot,
      handleSelectEvent,
      selectable,
      step,
      timeslots,
      scrollToTime,
      formats,
      components,
      eventPropGetter,
      dayPropGetter,
    ]
  )

  return (
    <div
      className={cn('nxus-calendar relative', className)}
      style={{ minHeight }}
    >
      {/* Loading overlay */}
      {(isLoading || isFetching) && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/50">
          <div className="flex items-center gap-2 rounded-md bg-card px-4 py-2 shadow-lg">
            <svg
              className="size-4 animate-spin text-primary"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        </div>
      )}

      {/* Calendar - use drag-and-drop version if loaded, otherwise basic calendar */}
      {DragAndDropCalendar ? (
        <DragAndDropCalendar
          {...baseCalendarProps}
          onEventDrop={handleEventDrop}
          onEventResize={handleEventResize}
          draggableAccessor={draggableAccessor}
          resizableAccessor={resizableAccessor}
          resizable={resizable}
        />
      ) : (
        <BigCalendar {...baseCalendarProps} />
      )}
    </div>
  )
}

// ============================================================================
// Empty State Component
// ============================================================================

export interface CalendarEmptyStateProps {
  /** Title text */
  title?: string

  /** Description text */
  description?: string

  /** Action button click handler */
  onCreateEvent?: () => void

  /** Custom class name */
  className?: string
}

/**
 * Empty state component shown when there are no events.
 */
export function CalendarEmptyState({
  title = 'No events',
  description = 'Create your first event to get started.',
  onCreateEvent,
  className,
}: CalendarEmptyStateProps) {
  return (
    <div className={cn('calendar-empty flex flex-col items-center justify-center gap-4 p-12 text-center text-muted-foreground', className)}>
      <svg
        className="calendar-empty-icon h-12 w-12 opacity-50"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4" />
        <path d="M8 2v4" />
        <path d="M3 10h18" />
        <path d="M8 14h.01" />
        <path d="M12 14h.01" />
        <path d="M16 14h.01" />
        <path d="M8 18h.01" />
        <path d="M12 18h.01" />
        <path d="M16 18h.01" />
      </svg>
      <h3 className="calendar-empty-title">{title}</h3>
      <p className="calendar-empty-description">{description}</p>
      {onCreateEvent && (
        <button
          onClick={onCreateEvent}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <svg
            className="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
          Create Event
        </button>
      )}
    </div>
  )
}

// ============================================================================
// Loading Skeleton Component
// ============================================================================

export interface CalendarSkeletonProps {
  /** Custom class name */
  className?: string
}

/**
 * Loading skeleton for the calendar.
 */
export function CalendarSkeleton({ className }: CalendarSkeletonProps) {
  return (
    <div className={cn('calendar-skeleton', className)}>
      {/* Header skeleton */}
      <div className="calendar-skeleton-header">
        <div className="calendar-skeleton-cell" style={{ width: '4rem' }} />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="calendar-skeleton-cell" />
        ))}
      </div>

      {/* Grid skeleton */}
      {Array.from({ length: 8 }).map((_, rowIndex) => (
        <div key={rowIndex} className="calendar-skeleton-row">
          <div
            className="calendar-skeleton-cell"
            style={{ width: '4rem', height: '3rem' }}
          />
          {Array.from({ length: 7 }).map((_, colIndex) => (
            <div key={colIndex} className="flex-1">
              {rowIndex % 3 === 0 && colIndex % 2 === 0 && (
                <div className="calendar-skeleton-event" />
              )}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
