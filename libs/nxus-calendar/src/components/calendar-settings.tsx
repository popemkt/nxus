/**
 * calendar-settings.tsx - Settings modal for calendar preferences
 *
 * Provides UI for configuring:
 * - Display settings (default view, week start, time format, working hours)
 * - Task settings (completed task style, show/hide completed)
 * - Status field configuration (status field, done statuses)
 * - Supertag configuration (task/event supertags)
 */

import { useState, useCallback } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import {
  XIcon,
  GearIcon,
  CalendarIcon,
  CheckSquareIcon,
  TagIcon,
  ClockIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Checkbox,
  cn,
} from '@nxus/ui'

import { useCalendarSettingsStore } from '../stores/calendar-settings.store.js'
import type {
  CalendarView,
  WeekStart,
  TimeFormat,
  CompletedTaskStyle,
} from '../types/calendar-event.js'

// ============================================================================
// Types
// ============================================================================

export interface CalendarSettingsProps {
  /** Whether the modal is open */
  open: boolean

  /** Called when the modal should close */
  onOpenChange: (open: boolean) => void

  /** Custom class name */
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

const VIEW_OPTIONS: { value: CalendarView; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'agenda', label: 'Agenda' },
]

const WEEK_START_OPTIONS: { value: WeekStart; label: string }[] = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 6, label: 'Saturday' },
]

const TIME_FORMAT_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: '12h', label: '12-hour (AM/PM)' },
  { value: '24h', label: '24-hour' },
]

const COMPLETED_TASK_STYLE_OPTIONS: { value: CompletedTaskStyle; label: string }[] = [
  { value: 'muted', label: 'Muted (dimmed)' },
  { value: 'strikethrough', label: 'Strikethrough' },
  { value: 'hidden', label: 'Hidden' },
]

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => ({
  value: i,
  label: i.toString().padStart(2, '0') + ':00',
}))

// ============================================================================
// Section Components
// ============================================================================

interface SettingsSectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}

function SettingsSection({ title, icon, children }: SettingsSectionProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {icon}
        {title}
      </div>
      <div className="space-y-3 pl-6">{children}</div>
    </div>
  )
}

interface SettingsRowProps {
  label: string
  htmlFor?: string
  description?: string
  children: React.ReactNode
}

function SettingsRow({ label, htmlFor, description, children }: SettingsRowProps) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <Label htmlFor={htmlFor} className="text-sm font-medium">
          {label}
        </Label>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  )
}

// ============================================================================
// Tag List Component
// ============================================================================

interface TagListProps {
  tags: string[]
  onAdd: (tag: string) => void
  onRemove: (tag: string) => void
  placeholder: string
}

