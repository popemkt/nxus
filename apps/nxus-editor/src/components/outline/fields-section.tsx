import { useCallback } from 'react'
import { cn } from '@nxus/ui'
import type { OutlineField } from '@/types/outline'
import { FieldValue } from './field-value'
import { setFieldValueServerFn } from '@/services/outline.server'

interface FieldsSectionProps {
  nodeId: string
  fields: OutlineField[]
  depth: number
}

/**
 * Renders the field/property rows for a node, displayed between
 * the node content and its children. Each field shows a label
 * and a type-specific value editor.
 */
export function FieldsSection({ nodeId, fields, depth }: FieldsSectionProps) {
  if (fields.length === 0) return null

  return (
    <div
      className="fields-section"
      style={{ paddingLeft: `${depth * 24 + 24}px` }}
    >
      {fields.map((field) => (
        <FieldRow
          key={field.fieldSystemId ?? field.fieldName}
          nodeId={nodeId}
          field={field}
        />
      ))}
    </div>
  )
}

function FieldRow({
  nodeId,
  field,
}: {
  nodeId: string
  field: OutlineField
}) {
  const value = field.values.length > 0 ? field.values[0]!.value : undefined

  const handleChange = useCallback(
    (newValue: unknown) => {
      if (!field.fieldSystemId) return
      setFieldValueServerFn({
        data: {
          nodeId,
          fieldSystemId: field.fieldSystemId,
          value: newValue,
        },
      }).catch((err) => {
        console.error('[fields] Failed to update field:', err)
      })
    },
    [nodeId, field.fieldSystemId],
  )

  return (
    <div
      className={cn(
        'field-row flex items-center gap-2 py-0.5',
        'min-h-[26px]',
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Field indicator */}
      <span className="text-[11px] text-foreground/20 select-none">›</span>

      {/* Field label */}
      <span
        className={cn(
          'shrink-0 text-[12px] font-medium text-foreground/35',
          'min-w-[60px] select-none',
        )}
      >
        {field.fieldName}
      </span>

      {/* Field value */}
      <div className="flex-1">
        <FieldValue
          fieldType={field.fieldType}
          value={value}
          onChange={handleChange}
        />
      </div>
    </div>
  )
}
