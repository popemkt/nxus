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
} from './components/index.js'

// Hooks
import {
  useCalendarNavigation,
  useCalendarEvents,
  useCompleteTask,
} from './hooks/index.js'

// Types
import type {
  CalendarEvent,
  SlotSelectInfo,
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

  /** Callback when create event is requested */
  onCreateEvent?: (slotInfo: SlotSelectInfo) => void

  /** Callback when an event is selected */
  onSelectEvent?: (event: CalendarEvent) => void

  /** Callback when settings is clicked */
  onSettingsClick?: () => void

  /** Callback when Google sync is clicked */
  onSyncClick?: () => void

  /** Whether Google Calendar is connected */
  isGoogleConnected?: boolean

  /** Whether a sync is in progress */
  isSyncing?: boolean
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
}: CalendarRouteProps) {
  // State for selected slot (when user clicks to create event)
  const [selectedSlot, setSelectedSlot] = useState<SlotSelectInfo | null>(null)

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

  // Handle slot selection (for creating events)
  const handleSelectSlot = useCallback(
    (slotInfo: SlotSelectInfo) => {
      setSelectedSlot(slotInfo)
      onCreateEvent?.(slotInfo)
    },
    [onCreateEvent]
  )

  // Handle event selection
  const handleSelectEvent = useCallback(
    (event: CalendarEvent) => {
      onSelectEvent?.(event)
    },
    [onSelectEvent]
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
          {onCreateEvent && (
            <Button onClick={handleCreateFromEmptyState}>
              <PlusIcon data-icon="inline-start" />
              New Event
            </Button>
          )}
        </div>

        {/* Calendar content */}
        {hasEvents || !onCreateEvent ? (
          <CalendarContainer
            events={bigCalendarEvents}
            currentDate={currentDate}
            currentView={currentView}
            onViewChange={setView}
            onNavigate={goToDate}
            onSelectSlot={onCreateEvent ? handleSelectSlot : undefined}
            onSelectEvent={handleSelectEvent}
            onTaskToggle={handleTaskToggle}
            isLoading={false}
            isFetching={isFetching || isCompleting}
            isGoogleConnected={isGoogleConnected}
            isSyncing={isSyncing}
            onSyncClick={onSyncClick}
            onSettingsClick={onSettingsClick}
            selectable={!!onCreateEvent}
            minHeight={600}
          />
        ) : (
          <CalendarEmptyState
            title="No events yet"
            description="Create your first event or task to get started with your schedule."
            onCreateEvent={handleCreateFromEmptyState}
          />
        )}
      </div>
    </div>
  )
}

// Default export for convenience
export default CalendarRoute
