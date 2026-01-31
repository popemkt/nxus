/**
 * event-modal.tsx - Modal for viewing and editing calendar events and tasks
 *
 * Features:
 * - View mode: display all event details
 * - Edit mode: form to modify event properties
 * - Delete button with confirmation
 * - Show sync status if synced to Google
 * - For tasks: show completion checkbox
 */

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { format, addHours, startOfDay } from 'date-fns'
import {
  XIcon,
  CalendarIcon,
  CheckSquareIcon,
  BellIcon,
  TrashIcon,
  PencilSimpleIcon,
  ClockIcon,
  ArrowsClockwiseIcon,
  GoogleLogoIcon,
  CheckIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import {
  Button,
  Input,
  Label,
  Textarea,
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@nxus/ui'

import type {
  CalendarEvent,
  UpdateCalendarEventInput,
} from '../types/calendar-event.js'
import { useUpdateEvent, useDeleteEvent, useCompleteTask } from '../hooks/use-event-mutations.js'
import { RecurrenceSelector } from './recurrence-selector.js'
import { formatRRuleHumanReadable } from '../lib/rrule-utils.js'

// ============================================================================
// Types
// ============================================================================

export interface EventModalProps {
  /** Whether the modal is open */
  open: boolean

  /** Called when the modal should close */
  onOpenChange: (open: boolean) => void

  /** The event to display/edit */
  event: CalendarEvent | null

  /** Called after successful event update */
  onUpdateSuccess?: () => void

  /** Called after successful event deletion */
  onDeleteSuccess?: () => void

  /** Custom class name */
  className?: string
}

type ModalMode = 'view' | 'edit'

interface FormData {
  title: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  allDay: boolean
  description: string
  reminder: string
  rrule: string | undefined
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Parse a date to date string (YYYY-MM-DD)
 */
function toDateString(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/**
 * Parse a date to time string (HH:mm)
 */
function toTimeString(date: Date): string {
  return format(date, 'HH:mm')
}

/**
 * Combine date string and time string to a Date object
 */
function combineDateAndTime(dateStr: string, timeStr: string): Date {
  const parts = dateStr.split('-').map(Number)
  const timeParts = timeStr.split(':').map(Number)
  const year = parts[0] ?? 0
  const month = (parts[1] ?? 1) - 1
  const day = parts[2] ?? 1
  const hours = timeParts[0] ?? 0
  const minutes = timeParts[1] ?? 0
  const date = new Date(year, month, day, hours, minutes)
  return date
}

/**
 * Get the form data from an existing event
 */
function eventToFormData(event: CalendarEvent): FormData {
  return {
    title: event.title,
    startDate: toDateString(event.start),
    startTime: toTimeString(event.start),
    endDate: toDateString(event.end),
    endTime: toTimeString(event.end),
    allDay: event.allDay,
    description: event.description ?? '',
    reminder: event.reminderMinutes?.toString() ?? 'none',
    rrule: event.rrule,
  }
}

/**
 * Format a date range for display
 */
function formatDateRange(start: Date, end: Date, allDay: boolean): string {
  if (allDay) {
    const startStr = format(start, 'EEE, MMM d, yyyy')
    const endStr = format(end, 'EEE, MMM d, yyyy')
    if (startStr === endStr || format(start, 'yyyy-MM-dd') === format(new Date(end.getTime() - 1), 'yyyy-MM-dd')) {
      return startStr
    }
    return `${startStr} - ${endStr}`
  }

  const sameDay = format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')

  if (sameDay) {
    return `${format(start, 'EEE, MMM d, yyyy')} \u00B7 ${format(start, 'h:mm a')} - ${format(end, 'h:mm a')}`
  }

  return `${format(start, 'EEE, MMM d, h:mm a')} - ${format(end, 'EEE, MMM d, h:mm a, yyyy')}`
}

// ============================================================================
// Reminder Options
// ============================================================================

const REMINDER_OPTIONS = [
  { value: 'none', label: 'No reminder' },
  { value: '5', label: '5 minutes before' },
  { value: '10', label: '10 minutes before' },
  { value: '15', label: '15 minutes before' },
  { value: '30', label: '30 minutes before' },
  { value: '60', label: '1 hour before' },
  { value: '1440', label: '1 day before' },
]

function getReminderLabel(minutes?: number): string {
  if (!minutes) return 'No reminder'
  const option = REMINDER_OPTIONS.find((o) => o.value === minutes.toString())
  return option?.label ?? `${minutes} minutes before`
}

// ============================================================================
// Component
// ============================================================================

/**
 * Modal for viewing and editing calendar events and tasks
 *
 * @example
 * ```tsx
 * const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
 *
 * <EventModal
 *   open={!!selectedEvent}
 *   onOpenChange={(open) => !open && setSelectedEvent(null)}
 *   event={selectedEvent}
 *   onUpdateSuccess={() => refetch()}
 *   onDeleteSuccess={() => setSelectedEvent(null)}
 * />
 * ```
 */
export function EventModal({
  open,
  onOpenChange,
  event,
  onUpdateSuccess,
  onDeleteSuccess,
  className,
}: EventModalProps) {
  // Modal mode (view or edit)
  const [mode, setMode] = useState<ModalMode>('view')

  // Form state (for edit mode)
  const [formData, setFormData] = useState<FormData>(() =>
    event ? eventToFormData(event) : {
      title: '',
      startDate: '',
      startTime: '',
      endDate: '',
      endTime: '',
      allDay: false,
      description: '',
      reminder: 'none',
      rrule: undefined,
    }
  )
  const [error, setError] = useState<string | null>(null)

  // Delete confirmation state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // Mutations
  const { updateEvent, isUpdating } = useUpdateEvent({
    onSuccess: () => {
      onUpdateSuccess?.()
      setMode('view')
      setError(null)
    },
    onError: (err) => {
      setError(err.message || 'Failed to update event')
    },
  })

  const { deleteEvent, isDeleting } = useDeleteEvent({
    onSuccess: () => {
      onDeleteSuccess?.()
      onOpenChange(false)
    },
    onError: (err) => {
      setError(err.message || 'Failed to delete event')
    },
  })

  const { completeTask, isCompleting } = useCompleteTask({
    onSuccess: () => {
      onUpdateSuccess?.()
    },
    onError: (err) => {
      setError(err.message || 'Failed to update task')
    },
  })

  const isLoading = isUpdating || isDeleting || isCompleting

  // Reset state when event changes or modal opens
  useEffect(() => {
    if (open && event) {
      setFormData(eventToFormData(event))
      setMode('view')
      setError(null)
      setShowDeleteConfirm(false)
    }
  }, [open, event])

  // Update form field
  const updateField = useCallback(
    <K extends keyof FormData>(field: K, value: FormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      setError(null)
    },
    []
  )

  // Compute the start date as a Date object for the recurrence selector
  const startDateForRecurrence = useMemo(() => {
    if (!formData.startDate) return new Date()
    if (formData.allDay) {
      return new Date(formData.startDate + 'T00:00:00')
    }
    return combineDateAndTime(formData.startDate, formData.startTime || '00:00')
  }, [formData.startDate, formData.startTime, formData.allDay])

  // Switch to edit mode
  const handleEditClick = useCallback(() => {
    if (event) {
      setFormData(eventToFormData(event))
      setMode('edit')
      setError(null)
    }
  }, [event])

  // Cancel edit
  const handleCancelEdit = useCallback(() => {
    if (event) {
      setFormData(eventToFormData(event))
      setMode('view')
      setError(null)
    }
  }, [event])

  // Validate form
  const validate = useCallback((): boolean => {
    if (!formData.title.trim()) {
      setError('Title is required')
      return false
    }

    if (!formData.startDate) {
      setError('Start date is required')
      return false
    }

    if (!formData.allDay && !formData.startTime) {
      setError('Start time is required')
      return false
    }

    // Validate end date/time is after start
    if (!formData.allDay) {
      const start = combineDateAndTime(formData.startDate, formData.startTime)
      const end = combineDateAndTime(
        formData.endDate || formData.startDate,
        formData.endTime || formData.startTime
      )

      if (end <= start) {
        setError('End time must be after start time')
        return false
      }
    }

    return true
  }, [formData])

  // Handle form submission
  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!event || !validate()) {
        return
      }

      // Build the input
      let startDate: Date
      let endDate: Date

      if (formData.allDay) {
        startDate = startOfDay(new Date(formData.startDate + 'T00:00:00'))
        endDate = startOfDay(
          new Date((formData.endDate || formData.startDate) + 'T00:00:00')
        )
        // For all-day events, end should be end of day (or next day start for multi-day)
        if (startDate.getTime() === endDate.getTime()) {
          endDate = addHours(endDate, 24)
        }
      } else {
        startDate = combineDateAndTime(formData.startDate, formData.startTime)
        endDate = combineDateAndTime(
          formData.endDate || formData.startDate,
          formData.endTime || formData.startTime
        )
      }

      const input: UpdateCalendarEventInput = {
        nodeId: event.nodeId,
        title: formData.title.trim(),
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        allDay: formData.allDay,
        description: formData.description.trim() || undefined,
        reminder:
          formData.reminder !== 'none'
            ? parseInt(formData.reminder, 10)
            : undefined,
        rrule: formData.rrule || undefined,
      }

      await updateEvent(input)
    },
    [event, formData, validate, updateEvent]
  )

  // Handle delete
  const handleDelete = useCallback(async () => {
    if (!event) return
    await deleteEvent(event.nodeId)
  }, [event, deleteEvent])

  // Handle task completion toggle
  const handleTaskToggle = useCallback(async () => {
    if (!event || !event.isTask) return
    await completeTask({
      nodeId: event.nodeId,
      completed: !event.isCompleted,
    })
  }, [event, completeTask])

  // Handle close
  const handleClose = useCallback(() => {
    if (!isLoading) {
      onOpenChange(false)
    }
  }, [isLoading, onOpenChange])

  if (!event) return null

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop
          className={cn(
            'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0',
            'bg-black/80 duration-100 supports-backdrop-filter:backdrop-blur-xs',
            'fixed inset-0 isolate z-50'
          )}
        />
        <DialogPrimitive.Popup
          className={cn(
            'data-open:animate-in data-closed:animate-out data-closed:fade-out-0 data-open:fade-in-0',
            'data-closed:zoom-out-95 data-open:zoom-in-95',
            'bg-background ring-foreground/10 rounded-xl p-0 ring-1 duration-100',
            'fixed top-1/2 left-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
            'outline-none max-h-[90vh] overflow-y-auto',
            className
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              {event.isTask ? (
                <CheckSquareIcon className="size-5 text-primary" />
              ) : (
                <CalendarIcon className="size-5 text-primary" />
              )}
              <DialogPrimitive.Title className="text-base font-semibold">
                {mode === 'edit' ? 'Edit' : ''} {event.isTask ? 'Task' : 'Event'}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              className="rounded-md p-1 hover:bg-muted transition-colors disabled:opacity-50"
              disabled={isLoading}
              onClick={handleClose}
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          {mode === 'view' ? (
            // View Mode
            <div className="p-4 space-y-4">
              {/* Title and completion status */}
              <div className="space-y-2">
                <div className="flex items-start gap-3">
                  {event.isTask && (
                    <button
                      type="button"
                      onClick={handleTaskToggle}
                      disabled={isCompleting}
                      className={cn(
                        'mt-0.5 flex-shrink-0 size-5 rounded border-2 flex items-center justify-center transition-colors',
                        event.isCompleted
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-muted-foreground/50 hover:border-primary',
                        isCompleting && 'opacity-50'
                      )}
                    >
                      {event.isCompleted && <CheckIcon className="size-3" weight="bold" />}
                    </button>
                  )}
                  <h2
                    className={cn(
                      'text-lg font-semibold',
                      event.isTask && event.isCompleted && 'line-through text-muted-foreground'
                    )}
                  >
                    {event.title}
                  </h2>
                </div>
              </div>

              {/* Date/Time */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ClockIcon className="size-4" />
                <span>{formatDateRange(event.start, event.end, event.allDay)}</span>
              </div>

              {/* Description */}
              {event.description && (
                <div className="text-sm">
                  <p className="whitespace-pre-wrap">{event.description}</p>
                </div>
              )}

              {/* Reminder */}
              {event.hasReminder && event.reminderMinutes && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BellIcon className="size-4" />
                  <span>{getReminderLabel(event.reminderMinutes)}</span>
                </div>
              )}

              {/* Recurring indicator */}
              {event.rrule && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <ArrowsClockwiseIcon className="size-4" />
                  <span>{formatRRuleHumanReadable(event.rrule)}</span>
                </div>
              )}

              {/* Google sync status */}
              {event.gcalEventId && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <GoogleLogoIcon className="size-4" />
                  <span>
                    Synced to Google Calendar
                    {event.gcalSyncedAt && (
                      <span className="text-xs ml-1">
                        ({format(event.gcalSyncedAt, 'MMM d, h:mm a')})
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 justify-between pt-2 border-t border-border">
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={isLoading}
                >
                  <TrashIcon data-icon="inline-start" className="size-4" />
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleEditClick}
                  disabled={isLoading}
                >
                  <PencilSimpleIcon data-icon="inline-start" className="size-4" />
                  Edit
                </Button>
              </div>
            </div>
          ) : (
            // Edit Mode
            <form onSubmit={handleSave} className="p-4 space-y-4">
              {/* Title */}
              <div className="space-y-1.5">
                <Label htmlFor="event-title">Title</Label>
                <Input
                  id="event-title"
                  type="text"
                  placeholder={event.isTask ? 'Task title...' : 'Event title...'}
                  value={formData.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    updateField('title', e.target.value)
                  }
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              {/* All Day Toggle */}
              <div className="flex items-center gap-2">
                <Checkbox
                  id="event-all-day"
                  checked={formData.allDay}
                  onCheckedChange={(checked: boolean | 'indeterminate') =>
                    updateField('allDay', checked === true)
                  }
                  disabled={isLoading}
                />
                <Label htmlFor="event-all-day" className="cursor-pointer">
                  All day
                </Label>
              </div>

              {/* Date/Time Grid */}
              <div className="grid gap-3">
                {/* Start Date/Time */}
                <div className="grid gap-2 grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="event-start-date">Start date</Label>
                    <Input
                      id="event-start-date"
                      type="date"
                      value={formData.startDate}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateField('startDate', e.target.value)
                      }
                      disabled={isLoading}
                    />
                  </div>
                  {!formData.allDay && (
                    <div className="space-y-1.5">
                      <Label htmlFor="event-start-time">Start time</Label>
                      <Input
                        id="event-start-time"
                        type="time"
                        value={formData.startTime}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateField('startTime', e.target.value)
                        }
                        disabled={isLoading}
                      />
                    </div>
                  )}
                </div>

                {/* End Date/Time */}
                <div className="grid gap-2 grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="event-end-date">End date</Label>
                    <Input
                      id="event-end-date"
                      type="date"
                      value={formData.endDate}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        updateField('endDate', e.target.value)
                      }
                      disabled={isLoading}
                      min={formData.startDate}
                    />
                  </div>
                  {!formData.allDay && (
                    <div className="space-y-1.5">
                      <Label htmlFor="event-end-time">End time</Label>
                      <Input
                        id="event-end-time"
                        type="time"
                        value={formData.endTime}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                          updateField('endTime', e.target.value)
                        }
                        disabled={isLoading}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <Label htmlFor="event-description">Description (optional)</Label>
                <Textarea
                  id="event-description"
                  placeholder="Add details..."
                  value={formData.description}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    updateField('description', e.target.value)
                  }
                  disabled={isLoading}
                  rows={2}
                />
              </div>

              {/* Reminder */}
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <BellIcon className="size-3.5" />
                  Reminder
                </Label>
                <Select
                  value={formData.reminder}
                  onValueChange={(value: string) => updateField('reminder', value)}
                  disabled={isLoading}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select reminder" />
                  </SelectTrigger>
                  <SelectContent>
                    {REMINDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Recurrence */}
              <RecurrenceSelector
                value={formData.rrule}
                onChange={(rrule) => updateField('rrule', rrule)}
                startDate={startDateForRecurrence}
                disabled={isLoading}
              />

              {/* Error Message */}
              {error && (
                <div className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">
                  {error}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelEdit}
                  disabled={isLoading}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isUpdating ? (
                    <>
                      <svg
                        className="size-4 animate-spin mr-1.5"
                        viewBox="0 0 24 24"
                        fill="none"
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
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* Delete Confirmation Overlay */}
          {showDeleteConfirm && (
            <div className="absolute inset-0 bg-background/95 flex flex-col items-center justify-center p-6 rounded-xl">
              <WarningIcon className="size-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Delete {event.isTask ? 'Task' : 'Event'}?</h3>
              <p className="text-sm text-muted-foreground text-center mb-6">
                Are you sure you want to delete &quot;{event.title}&quot;? This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <>
                      <svg
                        className="size-4 animate-spin mr-1.5"
                        viewBox="0 0 24 24"
                        fill="none"
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
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default EventModal
