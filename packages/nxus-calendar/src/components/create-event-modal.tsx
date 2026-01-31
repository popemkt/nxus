/**
 * create-event-modal.tsx - Modal for creating new calendar events and tasks
 *
 * Features:
 * - Form fields: title, type (task/event), start/end date/time, all-day toggle
 * - Pre-fills date/time from clicked slot
 * - Submits via createCalendarEventServerFn
 * - Optional: description, reminder
 */

import { useState, useCallback, useEffect } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { format, addHours, startOfDay } from 'date-fns'
import {
  XIcon,
  CalendarIcon,
  CheckSquareIcon,
  BellIcon,
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
  SlotSelectInfo,
  CreateCalendarEventInput,
} from '../types/calendar-event.js'
import { useCreateEvent } from '../hooks/use-event-mutations.js'

// ============================================================================
// Types
// ============================================================================

export interface CreateEventModalProps {
  /** Whether the modal is open */
  open: boolean

  /** Called when the modal should close */
  onOpenChange: (open: boolean) => void

  /** Pre-filled slot info from calendar selection */
  slotInfo?: SlotSelectInfo | null

  /** Called after successful event creation */
  onSuccess?: () => void

  /** Custom class name */
  className?: string
}

interface FormData {
  title: string
  isTask: boolean
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  allDay: boolean
  description: string
  reminder: string // 'none' | '5' | '10' | '15' | '30' | '60' | '1440' (minutes)
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
 * Get the default form data from slot info
 */
function getDefaultFormData(slotInfo?: SlotSelectInfo | null): FormData {
  const now = new Date()
  let start = slotInfo?.start ?? now
  let end = slotInfo?.end ?? addHours(now, 1)

  // If start and end are the same (click action), default to 1 hour duration
  if (start.getTime() === end.getTime()) {
    end = addHours(start, 1)
  }

  // Check if this looks like an all-day selection
  // (start at midnight and end at midnight of next day, or just a date click)
  const isAllDaySelection =
    start.getHours() === 0 &&
    start.getMinutes() === 0 &&
    end.getHours() === 0 &&
    end.getMinutes() === 0

  return {
    title: '',
    isTask: false,
    startDate: toDateString(start),
    startTime: isAllDaySelection ? '09:00' : toTimeString(start),
    endDate: toDateString(isAllDaySelection ? start : end),
    endTime: isAllDaySelection ? '10:00' : toTimeString(end),
    allDay: isAllDaySelection,
    description: '',
    reminder: 'none',
  }
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

// ============================================================================
// Component
// ============================================================================

/**
 * Modal for creating new calendar events and tasks
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false)
 * const [slotInfo, setSlotInfo] = useState<SlotSelectInfo | null>(null)
 *
 * <CreateEventModal
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 *   slotInfo={slotInfo}
 *   onSuccess={() => setIsOpen(false)}
 * />
 * ```
 */
export function CreateEventModal({
  open,
  onOpenChange,
  slotInfo,
  onSuccess,
  className,
}: CreateEventModalProps) {
  // Form state
  const [formData, setFormData] = useState<FormData>(() =>
    getDefaultFormData(slotInfo)
  )
  const [error, setError] = useState<string | null>(null)

  // Create event mutation
  const { createEvent, isCreating } = useCreateEvent({
    onSuccess: () => {
      onSuccess?.()
      onOpenChange(false)
      // Reset form
      setFormData(getDefaultFormData(null))
      setError(null)
    },
    onError: (err) => {
      setError(err.message || 'Failed to create event')
    },
  })

  // Reset form when slot info changes or modal opens
  useEffect(() => {
    if (open) {
      setFormData(getDefaultFormData(slotInfo))
      setError(null)
    }
  }, [open, slotInfo])

  // Update form field
  const updateField = useCallback(
    <K extends keyof FormData>(field: K, value: FormData[K]) => {
      setFormData((prev) => ({ ...prev, [field]: value }))
      setError(null)
    },
    []
  )


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
  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()

      if (!validate()) {
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

      const input: CreateCalendarEventInput = {
        title: formData.title.trim(),
        isTask: formData.isTask,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        allDay: formData.allDay,
        description: formData.description.trim() || undefined,
        reminder:
          formData.reminder !== 'none'
            ? parseInt(formData.reminder, 10)
            : undefined,
      }

      await createEvent(input)
    },
    [formData, validate, createEvent]
  )

  // Handle close
  const handleClose = useCallback(() => {
    if (!isCreating) {
      onOpenChange(false)
    }
  }, [isCreating, onOpenChange])

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
            <DialogPrimitive.Title className="text-base font-semibold">
              {formData.isTask ? 'New Task' : 'New Event'}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              className="rounded-md p-1 hover:bg-muted transition-colors disabled:opacity-50"
              disabled={isCreating}
              onClick={handleClose}
            >
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-4 space-y-4">
            {/* Type Toggle */}
            <div className="flex gap-2">
              <Button
                type="button"
                variant={!formData.isTask ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateField('isTask', false)}
                className="flex-1"
              >
                <CalendarIcon data-icon="inline-start" className="size-4" />
                Event
              </Button>
              <Button
                type="button"
                variant={formData.isTask ? 'default' : 'outline'}
                size="sm"
                onClick={() => updateField('isTask', true)}
                className="flex-1"
              >
                <CheckSquareIcon data-icon="inline-start" className="size-4" />
                Task
              </Button>
            </div>

            {/* Title */}
            <div className="space-y-1.5">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                type="text"
                placeholder={formData.isTask ? 'Task title...' : 'Event title...'}
                value={formData.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('title', e.target.value)}
                disabled={isCreating}
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
                disabled={isCreating}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('startDate', e.target.value)}
                    disabled={isCreating}
                  />
                </div>
                {!formData.allDay && (
                  <div className="space-y-1.5">
                    <Label htmlFor="event-start-time">Start time</Label>
                    <Input
                      id="event-start-time"
                      type="time"
                      value={formData.startTime}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('startTime', e.target.value)}
                      disabled={isCreating}
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
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('endDate', e.target.value)}
                    disabled={isCreating}
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
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateField('endTime', e.target.value)}
                      disabled={isCreating}
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
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => updateField('description', e.target.value)}
                disabled={isCreating}
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
                disabled={isCreating}
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
                onClick={handleClose}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isCreating}>
                {isCreating ? (
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
                    Creating...
                  </>
                ) : (
                  <>Create {formData.isTask ? 'Task' : 'Event'}</>
                )}
              </Button>
            </div>
          </form>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default CreateEventModal
