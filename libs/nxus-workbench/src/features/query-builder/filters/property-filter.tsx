/**
 * PropertyFilterEditor - Editor for property/field value filters
 *
 * Allows selecting a field, comparison operator, and value.
 */

import { useState, useEffect } from 'react'
import { Check } from '@phosphor-icons/react'
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
import type { PropertyFilter, FilterOp } from '@nxus/db'
import { SYSTEM_FIELDS } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export interface PropertyFilterEditorProps {
  /** The property filter being edited */
  filter: PropertyFilter
  /** Called when filter is updated */
  onUpdate: (updates: Partial<PropertyFilter>) => void
  /** Called when editor should close */
  onClose: () => void
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Common fields that users might want to filter by
 */
const COMMON_FIELDS = [
  { systemId: SYSTEM_FIELDS.TYPE, label: 'Type' },
  { systemId: SYSTEM_FIELDS.STATUS, label: 'Status' },
  { systemId: SYSTEM_FIELDS.CATEGORY, label: 'Category' },
  { systemId: SYSTEM_FIELDS.DESCRIPTION, label: 'Description' },
  { systemId: SYSTEM_FIELDS.PATH, label: 'Path' },
  { systemId: SYSTEM_FIELDS.HOMEPAGE, label: 'Homepage' },
  { systemId: SYSTEM_FIELDS.TITLE, label: 'Title' },
  { systemId: SYSTEM_FIELDS.COLOR, label: 'Color' },
  { systemId: SYSTEM_FIELDS.ICON, label: 'Icon' },
  { systemId: SYSTEM_FIELDS.PLATFORM, label: 'Platform' },
  { systemId: SYSTEM_FIELDS.MODE, label: 'Mode' },
] as const

/**
 * Comparison operators with labels
 */
const OPERATORS: Array<{ value: FilterOp; label: string; needsValue: boolean }> = [
  { value: 'eq', label: 'equals', needsValue: true },
  { value: 'neq', label: 'not equals', needsValue: true },
  { value: 'contains', label: 'contains', needsValue: true },
  { value: 'startsWith', label: 'starts with', needsValue: true },
  { value: 'endsWith', label: 'ends with', needsValue: true },
  { value: 'gt', label: 'greater than', needsValue: true },
  { value: 'gte', label: 'greater or equal', needsValue: true },
  { value: 'lt', label: 'less than', needsValue: true },
  { value: 'lte', label: 'less or equal', needsValue: true },
  { value: 'isEmpty', label: 'is empty', needsValue: false },
  { value: 'isNotEmpty', label: 'is not empty', needsValue: false },
]

// ============================================================================
// Component
// ============================================================================

export function PropertyFilterEditor({
  filter,
  onUpdate,
  onClose,
}: PropertyFilterEditorProps) {
  const [fieldId, setFieldId] = useState(filter.fieldId || '')
  const [op, setOp] = useState<FilterOp>(filter.op || 'eq')
  const [value, setValue] = useState(
    typeof filter.value === 'string' ? filter.value : '',
  )

  // Check if the selected operator needs a value
  const selectedOperator = OPERATORS.find((o) => o.value === op)
  const needsValue = selectedOperator?.needsValue ?? true

  // Update local state when filter changes
  useEffect(() => {
    setFieldId(filter.fieldId || '')
    setOp(filter.op || 'eq')
    setValue(typeof filter.value === 'string' ? filter.value : '')
  }, [filter])

  // Handle field change
  const handleFieldChange = (newFieldId: string | null) => {
    if (!newFieldId) return
    setFieldId(newFieldId)
    onUpdate({ fieldId: newFieldId })
  }

  // Handle operator change
  const handleOpChange = (newOpValue: string | null) => {
    if (!newOpValue) return
    const newOp = newOpValue as FilterOp
    setOp(newOp)
    // Clear value if switching to an operator that doesn't need one
    const opConfig = OPERATORS.find((o) => o.value === newOp)
    if (!opConfig?.needsValue) {
      setValue('')
      onUpdate({ op: newOp, value: undefined })
    } else {
      onUpdate({ op: newOp })
    }
  }

  // Handle value change
  const handleValueChange = (newValue: string) => {
    setValue(newValue)
  }

  // Handle save
  const handleSave = () => {
    if (fieldId) {
      onUpdate({
        fieldId,
        op,
        value: needsValue ? value : undefined,
      })
    }
    onClose()
  }

  // Check if form is valid
  const isValid = fieldId && (!needsValue || value)

  // Get selected field label for display
  const selectedFieldLabel = COMMON_FIELDS.find((f) => f.systemId === fieldId)?.label

  return (
    <div className="flex flex-col gap-3">
      {/* Title */}
      <div className="text-xs font-medium text-foreground">
        Property Filter
      </div>

      {/* Field selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Field</Label>
        <Select value={fieldId || undefined} onValueChange={handleFieldChange}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {selectedFieldLabel || (
                <span className="text-muted-foreground">Select field</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {COMMON_FIELDS.map((field) => (
              <SelectItem key={field.systemId} value={field.systemId}>
                {field.label}
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
              {selectedOperator?.label || (
                <span className="text-muted-foreground">Select condition</span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {OPERATORS.map((operator) => (
              <SelectItem key={operator.value} value={operator.value}>
                {operator.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value input (if needed) */}
      {needsValue && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Value</Label>
          <Input
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            placeholder="Enter value..."
            className="w-full"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isValid) {
                handleSave()
              }
            }}
          />
        </div>
      )}

      {/* Help text */}
      <p className="text-[10px] text-muted-foreground/70">
        Find nodes where the selected field {selectedOperator?.label || 'matches'}{' '}
        {needsValue ? 'the specified value.' : '.'}
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
