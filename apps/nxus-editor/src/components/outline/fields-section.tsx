import { useCallback, useEffect, useRef, useState } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { OutlineField } from '@/types/outline'
import { FieldValue } from './field-value'
import { FieldBullet } from './bullet'
import { setFieldValueServerFn } from '@/services/outline.server'
import { useOutlineStore } from '@/stores/outline.store'
import { useOutlineSync } from '@/hooks/use-outline-sync'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'

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
  const { removeField } = useOutlineSync()

  if (fields.length === 0) return null

  return (
    <div className="fields-section group/fields">
      {fields.map((field) => (
        <FieldRow
          key={field.fieldId}
          nodeId={nodeId}
          field={field}
          depth={depth}
          onRemove={() => removeField(nodeId, field.fieldId)}
        />
      ))}
      <AddFieldTrigger nodeId={nodeId} depth={depth} existingFieldIds={fields.map((f) => f.fieldSystemId ?? f.fieldId)} />
    </div>
  )
}

function FieldRow({
  nodeId,
  field,
  depth,
  onRemove,
}: {
  nodeId: string
  field: OutlineField
  depth: number
  onRemove: () => void
}) {
  const navigateToNode = useNavigateToNode()

  // For multi-reference fields, collect all values into an array
  const value =
    field.fieldType === 'nodes'
      ? field.values.flatMap((v) => (Array.isArray(v.value) ? v.value : [v.value])).filter(Boolean)
      : field.values.length > 0
        ? field.values[0]!.value
        : undefined

  const handleChange = useCallback(
    (newValue: unknown) => {
      // Optimistic update in store
      useOutlineStore.getState().updateFieldValue(nodeId, field.fieldId, newValue)
      // Persist to server
      setFieldValueServerFn({
        data: {
          nodeId,
          fieldId: field.fieldId,
          value: newValue,
        },
      }).catch((err) => {
        console.error('[fields] Failed to update field:', err)
      })
    },
    [nodeId, field.fieldId],
  )

  return (
    <div
      className={cn(
        'field-row group/field-row flex items-start py-1',
      )}
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Remove button — visible on hover */}
      <button
        type="button"
        className="hidden shrink-0 h-6 w-4 items-center justify-center text-foreground/25 hover:text-foreground/50 group-hover/field-row:inline-flex"
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        title={`Remove ${field.fieldName}`}
      >
        <X size={10} weight="bold" />
      </button>

      {/* Field icon — clickable to navigate to field definition node */}
      <span
        className="cursor-pointer hover:opacity-70 transition-opacity"
        onClick={(e) => {
          e.stopPropagation()
          navigateToNode(field.fieldNodeId)
        }}
        title={`Go to field: ${field.fieldName}`}
      >
        <FieldBullet fieldType={field.fieldType} />
      </span>

      {/* Field label — fixed width, pinned to first line, pl-1 matches node-content px-1 */}
      <span
        className={cn(
          'shrink-0 truncate text-[14.5px] leading-[1.6] font-medium text-foreground/35',
          'select-none h-6 flex items-center pl-1',
        )}
        style={{ width: `${FIELD_LABEL_WIDTH}px` }}
      >
        {field.fieldName}
      </span>

      {/* Field value — same plane as node content, flows naturally */}
      <div className="flex-1 min-w-0">
        <FieldValue
          fieldType={field.fieldType}
          fieldNodeId={field.fieldNodeId}
          value={value}
          onChange={handleChange}
        />
      </div>
    </div>
  )
}

interface AvailableField {
  fieldNodeId: string
  fieldName: string
  fieldType: string
  fieldSystemId: string
}

function AddFieldTrigger({
  nodeId,
  depth,
  existingFieldIds,
}: {
  nodeId: string
  depth: number
  existingFieldIds: string[]
}) {
  const [open, setOpen] = useState(false)
  const [options, setOptions] = useState<AvailableField[]>([])
  const [loaded, setLoaded] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const { addField } = useOutlineSync()

  const handleOpen = useCallback(() => {
    if (!loaded) {
      import('@/services/field.server').then(({ getAvailableFieldsServerFn }) => {
        getAvailableFieldsServerFn({ data: { nodeId } })
          .then((result) => {
            if (result.success) setOptions(result.fields)
            setLoaded(true)
          })
          .catch(() => setLoaded(true))
      })
    }
    setOpen(true)
  }, [nodeId, loaded])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const existingSet = new Set(existingFieldIds)
  const availableOptions = options.filter((o) => !existingSet.has(o.fieldSystemId))

  return (
    <div
      ref={containerRef}
      className="relative"
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
    >
      <button
        type="button"
        className={cn(
          'hidden items-center gap-1 rounded-sm px-1 py-0.5',
          'text-[12px] text-foreground/25 hover:text-foreground/40',
          'cursor-pointer transition-colors',
          'group-hover/fields:inline-flex',
        )}
        onClick={(e) => {
          e.stopPropagation()
          handleOpen()
        }}
        title="Add field"
      >
        <Plus size={10} weight="bold" />
        <span>Add field</span>
      </button>

      {open && (
        <div className="absolute left-0 bottom-full z-50 mb-1 max-h-48 min-w-[180px] overflow-y-auto rounded-lg border border-foreground/10 bg-popover p-1 shadow-lg"
          style={{ marginLeft: `${(depth + 1) * 24}px` }}
        >
          {availableOptions.length === 0 && (
            <span className="block px-2 py-1 text-xs text-foreground/40">
              {loaded ? 'No fields available' : 'Loading...'}
            </span>
          )}
          {availableOptions.map((opt) => (
            <div
              key={opt.fieldSystemId}
              className="cursor-pointer rounded-md px-2 py-1 text-xs hover:bg-accent hover:text-accent-foreground"
              onMouseDown={(e) => {
                e.preventDefault()
                addField(nodeId, {
                  fieldId: opt.fieldSystemId,
                  fieldName: opt.fieldName,
                  fieldNodeId: opt.fieldNodeId,
                  fieldSystemId: opt.fieldSystemId,
                  fieldType: opt.fieldType as OutlineField['fieldType'],
                  values: [],
                })
                setOpen(false)
              }}
            >
              {opt.fieldName}
              <span className="ml-1 text-foreground/25">{opt.fieldType}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
