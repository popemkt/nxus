/**
 * HasFieldFilterEditor - Editor for field existence filters
 *
 * Allows checking if nodes have or don't have a specific field defined.
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
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
import { getQueryFieldsServerFn } from '../../../server/query.server.js'

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
// Component
// ============================================================================

export function HasFieldFilterEditor({
  filter,
  onUpdate,
  onClose,
}: HasFieldFilterEditorProps) {
  const [fieldId, setFieldId] = useState(filter.fieldId || '')
  const [negate, setNegate] = useState(filter.negate ?? false)

  // Fetch all available fields from the database
  const {
    data: fieldsData,
    isLoading: fieldsLoading,
    isError: fieldsError,
  } = useQuery({
    queryKey: ['query-fields'],
    queryFn: () => getQueryFieldsServerFn(),
  })
  const allFields = fieldsData?.fields ?? []

  // Update local state when filter changes
  useEffect(() => {
    setFieldId(filter.fieldId || '')
    setNegate(filter.negate ?? false)
  }, [filter])

  // Handle field change
  const handleFieldChange = (value: string | null) => {
    if (!value) return
    setFieldId(value)
    onUpdate({ fieldId: value })
  }

  // Handle negate toggle
  const handleNegateChange = (checked: boolean) => {
    setNegate(checked)
    onUpdate({ negate: checked })
  }

  // Handle save
  const handleSave = () => {
    if (fieldId) {
      onUpdate({
        fieldId,
        negate,
      })
    }
    onClose()
  }

  // Get selected field label
  const selectedFieldLabel = allFields.find((f) => f.systemId === fieldId)?.label

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
        <Select
          value={fieldId || undefined}
          onValueChange={handleFieldChange}
          disabled={fieldsLoading || fieldsError}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {selectedFieldLabel || (
                <span className="text-muted-foreground">
                  {fieldsLoading
                    ? 'Loading...'
                    : fieldsError
                      ? 'Failed to load fields'
                      : 'Select field'}
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {allFields.map((field) => (
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
          disabled={!fieldId}
        >
          <Check weight="bold" data-icon="inline-start" />
          Done
        </Button>
      </div>
    </div>
  )
}
