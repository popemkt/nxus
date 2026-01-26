/**
 * LogicalFilterEditor - Editor for logical/composite filters
 *
 * Allows combining multiple filters with AND/OR/NOT logic.
 * Supports nested filter groups for complex queries.
 */

import { useState, useEffect } from 'react'
import {
  Check,
  Trash,
  Hash,
  TextT,
  MagnifyingGlass,
  Calendar,
  LinkSimple,
  CheckSquare,
} from '@phosphor-icons/react'
import {
  Button,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@nxus/ui'
import type { LogicalFilter, QueryFilter } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export interface LogicalFilterEditorProps {
  /** The logical filter being edited */
  filter: LogicalFilter
  /** Called when filter is updated */
  onUpdate: (updates: Partial<LogicalFilter>) => void
  /** Called when editor should close */
  onClose: () => void
}

type LogicalOperator = 'and' | 'or' | 'not'
type SimpleFilterType = 'supertag' | 'property' | 'content' | 'relation' | 'temporal' | 'hasField'

// ============================================================================
// Constants
// ============================================================================

/**
 * Logical operator options
 */
const LOGICAL_OPERATORS = [
  {
    value: 'and' as const,
    label: 'AND',
    description: 'All conditions must match',
  },
  {
    value: 'or' as const,
    label: 'OR',
    description: 'Any condition can match',
  },
  {
    value: 'not' as const,
    label: 'NOT',
    description: 'Invert the result (exclude matches)',
  },
] as const

/**
 * Available filter types for nested filters
 */
const FILTER_TYPES: Array<{
  type: SimpleFilterType
  label: string
  icon: typeof Hash
  color: string
}> = [
  { type: 'supertag', label: 'Supertag', icon: Hash, color: '#8b5cf6' },
  { type: 'property', label: 'Property', icon: TextT, color: '#3b82f6' },
  { type: 'content', label: 'Content', icon: MagnifyingGlass, color: '#22c55e' },
  { type: 'temporal', label: 'Date', icon: Calendar, color: '#f59e0b' },
  { type: 'relation', label: 'Relation', icon: LinkSimple, color: '#ec4899' },
  { type: 'hasField', label: 'Has Field', icon: CheckSquare, color: '#06b6d4' },
]

// ============================================================================
// Component
// ============================================================================

export function LogicalFilterEditor({
  filter,
  onUpdate,
  onClose,
}: LogicalFilterEditorProps) {
  const [logicalType, setLogicalType] = useState<LogicalOperator>(filter.type || 'and')
  const [nestedFilters, setNestedFilters] = useState<QueryFilter[]>(filter.filters || [])

  // Update local state when filter changes
  useEffect(() => {
    setLogicalType(filter.type || 'and')
    setNestedFilters(filter.filters || [])
  }, [filter])

  // Get selected operator config
  const selectedOperator = LOGICAL_OPERATORS.find((o) => o.value === logicalType)

  // Handle operator change
  const handleOperatorChange = (value: string | null) => {
    if (!value) return
    const newType = value as LogicalOperator
    setLogicalType(newType)
    onUpdate({ type: newType })
  }

  // Handle adding a nested filter
  const handleAddNestedFilter = (filterType: SimpleFilterType) => {
    const newFilter = createDefaultNestedFilter(filterType)
    const updatedFilters = [...nestedFilters, newFilter]
    setNestedFilters(updatedFilters)
    onUpdate({ filters: updatedFilters })
  }

  // Handle removing a nested filter
  const handleRemoveNestedFilter = (index: number) => {
    const updatedFilters = nestedFilters.filter((_, i) => i !== index)
    setNestedFilters(updatedFilters)
    onUpdate({ filters: updatedFilters })
  }

  // Handle save
  const handleSave = () => {
    onUpdate({
      type: logicalType,
      filters: nestedFilters,
    })
    onClose()
  }

  // Check if form has at least one nested filter
  const hasNestedFilters = nestedFilters.length > 0

  return (
    <div className="flex flex-col gap-3 min-w-72">
      {/* Title */}
      <div className="text-xs font-medium text-foreground">
        Logical Filter Group
      </div>

      {/* Operator selector */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Combine with</Label>
        <Select value={logicalType} onValueChange={handleOperatorChange}>
          <SelectTrigger className="w-full">
            <SelectValue>
              {selectedOperator?.label || 'Select operator'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {LOGICAL_OPERATORS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{option.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {option.description}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Nested filters list */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">
          Nested filters ({nestedFilters.length})
        </Label>

        {nestedFilters.length > 0 ? (
          <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
            {nestedFilters.map((nestedFilter, index) => (
              <NestedFilterItem
                key={nestedFilter.id || index}
                filter={nestedFilter}
                onRemove={() => handleRemoveNestedFilter(index)}
              />
            ))}
          </div>
        ) : (
          <p className="text-[10px] text-muted-foreground/70 py-2">
            No nested filters yet. Add filters below.
          </p>
        )}
      </div>

      {/* Add nested filter buttons */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">Add filter</Label>
        <div className="flex flex-wrap gap-1">
          {FILTER_TYPES.map((filterOption) => (
            <Button
              key={filterOption.type}
              variant="outline"
              size="xs"
              onClick={() => handleAddNestedFilter(filterOption.type)}
              className="text-[10px] h-6 px-2 gap-1"
            >
              <filterOption.icon
                className="size-3"
                weight="bold"
                style={{ color: filterOption.color }}
              />
              {filterOption.label}
            </Button>
          ))}
        </div>
      </div>

      {/* Help text */}
      <p className="text-[10px] text-muted-foreground/70 border-t border-border pt-2">
        {logicalType === 'and' && 'Nodes must match ALL nested filters.'}
        {logicalType === 'or' && 'Nodes must match ANY of the nested filters.'}
        {logicalType === 'not' && 'Nodes must NOT match the nested filters (inversion).'}
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
          disabled={!hasNestedFilters}
        >
          <Check weight="bold" data-icon="inline-start" />
          Done
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// Nested Filter Item
// ============================================================================

interface NestedFilterItemProps {
  filter: QueryFilter
  onRemove: () => void
}

function NestedFilterItem({ filter, onRemove }: NestedFilterItemProps) {
  const { icon: Icon, label, color } = getFilterDisplayInfo(filter)

  return (
    <div
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-md border',
        'bg-muted/30 border-border',
        'text-[10px]',
      )}
    >
      <Icon
        className="size-3 shrink-0"
        weight="bold"
        style={{ color }}
      />
      <span className="truncate flex-1">{label}</span>
      <button
        className="flex items-center justify-center shrink-0 bg-transparent border-none cursor-pointer opacity-50 hover:opacity-100 transition-opacity"
        onClick={onRemove}
        title="Remove filter"
      >
        <Trash className="size-3" weight="bold" />
      </button>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a default nested filter
 */
function createDefaultNestedFilter(filterType: SimpleFilterType): QueryFilter {
  const id = crypto.randomUUID().slice(0, 8)

  switch (filterType) {
    case 'supertag':
      return {
        id,
        type: 'supertag',
        supertagSystemId: '',
        includeInherited: true,
      }
    case 'property':
      return {
        id,
        type: 'property',
        fieldSystemId: '',
        op: 'eq',
        value: '',
      }
    case 'content':
      return {
        id,
        type: 'content',
        query: '',
        caseSensitive: false,
      }
    case 'relation':
      return {
        id,
        type: 'relation',
        relationType: 'childOf',
        targetNodeId: undefined,
      }
    case 'temporal':
      return {
        id,
        type: 'temporal',
        field: 'createdAt',
        op: 'within',
        days: 7,
      }
    case 'hasField':
      return {
        id,
        type: 'hasField',
        fieldSystemId: '',
        negate: false,
      }
    default:
      throw new Error(`Unknown filter type: ${filterType}`)
  }
}

/**
 * Get display info for a filter
 */
function getFilterDisplayInfo(filter: QueryFilter): {
  icon: typeof Hash
  label: string
  color: string
} {
  switch (filter.type) {
    case 'supertag':
      return {
        icon: Hash,
        label: filter.supertagSystemId
          ? `#${formatSystemId(filter.supertagSystemId)}`
          : 'Supertag...',
        color: '#8b5cf6',
      }
    case 'property':
      return {
        icon: TextT,
        label: filter.fieldSystemId
          ? formatSystemId(filter.fieldSystemId)
          : 'Property...',
        color: '#3b82f6',
      }
    case 'content':
      return {
        icon: MagnifyingGlass,
        label: filter.query ? `"${filter.query}"` : 'Search...',
        color: '#22c55e',
      }
    case 'temporal':
      return {
        icon: Calendar,
        label: filter.op === 'within'
          ? `${filter.field} within ${filter.days}d`
          : `${filter.field} ${filter.op} ${filter.date || '...'}`,
        color: '#f59e0b',
      }
    case 'relation':
      return {
        icon: LinkSimple,
        label: filter.relationType || 'Relation...',
        color: '#ec4899',
      }
    case 'hasField':
      return {
        icon: CheckSquare,
        label: filter.fieldSystemId
          ? `${filter.negate ? '!' : ''}${formatSystemId(filter.fieldSystemId)}`
          : 'Has field...',
        color: '#06b6d4',
      }
    default:
      return {
        icon: TextT,
        label: 'Unknown',
        color: '#6b7280',
      }
  }
}

/**
 * Format a system ID for display
 */
function formatSystemId(systemId: string): string {
  const parts = systemId.split(':')
  const name = parts[parts.length - 1] ?? ''
  if (!name) return systemId
  return name.charAt(0).toUpperCase() + name.slice(1)
}
