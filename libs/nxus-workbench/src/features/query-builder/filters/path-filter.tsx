/**
 * PathFilterEditor - Editor for path (reference-chain) filters
 *
 * A `path` filter follows a chain of reference fields and compares the
 * terminal field's value (e.g. `Hat.Color = "Red"`, query.ts:71-126). Every
 * non-terminal segment must be a reference-bearing field (`instance`/`node`/
 * `nodes`); the terminal segment is any field, compared with `op`/`value`
 * (value ops) or checked for emptiness (unary ops, no value).
 */

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, Path as PathIcon, Plus, X } from '@phosphor-icons/react'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@nxus/ui'
import type { JsonValue, PathFilter, PathSegment } from '@nxus/db'
import { getQueryFieldsServerFn } from '../../../server/query.server.js'

// ============================================================================
// Types
// ============================================================================

type PathOp = PathFilter['op']

/** Loosely-typed update shape: `Partial<PathFilter>` can't express "value only
 * applies to some operators" because PathFilter is a two-member union keyed
 * on op, not on a stable discriminant field. Modeled as `Partial<{...}>`
 * (a homomorphic mapped type, like the other editors' `Partial<XFilter>`
 * props) rather than a hand-written interface so it stays structurally
 * assignable from FilterChip's generic `Record<string, unknown>` callback. */
export type PathFilterUpdate = Partial<{
  path: PathSegment[]
  op: PathOp
  value: JsonValue
}>

export interface PathFilterEditorProps {
  /** The path filter being edited */
  filter: PathFilter
  /** Called when filter is updated */
  onUpdate: (updates: PathFilterUpdate) => void
  /** Called when editor should close */
  onClose: () => void
}

// ============================================================================
// Constants
// ============================================================================

const VALUE_OPERATORS: Array<{ value: PathOp; label: string }> = [
  { value: 'eq', label: 'equals' },
  { value: 'neq', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'startsWith', label: 'starts with' },
  { value: 'endsWith', label: 'ends with' },
  { value: 'gt', label: 'greater than' },
  { value: 'gte', label: 'greater or equal' },
  { value: 'lt', label: 'less than' },
  { value: 'lte', label: 'less or equal' },
]

const UNARY_OPERATORS: Array<{ value: PathOp; label: string }> = [
  { value: 'isEmpty', label: 'is empty' },
  { value: 'isNotEmpty', label: 'is not empty' },
]

const ALL_OPERATORS = [...VALUE_OPERATORS, ...UNARY_OPERATORS]

/** Field types that carry a node reference — the only valid non-terminal hops. */
const REFERENCE_FIELD_TYPES = new Set(['instance', 'node', 'nodes'])

function isUnaryOp(op: PathOp): boolean {
  return op === 'isEmpty' || op === 'isNotEmpty'
}

// ============================================================================
// Component
// ============================================================================

