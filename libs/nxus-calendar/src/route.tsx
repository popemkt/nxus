/**
 * route.tsx - Main Calendar Route Component
 *
 * This is the entry point for the calendar view, composing all calendar
 * components, hooks, and stores into a complete page.
 *
 * Features:
 * - Full calendar view with day/week/month/agenda modes
 * - Event fetching with TanStack Query
 * - Task completion toggling
 * - Event creation modal
 * - Empty state handling
 * - Loading skeleton
 * - Settings initialization
 */

import { useCallback, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '@nxus/ui'
import { ArrowLeftIcon, CalendarIcon, PlusIcon } from '@phosphor-icons/react'
import { Button } from '@nxus/ui'

// Calendar components
import {
  CalendarContainer,
  CalendarEmptyState,
  CalendarSkeleton,
  CreateEventModal,
  EventModal,
  CalendarSettings,
  CalendarErrorBoundary,
} from './components/index.js'

// Hooks
import {
  useCalendarNavigation,
  useCalendarEvents,
  useCompleteTask,
  useUpdateEvent,
  useTouchGestures,
  useKeyboardShortcuts,
} from './hooks/index.js'

// Types
import type {
  CalendarEvent,
  SlotSelectInfo,
  EventDropInfo,
  EventResizeInfo,
} from './types/calendar-event.js'

// ============================================================================
// Types
// ============================================================================

export interface CalendarRouteProps {
  /** Optional class name for the container */
  className?: string

  /** Whether to show the back button */
  showBackButton?: boolean

  /** Custom back button URL */
  backUrl?: string

  /** Callback when create event is requested (if provided, external modal handling) */
  onCreateEvent?: (slotInfo: SlotSelectInfo) => void

  /** Callback when an event is selected (if provided, external modal handling) */
  onSelectEvent?: (event: CalendarEvent) => void

  /** Callback when settings is clicked (if provided, external settings handling) */
  onSettingsClick?: () => void

  /** Whether to use the built-in settings modal (default: true if onSettingsClick not provided) */
  useBuiltInSettings?: boolean

  /** Callback when Google sync is clicked */
  onSyncClick?: () => void

  /** Whether Google Calendar is connected */
  isGoogleConnected?: boolean

  /** Whether a sync is in progress */
  isSyncing?: boolean

  /** Whether to use the built-in create event modal (default: true if onCreateEvent not provided) */
  useBuiltInModal?: boolean

  /** Whether to use the built-in event detail modal (default: true if onSelectEvent not provided) */
  useBuiltInEventModal?: boolean
}

// ============================================================================
// Component
// ============================================================================

/**
 * Main Calendar Route Component
 *
 * This component provides a complete calendar view with:
 * - Navigation (day/week/month/agenda views)
 * - Event display and interaction
 * - Task completion
 * - Empty and loading states
 *
 * @example
 * ```tsx
 * // In a route file
 * import { CalendarRoute } from '@nxus/calendar'
 *
 * export function CalendarPage() {
 *   return (
 *     <CalendarRoute
 *       showBackButton
 *       onCreateEvent={(slot) => setCreateModalSlot(slot)}
 *       onSelectEvent={(event) => setSelectedEvent(event)}
 *     />
 *   )
 * }
 * ```
 */
export function CalendarRoute({
  className,
  showBackButton = true,
  backUrl = '/',
  onCreateEvent,
  onSelectEvent,
  onSettingsClick,
  onSyncClick,
  isGoogleConnected = false,
  isSyncing = false,
  useBuiltInModal,
  useBuiltInEventModal,
  useBuiltInSettings,
}: CalendarRouteProps) {
  // State for selected slot (when user clicks to create event)
  const [selectedSlot, setSelectedSlot] = useState<SlotSelectInfo | null>(null)

  // State for the built-in create event modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)

  // State for selected event (when user clicks an event)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)

  // State for the built-in event modal
  const [isEventModalOpen, setIsEventModalOpen] = useState(false)

  // State for the built-in settings modal
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)

  // Determine if we should use the built-in modal
  const shouldUseBuiltInModal = useBuiltInModal ?? !onCreateEvent

  // Determine if we should use the built-in event modal
  const shouldUseBuiltInEventModal = useBuiltInEventModal ?? !onSelectEvent

  // Determine if we should use the built-in settings modal
  const shouldUseBuiltInSettings = useBuiltInSettings ?? !onSettingsClick

  // Navigation state
  const {
    currentDate,
    currentView,
    dateRange,
    goToDate,
    goToToday,
    nextPeriod,
    prevPeriod,
    setView,
    periodLabel,
  } = useCalendarNavigation()

  // Events data
  const {
    events,
    bigCalendarEvents,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
  } = useCalendarEvents({
    dateRange,
    enabled: true,
  })

  // Task completion mutation
  const { completeTask, isCompleting } = useCompleteTask()

  // Event update mutation (for drag and drop rescheduling)
  const { updateEvent, isUpdating } = useUpdateEvent()

  // Handle slot selection (for creating events)
  const handleSelectSlot = useCallback(
    (slotInfo: SlotSelectInfo) => {
      setSelectedSlot(slotInfo)

      if (shouldUseBuiltInModal) {
        // Use the built-in modal
        setIsCreateModalOpen(true)
      } else {
        // Call the external handler
        onCreateEvent?.(slotInfo)
      }
    },
    [onCreateEvent, shouldUseBuiltInModal]
  )

  // Handle event selection
  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      setSelectedEvent(event)

      if (shouldUseBuiltInEventModal) {
        // Use the built-in event modal
        setIsEventModalOpen(true)
      } else {
        // Call the external handler
        onSelectEvent?.(event)
      }
    },
    [onSelectEvent, shouldUseBuiltInEventModal]
  )

  // Handle task completion toggle
  const handleTaskToggle = useCallback(
    async (event: CalendarEvent, completed: boolean) => {
      await completeTask({
        nodeId: event.nodeId,
        completed,
      })
    },
    [completeTask]
  )

  // Handle event drop (drag and drop rescheduling)
  const handleEventDrop = useCallback(
    async (info: EventDropInfo) => {
      const calEvent = info.event.resource
      await updateEvent({
        nodeId: calEvent.nodeId,
        startDate: info.start.toISOString(),
        endDate: info.end.toISOString(),
        allDay: info.isAllDay,
      })
    },
    [updateEvent]
  )

  // Handle event resize
  const handleEventResize = useCallback(
    async (info: EventResizeInfo) => {
      const calEvent = info.event.resource
      await updateEvent({
        nodeId: calEvent.nodeId,
        startDate: info.start.toISOString(),
        endDate: info.end.toISOString(),
      })
    },
    [updateEvent]
  )

  // Handle settings click
  const handleSettingsClick = useCallback(() => {
    if (shouldUseBuiltInSettings) {
      setIsSettingsOpen(true)
    } else {
      onSettingsClick?.()
    }
  }, [shouldUseBuiltInSettings, onSettingsClick])

  // Handle create event from empty state
  const handleCreateFromEmptyState = useCallback(() => {
    // Create a slot for "now"
    const now = new Date()
    const end = new Date(now.getTime() + 60 * 60 * 1000) // 1 hour later

    const slotInfo: SlotSelectInfo = {
      start: now,
      end,
      slots: [now],
      action: 'click',
    }

    handleSelectSlot(slotInfo)
  }, [handleSelectSlot])

  // Determine if event creation is enabled (either built-in or external)
  // This needs to be defined before hooks that use it
  const canCreateEvent = shouldUseBuiltInModal || !!onCreateEvent

  // Touch gesture support for mobile navigation
  useTouchGestures({
    onSwipeLeft: nextPeriod,
    onSwipeRight: prevPeriod,
    onLongPress: () => {
      // Create event at current time when long pressing
      if (canCreateEvent) {
        handleCreateFromEmptyState()
      }
    },
    enabled: true,
  })

  // Keyboard shortcuts for navigation and actions
  useKeyboardShortcuts({
    onNewEvent: canCreateEvent ? handleCreateFromEmptyState : undefined,
    onGoToToday: goToToday,
    onViewChange: setView,
    onPrevPeriod: prevPeriod,
    onNextPeriod: nextPeriod,
    onEscape: () => {
      // Close any open modal
      if (isCreateModalOpen) {
        setIsCreateModalOpen(false)
      } else if (isEventModalOpen) {
        setIsEventModalOpen(false)
      } else if (isSettingsOpen) {
        setIsSettingsOpen(false)
      } else if (selectedEvent) {
        setSelectedEvent(null)
      }
    },
    enabled: true,
  })

  // Show skeleton during initial load
  if (isLoading) {
    return (
      <div className={cn('min-h-screen bg-background', className)}>
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            {showBackButton && (
              <Link to={backUrl}>
                <Button variant="ghost" className="-ml-2">
                  <ArrowLeftIcon data-icon="inline-start" />
                  Back
                </Button>
              </Link>
            )}
            <div className="flex items-center gap-3">
              <CalendarIcon className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Calendar</h1>
                <p className="text-muted-foreground">
                  Manage your schedule and tasks
                </p>
              </div>
            </div>
            <div className="w-20" /> {/* Spacer for alignment */}
          </div>

          {/* Loading skeleton */}
          <CalendarSkeleton />
        </div>
      </div>
    )
  }

  // Show error state
  if (isError) {
    return (
      <div className={cn('min-h-screen bg-background', className)}>
        <div className="container mx-auto px-4 py-8 max-w-7xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            {showBackButton && (
              <Link to={backUrl}>
                <Button variant="ghost" className="-ml-2">
                  <ArrowLeftIcon data-icon="inline-start" />
                  Back
                </Button>
              </Link>
            )}
            <div className="flex items-center gap-3">
              <CalendarIcon className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Calendar</h1>
                <p className="text-muted-foreground">
                  Manage your schedule and tasks
                </p>
              </div>
            </div>
            <div className="w-20" /> {/* Spacer for alignment */}
          </div>

          {/* Error state */}
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-center">
              <p className="text-lg font-medium text-destructive">
                Error loading calendar
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {error?.message ?? 'An unexpected error occurred'}
              </p>
              <Button onClick={() => refetch()}>Try Again</Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Check if we have any events
  const hasEvents = events.length > 0

  return (
    <div className={cn('min-h-screen bg-background', className)}>
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            {showBackButton && (
              <Link to={backUrl}>
                <Button variant="ghost" className="-ml-2">
                  <ArrowLeftIcon data-icon="inline-start" />
                  Back
                </Button>
              </Link>
            )}
            <div className="flex items-center gap-3">
              <CalendarIcon className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-3xl font-bold">Calendar</h1>
                <p className="text-muted-foreground">
                  Manage your schedule and tasks
                </p>
              </div>
            </div>
          </div>

          {/* Create button */}
          {canCreateEvent && (
            <Button onClick={handleCreateFromEmptyState}>
              <PlusIcon data-icon="inline-start" />
              New Event
            </Button>
          )}
        </div>

        {/* Calendar content wrapped in error boundary */}
        <CalendarErrorBoundary onRetry={() => refetch()}>
          {hasEvents || !canCreateEvent ? (
            <CalendarContainer
              events={bigCalendarEvents}
              currentDate={currentDate}
              currentView={currentView}
              onViewChange={setView}
              onNavigate={goToDate}
              onSelectSlot={canCreateEvent ? handleSelectSlot : undefined}
              onSelectEvent={handleSelectEvent}
              onTaskToggle={handleTaskToggle}
              onEventDrop={handleEventDrop}
              onEventResize={handleEventResize}
              draggable
              resizable
              isLoading={false}
              isFetching={isFetching || isCompleting || isUpdating}
              isGoogleConnected={isGoogleConnected}
              isSyncing={isSyncing}
              onSyncClick={onSyncClick}
              onSettingsClick={handleSettingsClick}
              selectable={canCreateEvent}
              minHeight={600}
            />
          ) : (
            <CalendarEmptyState
              title="No events yet"
              description="Create your first event or task to get started with your schedule."
              onCreateEvent={handleCreateFromEmptyState}
            />
          )}
        </CalendarErrorBoundary>
      </div>

      {/* Built-in Create Event Modal */}
      {shouldUseBuiltInModal && (
        <CreateEventModal
          open={isCreateModalOpen}
          onOpenChange={setIsCreateModalOpen}
          slotInfo={selectedSlot}
          onSuccess={() => {
            // Modal will close automatically, just clear the selected slot
            setSelectedSlot(null)
          }}
        />
      )}

      {/* Built-in Event Detail Modal */}
      {shouldUseBuiltInEventModal && (
        <EventModal
          open={isEventModalOpen}
          onOpenChange={(open) => {
            setIsEventModalOpen(open)
            if (!open) {
              setSelectedEvent(null)
            }
          }}
          event={selectedEvent}
          onUpdateSuccess={() => {
            // Refetch will happen automatically via query invalidation
          }}
          onDeleteSuccess={() => {
            // Modal will close automatically, clear the selected event
            setSelectedEvent(null)
          }}
        />
      )}

      {/* Built-in Settings Modal */}
      {shouldUseBuiltInSettings && (
        <CalendarSettings
          open={isSettingsOpen}
          onOpenChange={setIsSettingsOpen}
        />
      )}
    </div>
  )
}

// Default export for convenience
export default CalendarRoute
