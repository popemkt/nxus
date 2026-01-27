/**
 * TemporalFilterEditor - Editor for temporal/date-based filters
 *
 * Allows filtering by creation or update date using various operators.
 */

import { useState, useEffect } from 'react'
import { Check, Calendar } from '@phosphor-icons/react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nxus/ui'
import type { TemporalFilter } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export interface TemporalFilterEditorProps {
  /** The temporal filter being edited */
  filter: TemporalFilter
  /** Called when filter is updated */
  onUpdate: (updates: Partial<TemporalFilter>) => void
  /** Called when editor should close */
  onClose: () => void
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Date field options
 */
const DATE_FIELDS = [
  { value: 'createdAt' as const, label: 'Created' },
  { value: 'updatedAt' as const, label: 'Updated' },
] as const

/**
 * Temporal operators
 */
const TEMPORAL_OPERATORS = [
  {
    value: 'within' as const,
    label: 'Within last',
    description: 'Within the last N days',
    needsDays: true,
    needsDate: false,
  },
  {
    value: 'before' as const,
    label: 'Before',
    description: 'Before a specific date',
    needsDays: false,
    needsDate: true,
  },
  {
    value: 'after' as const,
    label: 'After',
    description: 'After a specific date',
    needsDays: false,
    needsDate: true,
  },
] as const

/**
 * Common "within last N days" presets
 */
const DAYS_PRESETS = [
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 14, label: '14 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 365, label: '1 year' },
] as const

// ============================================================================
// Component
// ============================================================================

export function TemporalFilterEditor({
  filter,
  onUpdate,
  onClose,
}: TemporalFilterEditorProps) {
  const [field, setField] = useState<'createdAt' | 'updatedAt'>(filter.field || 'createdAt')
  const [op, setOp] = useState<'within' | 'before' | 'after'>(filter.op || 'within')
  const [days, setDays] = useState(filter.days ?? 7)
  const [date, setDate] = useState(filter.date || '')

  // Update local state when filter changes
  useEffect(() => {
    setField(filter.field || 'createdAt')
    setOp(filter.op || 'within')
    setDays(filter.days ?? 7)
    setDate(filter.date || '')
  }, [filter])

  // Get selected operator config
  const selectedOperator = TEMPORAL_OPERATORS.find((o) => o.value === op)

  // Handle field change
  const handleFieldChange = (value: string | null) => {
    if (!value) return
    const newField = value as 'createdAt' | 'updatedAt'
    setField(newField)
    onUpdate({ field: newField })
  }

  // Handle operator change
  const handleOpChange = (value: string | null) => {
    if (!value) return
    const newOp = value as 'within' | 'before' | 'after'
    setOp(newOp)
    // Clear irrelevant values based on new operator
    const opConfig = TEMPORAL_OPERATORS.find((o) => o.value === newOp)
    if (opConfig?.needsDays) {
      onUpdate({ op: newOp, days: days || 7, date: undefined })
    } else {
      onUpdate({ op: newOp, date: date || undefined, days: undefined })
    }
  }

  // Handle days change
  const handleDaysChange = (value: number) => {
    setDays(value)
    onUpdate({ days: value })
  }

  // Handle date change
  const handleDateChange = (value: string) => {
    setDate(value)
    onUpdate({ date: value || undefined })
  }

  // Handle save
  const handleSave = () => {
    const updates: Partial<TemporalFilter> = { field, op }
    if (selectedOperator?.needsDays) {
      updates.days = days
      updates.date = undefined
    } else {
      updates.date = date || undefined
      updates.days = undefined
    }
    onUpdate(updates)
    onClose()
  }

  // Check if form is valid
  const isValid = field && op && (
    (selectedOperator?.needsDays && days > 0) ||
    (selectedOperator?.needsDate && date)
  )

  // Get display text for field
  const fieldLabel = DATE_FIELDS.find((f) => f.value === field)?.label

  return (
    <div className="flex flex-col gap-3">
      {/* Title */}
      <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
        <Calendar className="size-3.5" weight="bold" />
        Date Filter
      </div>

      {/* Field selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Date Field</Label>
        <Select value={field} onValueChange={handleFieldChange}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {fieldLabel || 'Select field'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DATE_FIELDS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Operator selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Condition</Label>
        <Select value={op} onValueChange={handleOpChange}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {selectedOperator?.label || 'Select condition'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {TEMPORAL_OPERATORS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col gap-0.5">
                  <span>{option.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {option.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Days selector (for "within" operator) */}
      {selectedOperator?.needsDays && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Number of days</Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={days}
              onChange={(e) => handleDaysChange(parseInt(e.target.value, 10) || 1)}
              min={1}
              className="w-20"
            />
            <span className="text-xs text-muted-foreground">days</span>
          </div>
          {/* Presets */}
          <div className="flex flex-wrap gap-1 mt-1">
            {DAYS_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                variant={days === preset.value ? 'default' : 'outline'}
                size="xs"
                onClick={() => handleDaysChange(preset.value)}
                className="text-[10px] h-6 px-2"
              >
                {preset.label}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Date picker (for "before" and "after" operators) */}
      {selectedOperator?.needsDate && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => handleDateChange(e.target.value)}
            className="w-full"
          />
        </div>
      )}

      {/* Help text */}
      <p className="text-[10px] text-muted-foreground/70">
        Find nodes {fieldLabel?.toLowerCase() || 'created'}{' '}
        {op === 'within'
          ? `within the last ${days} ${days === 1 ? 'day' : 'days'}`
          : op === 'before'
            ? `before ${date || '(select date)'}`
            : `after ${date || '(select date)'}`}
        .
      </p>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="default"
          size="sm"
          onClick={handleSave}
          disabled={!isValid}
        >
          <Check weight="bold" data-icon="inline-start" />
          Done
        </Button>
      </div>
    </div>
  )
}
