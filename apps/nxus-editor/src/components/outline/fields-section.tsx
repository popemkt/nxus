import { useCallback, useEffect, useRef, useState } from 'react'
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
  pendingFieldActive?: boolean
  onPendingFieldDismiss?: () => void
}

/**
 * Renders the field/property rows for a node, displayed between
 * the node content and its children.
 *
 * Layout: fields sit at (depth+1) indent — the same level as children —
 * with a field icon in the bullet column, a fixed-width label, and
 * the value area aligned across all fields.
 */
export function FieldsSection({ nodeId, fields, depth, pendingFieldActive, onPendingFieldDismiss }: FieldsSectionProps) {
  const { removeField, addField } = useOutlineSync()

  return (
    <div className="fields-section">
      {fields.map((field) => (
        <FieldRow
          key={field.fieldId}
          nodeId={nodeId}
          field={field}
          depth={depth}
          onRemove={() => removeField(nodeId, field.fieldId)}
        />
      ))}
      {pendingFieldActive && (
        <PendingFieldRow
          nodeId={nodeId}
          depth={depth}
          existingFieldIds={fields.map((f) => f.fieldSystemId ?? f.fieldId)}
          onCommit={(field) => {
            addField(nodeId, field)
            onPendingFieldDismiss?.()
          }}
          onDismiss={() => onPendingFieldDismiss?.()}
        />
      )}
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

  const handleLabelKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      // Backspace at position 0 → delete this field row
      if (e.key === 'Backspace') {
        const sel = window.getSelection()
        if (sel && sel.focusOffset === 0) {
          e.preventDefault()
          onRemove()
          return
        }
      }
      // Prevent Enter from inserting a line break
      if (e.key === 'Enter') {
        e.preventDefault()
      }
      // Don't let keyboard events bubble to node-level handlers
      e.stopPropagation()
    },
    [onRemove],
  )

  return (
    <div
      className={cn(
        'field-row flex items-start py-1',
      )}
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
      onClick={(e) => e.stopPropagation()}
    >
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

      {/* Field label — editable, Backspace at pos 0 deletes the field */}
      <span
        contentEditable
        suppressContentEditableWarning
        className={cn(
          'shrink-0 truncate text-[14.5px] leading-[1.6] font-medium text-foreground/35',
          'h-6 flex items-center pl-1 outline-none cursor-text',
        )}
        style={{ width: `${FIELD_LABEL_WIDTH}px` }}
        onKeyDown={handleLabelKeyDown}
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

/* ─── Pending field row — inline field creation triggered by `>` ─── */

interface AvailableField {
  fieldNodeId: string
  fieldName: string
  fieldType: string
  fieldSystemId: string
}

function PendingFieldRow({
  nodeId,
  depth,
  existingFieldIds,
  onCommit,
  onDismiss,
}: {
  nodeId: string
  depth: number
  existingFieldIds: string[]
  onCommit: (field: OutlineField) => void
  onDismiss: () => void
}) {
  const labelRef = useRef<HTMLSpanElement>(null)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<AvailableField[]>([])
  const [loaded, setLoaded] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)

  // Auto-focus the label input on mount
  useEffect(() => {
    if (labelRef.current) {
      labelRef.current.focus()
    }
  }, [])

  // Fetch available fields
  useEffect(() => {
    import('@/services/field.server').then(({ getAvailableFieldsServerFn }) => {
      getAvailableFieldsServerFn({ data: { nodeId } })
        .then((result) => {
          if (result.success) setOptions(result.fields)
          setLoaded(true)
        })
        .catch(() => setLoaded(true))
    })
  }, [nodeId])

  const existingSet = new Set(existingFieldIds)
  const filtered = options
    .filter((o) => !existingSet.has(o.fieldSystemId))
    .filter((o) => !query || o.fieldName.toLowerCase().includes(query.toLowerCase()))

  // Reset highlight when query changes
  useEffect(() => {
    setHighlightIndex(0)
  }, [query])

  const commitField = useCallback(
    (opt: AvailableField) => {
      onCommit({
        fieldId: opt.fieldSystemId,
        fieldName: opt.fieldName,
        fieldNodeId: opt.fieldNodeId,
        fieldSystemId: opt.fieldSystemId,
        fieldType: opt.fieldType as OutlineField['fieldType'],
        values: [],
      })
    },
    [onCommit],
  )

  const handleInput = useCallback(() => {
    const text = labelRef.current?.textContent ?? ''
    setQuery(text)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLSpanElement>) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        const selected = filtered[highlightIndex]
        if (selected) {
          commitField(selected)
        }
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        onDismiss()
        return
      }
      if (e.key === 'Backspace') {
        const sel = window.getSelection()
        if (sel && sel.focusOffset === 0 && !query) {
          e.preventDefault()
          onDismiss()
          return
        }
      }
      e.stopPropagation()
    },
    [filtered, highlightIndex, commitField, onDismiss, query],
  )

  return (
    <div
      className={cn('field-row flex items-start py-1 relative')}
      style={{ paddingLeft: `${(depth + 1) * 24}px` }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Placeholder for field icon */}
      <span className="h-6 w-6 shrink-0" />

      {/* Editable label — acts as autocomplete input */}
      <span
        ref={labelRef}
        contentEditable
        suppressContentEditableWarning
        className={cn(
          'shrink-0 text-[14.5px] leading-[1.6] font-medium',
          'h-6 flex items-center pl-1 outline-none cursor-text',
          query ? 'text-foreground/50' : 'text-foreground/25 italic',
        )}
        style={{ width: `${FIELD_LABEL_WIDTH}px` }}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          // Delay to allow mousedown on dropdown to fire first
          setTimeout(() => onDismiss(), 150)
        }}
        data-placeholder="Field name…"
      />

      {/* Autocomplete dropdown */}
      {loaded && (
        <div className="absolute left-0 top-full z-50 mt-0.5 max-h-48 min-w-[200px] overflow-y-auto rounded-lg border border-foreground/10 bg-popover p-1 shadow-lg"
          style={{ marginLeft: `${(depth + 1) * 24 + 24}px` }}
        >
          {filtered.length === 0 && (
            <span className="block px-2 py-1 text-xs text-foreground/40">
              {query ? 'No matching fields' : 'No fields available'}
            </span>
          )}
          {filtered.map((opt, i) => (
            <div
              key={opt.fieldSystemId}
              className={cn(
                'cursor-pointer rounded-md px-2 py-1 text-xs',
                i === highlightIndex && 'bg-accent text-accent-foreground',
              )}
              onMouseEnter={() => setHighlightIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                commitField(opt)
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
