import { useCallback } from 'react'
import { cn } from '@nxus/ui'
import type { OutlineField } from '@/types/outline'
import { FieldValue } from './field-value'
import { FieldBullet } from './bullet'
import { setFieldValueServerFn } from '@/services/outline.server'
import { useOutlineStore } from '@/stores/outline.store'

/** Fixed label width so all field values start at the same horizontal position */
const FIELD_LABEL_WIDTH = 120

interface FieldsSectionProps {
  nodeId: string
  fields: OutlineField[]
  depth: number
}

/**
 * Renders the field/property rows for a node, displayed between
 * the node content and its children.
 *
 * Layout: fields sit at (depth+1) indent — the same level as children —
 * with a field icon in the bullet column, a fixed-width label, and
 * the value area aligned across all fields.
 */
export function FieldsSection({ nodeId, fields, depth }: FieldsSectionProps) {
  if (fields.length === 0) return null

  return (
    <div className="fields-section">
      {fields.map((field) => (
        <FieldRow
          key={field.fieldSystemId ?? field.fieldName}
          nodeId={nodeId}
          field={field}
          depth={depth}
        />
      ))}
    </div>
  )
}

function FieldRow({
  nodeId,
  field,
  depth,
}: {
  nodeId: string
  field: OutlineField
  depth: number
}) {
  const value = field.values.length > 0 ? field.values[0]!.value : undefined

  const handleChange = useCallback(
    (newValue: unknown) => {
      if (!field.fieldSystemId) return
      // Optimistic update in store
      useOutlineStore.getState().updateFieldValue(nodeId, field.fieldSystemId, newValue)
      // Persist to server
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
        'field-row flex items-start',
        'min-h-[28px]',
      )}
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Field icon — pinned to first line via matching height */}
      <FieldBullet />

      {/* Field label — fixed width, pinned to first line */}
      <span
        className={cn(
          'shrink-0 truncate text-[14.5px] leading-[1.6] font-medium text-foreground/35',
          'select-none h-6 flex items-center',
        )}
        style={{ width: `${FIELD_LABEL_WIDTH}px` }}
      >
        {field.fieldName}
      </span>

      {/* Field value — aligned across all fields */}
      <div className="flex-1 min-w-0">
        <FieldValue
          fieldType={field.fieldType}
          value={value}
          onChange={handleChange}
          depth={depth}
        />
      </div>
    </div>
  )
}
