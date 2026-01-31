/**
 * recurrence-selector.tsx - Component for selecting event recurrence patterns
 *
 * Provides a dropdown for common recurrence presets and a custom editor
 * for more complex patterns using RFC 5545 RRULE format.
 */

import { useState, useCallback, useMemo, useEffect } from 'react'
import { ArrowsClockwiseIcon } from '@phosphor-icons/react'
import {
  Button,
  Label,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@nxus/ui'

import {
  type RecurrencePattern,
  type Weekday,
  RECURRENCE_PRESETS,
  RECURRENCE_PRESET_LABELS,
  buildRRule,
  parseToPattern,
  formatPatternHumanReadable,
} from '../lib/rrule-utils.js'

// ============================================================================
// Types
// ============================================================================

export interface RecurrenceSelectorProps {
  /** Current RRULE string value */
  value: string | undefined

  /** Called when the recurrence changes */
  onChange: (rrule: string | undefined) => void

  /** Start date of the event (needed to build RRULE) */
  startDate: Date

  /** Whether the selector is disabled */
  disabled?: boolean

  /** Custom class name */
  className?: string
}

type PresetKey = keyof typeof RECURRENCE_PRESETS

// ============================================================================
// Constants
// ============================================================================

const WEEKDAY_OPTIONS: { value: Weekday; label: string; shortLabel: string }[] = [
  { value: 'MO', label: 'Monday', shortLabel: 'Mon' },
  { value: 'TU', label: 'Tuesday', shortLabel: 'Tue' },
  { value: 'WE', label: 'Wednesday', shortLabel: 'Wed' },
  { value: 'TH', label: 'Thursday', shortLabel: 'Thu' },
  { value: 'FR', label: 'Friday', shortLabel: 'Fri' },
  { value: 'SA', label: 'Saturday', shortLabel: 'Sat' },
  { value: 'SU', label: 'Sunday', shortLabel: 'Sun' },
]

const END_TYPE_OPTIONS = [
  { value: 'never', label: 'Never' },
  { value: 'count', label: 'After' },
  { value: 'until', label: 'On date' },
]

// ============================================================================
// Helpers
// ============================================================================

/**
 * Determine which preset (if any) matches the current pattern
 */
function getPresetFromPattern(
  pattern: RecurrencePattern | null
): PresetKey | 'custom' {
  if (!pattern) return 'none'

  // Check each preset for a match
  for (const [key, preset] of Object.entries(RECURRENCE_PRESETS)) {
    if (!preset && !pattern) return key as PresetKey

    if (preset && pattern) {
      const match =
        preset.frequency === pattern.frequency &&
        preset.interval === pattern.interval &&
        JSON.stringify(preset.weekdays?.sort()) ===
          JSON.stringify(pattern.weekdays?.sort()) &&
        !pattern.until &&
        !pattern.count

      if (match) return key as PresetKey
    }
  }

  return 'custom'
}

/**
 * Format date as YYYY-MM-DD for input
 */
function formatDateForInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

// ============================================================================
// Component
// ============================================================================

/**
 * Recurrence pattern selector with preset options and custom editor
 *
 * @example
 * ```tsx
 * const [rrule, setRrule] = useState<string | undefined>()
 *
 * <RecurrenceSelector
 *   value={rrule}
 *   onChange={setRrule}
 *   startDate={eventStartDate}
 * />
 * ```
 */
export function RecurrenceSelector({
  value,
  onChange,
  startDate,
  disabled = false,
  className,
}: RecurrenceSelectorProps) {
  // Parse the current RRULE to get the pattern
  const currentPattern = useMemo(
    () => (value ? parseToPattern(value) : null),
    [value]
  )

  // Determine which preset matches (if any)
  const selectedPreset = useMemo(
    () => getPresetFromPattern(currentPattern),
    [currentPattern]
  )

  // State for custom editor
  const [showCustomEditor, setShowCustomEditor] = useState(
    selectedPreset === 'custom'
  )
  const [customPattern, setCustomPattern] = useState<RecurrencePattern>(
    currentPattern ?? {
      frequency: 'weekly',
      interval: 1,
    }
  )
  const [endType, setEndType] = useState<'never' | 'count' | 'until'>(() => {
    if (currentPattern?.count) return 'count'
    if (currentPattern?.until) return 'until'
    return 'never'
  })
  const [endCount, setEndCount] = useState(currentPattern?.count ?? 10)
  const [endDate, setEndDate] = useState(() => {
    if (currentPattern?.until) {
      return formatDateForInput(currentPattern.until)
    }
    // Default to 3 months from start
    const defaultEnd = new Date(startDate)
    defaultEnd.setMonth(defaultEnd.getMonth() + 3)
    return formatDateForInput(defaultEnd)
  })

  // Display label for custom option
  const customDisplayLabel = useMemo(() => {
    if (selectedPreset === 'custom' && currentPattern) {
      return formatPatternHumanReadable(currentPattern)
    }
    return 'Custom...'
  }, [selectedPreset, currentPattern])

  // Handle preset selection from dropdown
  const handlePresetChange = useCallback(
    (preset: string) => {
      if (preset === 'none') {
        onChange(undefined)
        setShowCustomEditor(false)
        return
      }

      if (preset === 'custom') {
        setShowCustomEditor(true)
        // If we have a current pattern, use it; otherwise use defaults
        if (currentPattern) {
          setCustomPattern(currentPattern)
        }
        return
      }

      // Apply the selected preset
      const presetPattern = RECURRENCE_PRESETS[preset as PresetKey]
      if (presetPattern) {
        const rrule = buildRRule(presetPattern, startDate)
        onChange(rrule)
        setShowCustomEditor(false)
      }
    },
    [onChange, startDate, currentPattern]
  )

  // Handle custom pattern changes
  const handleApplyCustom = useCallback(() => {
    const patternToApply: RecurrencePattern = {
      ...customPattern,
    }

    // Apply end condition
    if (endType === 'count') {
      patternToApply.count = endCount
      patternToApply.until = undefined
    } else if (endType === 'until') {
      patternToApply.until = new Date(endDate + 'T23:59:59')
      patternToApply.count = undefined
    } else {
      patternToApply.count = undefined
      patternToApply.until = undefined
    }

    const rrule = buildRRule(patternToApply, startDate)
    onChange(rrule)
    setShowCustomEditor(false)
  }, [customPattern, endType, endCount, endDate, startDate, onChange])

  // Update weekdays in custom pattern
  const toggleWeekday = useCallback((day: Weekday) => {
    setCustomPattern((prev) => {
      const weekdays = prev.weekdays ?? []
      const hasDay = weekdays.includes(day)

      if (hasDay) {
        // Remove the day (but keep at least one)
        const newWeekdays = weekdays.filter((d) => d !== day)
        return {
          ...prev,
          weekdays: newWeekdays.length > 0 ? newWeekdays : undefined,
        }
      } else {
        // Add the day
        return {
          ...prev,
          weekdays: [...weekdays, day],
        }
      }
    })
  }, [])

  // Sync custom pattern state when value changes externally
  useEffect(() => {
    if (currentPattern && selectedPreset === 'custom') {
      setCustomPattern(currentPattern)
      if (currentPattern.count) {
        setEndType('count')
        setEndCount(currentPattern.count)
      } else if (currentPattern.until) {
        setEndType('until')
        setEndDate(formatDateForInput(currentPattern.until))
      } else {
        setEndType('never')
      }
    }
  }, [currentPattern, selectedPreset])

  // Sync showCustomEditor when preset changes
  useEffect(() => {
    setShowCustomEditor(selectedPreset === 'custom')
  }, [selectedPreset])

  return (
    <div className={cn('space-y-2', className)}>
      <Label className="flex items-center gap-1.5">
        <ArrowsClockwiseIcon className="size-3.5" />
        Repeat
      </Label>

      {/* Preset Selector */}
      <Select
        value={selectedPreset}
        onValueChange={handlePresetChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Does not repeat">
            {selectedPreset === 'custom' ? customDisplayLabel : RECURRENCE_PRESET_LABELS[selectedPreset as PresetKey]}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(RECURRENCE_PRESET_LABELS) as PresetKey[]).map((key) => (
            <SelectItem key={key} value={key}>
              {RECURRENCE_PRESET_LABELS[key]}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom...</SelectItem>
        </SelectContent>
      </Select>

      {/* Custom Editor (shown when custom is selected) */}
      {showCustomEditor && (
        <div className="p-3 space-y-3 border border-border rounded-md bg-muted/30">
          {/* Frequency */}
          <div className="space-y-1.5">
            <Label htmlFor="recurrence-frequency" className="text-xs">
              Repeat every
            </Label>
            <div className="flex gap-2">
              <Input
                id="recurrence-interval"
                type="number"
                min={1}
                max={99}
                value={customPattern.interval}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCustomPattern((prev) => ({
                    ...prev,
                    interval: Math.max(
                      1,
                      Math.min(99, parseInt(e.target.value, 10) || 1)
                    ),
                  }))
                }
                className="w-16"
                disabled={disabled}
              />
              <Select
                value={customPattern.frequency}
                onValueChange={(
                  value: 'daily' | 'weekly' | 'monthly' | 'yearly'
                ) =>
                  setCustomPattern((prev) => ({
                    ...prev,
                    frequency: value,
                    // Clear weekdays if not weekly
                    weekdays: value === 'weekly' ? prev.weekdays : undefined,
                  }))
                }
                disabled={disabled}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">
                    {customPattern.interval === 1 ? 'day' : 'days'}
                  </SelectItem>
                  <SelectItem value="weekly">
                    {customPattern.interval === 1 ? 'week' : 'weeks'}
                  </SelectItem>
                  <SelectItem value="monthly">
                    {customPattern.interval === 1 ? 'month' : 'months'}
                  </SelectItem>
                  <SelectItem value="yearly">
                    {customPattern.interval === 1 ? 'year' : 'years'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Weekday selector (only for weekly) */}
          {customPattern.frequency === 'weekly' && (
            <div className="space-y-1.5">
              <Label className="text-xs">On days</Label>
              <div className="flex flex-wrap gap-1">
                {WEEKDAY_OPTIONS.map((day) => {
                  const isSelected =
                    customPattern.weekdays?.includes(day.value) ?? false
                  return (
                    <button
                      key={day.value}
                      type="button"
                      className={cn(
                        'px-2 py-1 text-xs rounded-md transition-colors border',
                        isSelected
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border hover:bg-muted'
                      )}
                      onClick={() => toggleWeekday(day.value)}
                      disabled={disabled}
                    >
                      {day.shortLabel}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* End condition */}
          <div className="space-y-1.5">
            <Label className="text-xs">Ends</Label>
            <Select
              value={endType}
              onValueChange={(value: 'never' | 'count' | 'until') =>
                setEndType(value)
              }
              disabled={disabled}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {END_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {endType === 'count' && (
              <div className="flex items-center gap-2 mt-2">
                <Input
                  type="number"
                  min={1}
                  max={999}
                  value={endCount}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setEndCount(
                      Math.max(
                        1,
                        Math.min(999, parseInt(e.target.value, 10) || 1)
                      )
                    )
                  }
                  className="w-20"
                  disabled={disabled}
                />
                <span className="text-sm text-muted-foreground">
                  occurrences
                </span>
              </div>
            )}

            {endType === 'until' && (
              <Input
                type="date"
                value={endDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEndDate(e.target.value)
                }
                min={formatDateForInput(startDate)}
                className="mt-2"
                disabled={disabled}
              />
            )}
          </div>

          {/* Apply button */}
          <Button
            type="button"
            size="sm"
            className="w-full"
            onClick={handleApplyCustom}
            disabled={disabled}
          >
            Apply Custom Recurrence
          </Button>
        </div>
      )}
    </div>
  )
}

export default RecurrenceSelector