export function PathFilterEditor({ filter, onUpdate, onClose }: PathFilterEditorProps) {
  const [segments, setSegments] = useState<PathSegment[]>(
    filter.path.length > 0 ? filter.path : [{ fieldId: '' }],
  )
  const [op, setOp] = useState<PathOp>(filter.op)
  const [value, setValue] = useState(
    'value' in filter && filter.value !== undefined ? String(filter.value) : '',
  )

  // Fetch all available fields (with fieldType so reference hops can be filtered)
  const {
    data: fieldsData,
    isLoading: fieldsLoading,
    isError: fieldsError,
  } = useQuery({
    queryKey: ['query-fields'],
    queryFn: () => getQueryFieldsServerFn(),
  })
  const allFields = fieldsData?.fields ?? []
  const referenceFields = allFields.filter(
    (field) => field.fieldType && REFERENCE_FIELD_TYPES.has(field.fieldType),
  )

  // Update local state when filter changes (e.g. reopening a different chip)
  useEffect(() => {
    setSegments(filter.path.length > 0 ? filter.path : [{ fieldId: '' }])
    setOp(filter.op)
    setValue('value' in filter && filter.value !== undefined ? String(filter.value) : '')
  }, [filter])

  const isUnary = isUnaryOp(op)
  const isComplete =
    segments.every((segment) => !!segment.fieldId) && (isUnary || value.trim() !== '')

  const handleSegmentChange = (index: number, fieldId: string | null) => {
    if (!fieldId) return
    setSegments((prev) => prev.map((segment, i) => (i === index ? { fieldId } : segment)))
  }

  const handleAddHop = () => {
    setSegments((prev) => [...prev, { fieldId: '' }])
  }

  const handleRemoveHop = (index: number) => {
    setSegments((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev))
  }

  const handleOpChange = (newOpValue: string | null) => {
    if (!newOpValue) return
    setOp(newOpValue as PathOp)
  }

  const handleSave = () => {
    if (!isComplete) return
    // Explicit `value: undefined` (not omitted) when switching to a unary op:
    // the parent merges updates with `{ ...oldFilter, ...updates }` object
    // spread, which can't delete a key — omitting `value` here would leave a
    // *stale* value from a previous value-op edit sitting on the merged
    // object. `isPathUnaryOp` (filter-format.ts) treats an explicit
    // `undefined` the same as an absent key, so this clears it cleanly.
    onUpdate({
      path: segments,
      op,
      value: isUnary ? undefined : value,
    })
    onClose()
  }

  return (
    <div className="flex flex-col gap-3 min-w-72">
      {/* Title */}
      <div className="text-xs font-medium text-foreground flex items-center gap-1.5">
        <PathIcon className="size-3.5" weight="bold" />
        Path Filter
      </div>

      {/* Reference chain builder */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">
          Reference chain (last field is compared)
        </Label>

        <div className="flex flex-col gap-1.5">
          {segments.map((segment, index) => {
            const isTerminal = index === segments.length - 1
            const options = isTerminal ? allFields : referenceFields
            const selectedLabel = allFields.find((f) => f.systemId === segment.fieldId)?.label

            return (
              <div key={index} className="flex items-center gap-1.5">
                <span className="w-4 shrink-0 text-center text-[10px] text-muted-foreground">
                  {index === 0 ? '' : '→'}
                </span>
                <Select
                  value={segment.fieldId || undefined}
                  onValueChange={(v) => handleSegmentChange(index, v)}
                  disabled={fieldsLoading || fieldsError}
                >
                  <SelectTrigger className="w-full" data-testid={`path-filter-hop-${index}`}>
                    <SelectValue>
                      {selectedLabel || (
                        <span className="text-muted-foreground">
                          {fieldsLoading
                            ? 'Loading...'
                            : fieldsError
                              ? 'Failed to load fields'
                              : isTerminal
                                ? 'Select field'
                                : 'Select reference field'}
                        </span>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((field) => (
                      <SelectItem key={field.systemId} value={field.systemId}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {segments.length > 1 && (
                  <button
                    className={cn(
                      'flex shrink-0 items-center justify-center bg-transparent border-none cursor-pointer',
                      'opacity-50 hover:opacity-100 transition-opacity',
                    )}
                    onClick={() => handleRemoveHop(index)}
                    title="Remove hop"
                    aria-label="Remove hop"
                  >
                    <X className="size-3" weight="bold" />
                  </button>
                )}
              </div>
            )
          })}
        </div>

        <Button
          variant="outline"
          size="xs"
          className="self-start gap-1 border-dashed"
          onClick={handleAddHop}
          disabled={referenceFields.length === 0}
        >
          <Plus className="size-3" weight="bold" />
          Add hop
        </Button>
      </div>

      {/* Operator selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Condition</Label>
        <Select value={op} onValueChange={handleOpChange}>
          <SelectTrigger className="w-full" data-testid="path-filter-op-select">
            <SelectValue>{ALL_OPERATORS.find((o) => o.value === op)?.label}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {VALUE_OPERATORS.map((operator) => (
              <SelectItem key={operator.value} value={operator.value}>
                {operator.label}
              </SelectItem>
            ))}
            {UNARY_OPERATORS.map((operator) => (
              <SelectItem key={operator.value} value={operator.value}>
                {operator.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Value input (only for value operators) */}
      {!isUnary && (
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs text-muted-foreground">Value</Label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Enter value..."
            className="w-full"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && isComplete) {
                handleSave()
              }
            }}
          />
        </div>
      )}

      {/* Help text */}
      <p className="text-[10px] text-muted-foreground/70">
        {segments.length > 1
          ? `Follows ${segments.length - 1} reference ${segments.length - 1 === 1 ? 'hop' : 'hops'}, then compares the terminal field.`
          : 'Compares the selected field directly — add a hop to follow a reference first.'}
      </p>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="default" size="sm" onClick={handleSave} disabled={!isComplete}>
          <Check weight="bold" data-icon="inline-start" />
          Done
        </Button>
      </div>
    </div>
  )
}