function TagList({ tags, onAdd, onRemove, placeholder }: TagListProps) {
  const [newTag, setNewTag] = useState('')

  const handleAdd = useCallback(() => {
    const trimmed = newTag.trim()
    if (trimmed && !tags.includes(trimmed)) {
      onAdd(trimmed)
      setNewTag('')
    }
  }, [newTag, tags, onAdd])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        handleAdd()
      }
    },
    [handleAdd]
  )

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          type="text"
          value={newTag}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTag(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 h-8 text-sm"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAdd}
          disabled={!newTag.trim()}
          className="h-8"
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
            >
              {tag}
              <button
                type="button"
                onClick={() => onRemove(tag)}
                className="rounded hover:bg-muted-foreground/20 p-0.5 -mr-0.5"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Component
// ============================================================================

/**
 * Calendar Settings Modal
 *
 * Provides a comprehensive UI for configuring calendar preferences.
 * All settings are persisted via the useCalendarSettingsStore.
 *
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false)
 *
 * <CalendarSettings
 *   open={isOpen}
 *   onOpenChange={setIsOpen}
 * />
 * ```
 */
export function CalendarSettings({
  open,
  onOpenChange,
  className,
}: CalendarSettingsProps) {
  // Get settings from store
  const {
    display,
    supertags,
    taskCompletion,
    // Actions
    setDefaultView,
    setWeekStartsOn,
    setTimeFormat,
    setWorkingHours,
    setShowCompletedTasks,
    setCompletedTaskStyle,
    addTaskSupertag,
    removeTaskSupertag,
    addEventSupertag,
    removeEventSupertag,
    setStatusField,
    addDoneStatus,
    removeDoneStatus,
    resetToDefaults,
  } = useCalendarSettingsStore()

  // Handle reset with confirmation
  const handleReset = useCallback(() => {
    if (window.confirm('Reset all calendar settings to defaults?')) {
      resetToDefaults()
    }
  }, [resetToDefaults])

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
            'fixed top-1/2 left-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2',
            'outline-none max-h-[90vh] overflow-hidden flex flex-col',
            className
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-4 py-3 flex-shrink-0">
            <div className="flex items-center gap-2">
              <GearIcon className="size-5" />
              <DialogPrimitive.Title className="text-base font-semibold">
                Calendar Settings
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close className="rounded-md p-1 hover:bg-muted transition-colors">
              <XIcon className="size-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </div>

          {/* Content */}
          <div className="overflow-y-auto flex-1 p-4 space-y-6">
            {/* Display Settings */}
            <SettingsSection
              title="Display"
              icon={<CalendarIcon className="size-4" />}
            >
              <SettingsRow
                label="Default view"
                htmlFor="settings-default-view"
                description="Calendar view shown when opening"
              >
                <Select
                  value={display.defaultView}
                  onValueChange={(value: string) => setDefaultView(value as CalendarView)}
                >
                  <SelectTrigger id="settings-default-view" className="w-32 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VIEW_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsRow>

              <SettingsRow
                label="Week starts on"
                htmlFor="settings-week-start"
                description="First day of the week"
              >
                <Select
                  value={display.weekStartsOn.toString()}
                  onValueChange={(value: string) =>
                    setWeekStartsOn(parseInt(value, 10) as WeekStart)
                  }
                >
                  <SelectTrigger id="settings-week-start" className="w-32 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEK_START_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value.toString()}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsRow>

              <SettingsRow
                label="Time format"
                htmlFor="settings-time-format"
                description="How times are displayed"
              >
                <Select
                  value={display.timeFormat}
                  onValueChange={(value: string) => setTimeFormat(value as TimeFormat)}
                >
                  <SelectTrigger id="settings-time-format" className="w-32 h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_FORMAT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsRow>

              <SettingsRow
                label="Working hours"
                description="Highlighted hours in day/week view"
              >
                <div className="flex items-center gap-1">
                  <Select
                    value={display.workingHoursStart.toString()}
                    onValueChange={(value: string) =>
                      setWorkingHours(parseInt(value, 10), display.workingHoursEnd)
                    }
                  >
                    <SelectTrigger className="w-20 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOUR_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value.toString()}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <span className="text-muted-foreground text-sm">to</span>
                  <Select
                    value={display.workingHoursEnd.toString()}
                    onValueChange={(value: string) =>
                      setWorkingHours(display.workingHoursStart, parseInt(value, 10))
                    }
                  >
                    <SelectTrigger className="w-20 h-8 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOUR_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value.toString()}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </SettingsRow>
            </SettingsSection>

            {/* Task Settings */}
            <SettingsSection
              title="Task Display"
              icon={<CheckSquareIcon className="size-4" />}
            >
              <SettingsRow
                label="Show completed tasks"
                htmlFor="settings-show-completed"
                description="Display completed tasks on calendar"
              >
                <Checkbox
                  id="settings-show-completed"
                  checked={display.showCompletedTasks}
                  onCheckedChange={(checked: boolean | 'indeterminate') =>
                    setShowCompletedTasks(checked === true)
                  }
                />
              </SettingsRow>

              <SettingsRow
                label="Completed task style"
                htmlFor="settings-completed-style"
                description="How completed tasks appear"
              >
                <Select
                  value={display.completedTaskStyle}
                  onValueChange={(value: string) =>
                    setCompletedTaskStyle(value as CompletedTaskStyle)
                  }
                >
                  <SelectTrigger
                    id="settings-completed-style"
                    className="w-36 h-8 text-sm"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COMPLETED_TASK_STYLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </SettingsRow>
            </SettingsSection>

            {/* Status Configuration */}
            <SettingsSection
              title="Task Status"
              icon={<ClockIcon className="size-4" />}
            >
              <SettingsRow
                label="Status field"
                htmlFor="settings-status-field"
                description="Field used for task status"
              >
                <Input
                  id="settings-status-field"
                  type="text"
                  value={taskCompletion.statusField}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setStatusField(e.target.value)
                  }
                  placeholder="field:status"
                  className="w-36 h-8 text-sm"
                />
              </SettingsRow>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Done status values
                </Label>
                <p className="text-xs text-muted-foreground">
                  Status values that mark a task as completed
                </p>
                <TagList
                  tags={taskCompletion.doneStatuses}
                  onAdd={addDoneStatus}
                  onRemove={removeDoneStatus}
                  placeholder="Add status value..."
                />
              </div>
            </SettingsSection>

            {/* Supertag Configuration */}
            <SettingsSection
              title="Supertags"
              icon={<TagIcon className="size-4" />}
            >
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Task supertags
                </Label>
                <p className="text-xs text-muted-foreground">
                  Additional supertags to display as tasks (besides #Task)
                </p>
                <TagList
                  tags={supertags.taskSupertags}
                  onAdd={addTaskSupertag}
                  onRemove={removeTaskSupertag}
                  placeholder="Add supertag ID..."
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-medium">
                  Event supertags
                </Label>
                <p className="text-xs text-muted-foreground">
                  Additional supertags to display as events (besides #Event)
                </p>
                <TagList
                  tags={supertags.eventSupertags}
                  onAdd={addEventSupertag}
                  onRemove={removeEventSupertag}
                  placeholder="Add supertag ID..."
                />
              </div>
            </SettingsSection>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3 flex-shrink-0">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="text-muted-foreground"
            >
              <TrashIcon className="size-3.5 mr-1.5" />
              Reset to defaults
            </Button>
            <DialogPrimitive.Close asChild>
              <Button type="button" variant="default" size="sm">
                Done
              </Button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default CalendarSettings
