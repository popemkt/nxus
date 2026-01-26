/**
 * HasFieldFilterEditor - Editor for field existence filters
 *
 * Allows checking if nodes have or don't have a specific field defined.
 */

import { useState, useEffect } from 'react'
import { Check, CheckSquare } from '@phosphor-icons/react'
import {
  Button,
  Checkbox,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@nxus/ui'
import type { HasFieldFilter } from '@nxus/db'
import { SYSTEM_FIELDS } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export interface HasFieldFilterEditorProps {
  /** The hasField filter being edited */
  filter: HasFieldFilter
  /** Called when filter is updated */
  onUpdate: (updates: Partial<HasFieldFilter>) => void
  /** Called when editor should close */
  onClose: () => void
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Common fields that users might want to check for existence
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

// ============================================================================
// Component
// ============================================================================

export function HasFieldFilterEditor({
  filter,
  onUpdate,
  onClose,
}: HasFieldFilterEditorProps) {
  const [fieldSystemId, setFieldSystemId] = useState(filter.fieldSystemId || '')
  const [negate, setNegate] = useState(filter.negate ?? false)

  // Update local state when filter changes
  useEffect(() => {
    setFieldSystemId(filter.fieldSystemId || '')
    setNegate(filter.negate ?? false)
  }, [filter])

  // Handle field change
  const handleFieldChange = (value: string | null) => {
    if (!value) return
    setFieldSystemId(value)
    onUpdate({ fieldSystemId: value })
  }

  // Handle negate toggle
  const handleNegateChange = (checked: boolean) => {
    setNegate(checked)
    onUpdate({ negate: checked })
  }

  // Handle save
  const handleSave = () => {
    if (fieldSystemId) {
      onUpdate({
        fieldSystemId,
        negate,
      })
    }
    onClose()
  }

  // Get selected field label
  const selectedFieldLabel = COMMON_FIELDS.find((f) => f.systemId === fieldSystemId)?.label

  return (
    <div className="flex flex-col gap-3">
      {/* Title */}
      <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
        <CheckSquare className="size-3.5" weight="bold" />
        Field Existence Filter
      </div>

      {/* Field selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Field</Label>
        <Select value={fieldSystemId || undefined} onValueChange={handleFieldChange}>
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

      {/* Negate toggle */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="negate"
          checked={negate}
          onCheckedChange={(checked) => handleNegateChange(checked === true)}
        />
        <Label
          htmlFor="negate"
          className="text-xs text-muted-foreground cursor-pointer"
        >
          Does NOT have this field (negate)
        </Label>
      </div>

      {/* Help text */}
      <p className="text-[10px] text-muted-foreground/70">
        {negate
          ? `Find nodes that do NOT have the ${selectedFieldLabel || 'selected'} field defined.`
          : `Find nodes that have the ${selectedFieldLabel || 'selected'} field defined (with any value).`}
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
          disabled={!fieldSystemId}
        >
          <Check weight="bold" data-icon="inline-start" />
          Done
        </Button>
      </div>
    </div>
  )
}
