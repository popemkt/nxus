/**
 * LogicalFilterEditor - Editor for logical/composite filters
 *
 * Allows combining multiple filters with AND/OR/NOT logic. Nested filters are
 * rendered with the same `FilterList`/`AddFilterMenu`/`FilterChip` components
 * the top-level QueryBuilder uses (`../filter-list.js`, `../add-filter-menu.js`)
 * rather than a parallel implementation — since `FilterChip` already dispatches
 * `and`/`or`/`not` filters back into this same editor (`../filter-chip.tsx`),
 * this reuse is what makes groups nest to arbitrary depth for free.
 */

import { useState, useEffect } from 'react'
import { Check } from '@phosphor-icons/react'
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
import { FilterList } from '../filter-list.js'
import { AddFilterMenu } from '../add-filter-menu.js'
import { createDefaultFilter, type FilterType } from '../filter-defaults.js'

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

  // Handle adding a nested filter — any filter type, including and/or/not, so
  // groups can nest to arbitrary depth (createDefaultFilter is the same
  // factory the top-level QueryBuilder uses, ../filter-defaults.js).
  const handleAddNestedFilter = (filterType: FilterType) => {
    const newFilter = createDefaultFilter(filterType)
    const updatedFilters = [...nestedFilters, newFilter]
    setNestedFilters(updatedFilters)
    onUpdate({ filters: updatedFilters })
  }

  // Handle updating a nested filter in place (edited via its own FilterChip popover)
  const handleUpdateNestedFilter = (filterId: string, updates: Record<string, unknown>) => {
    const updatedFilters = nestedFilters.map((f) =>
      f.id === filterId ? { ...f, ...updates } : f,
    )
    setNestedFilters(updatedFilters)
    onUpdate({ filters: updatedFilters })
  }

  // Handle removing a nested filter
  const handleRemoveNestedFilter = (filterId: string) => {
    const updatedFilters = nestedFilters.filter((f) => f.id !== filterId)
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

      {/* Nested filters — indented + left-bordered to read as a group inside
          the parent editor, however deep the recursion goes. */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs text-muted-foreground">
          Nested filters ({nestedFilters.length})
        </Label>

        <div
          className={cn(
            'flex flex-wrap items-center gap-1.5 rounded-sm border-l-2 py-1 pl-2.5',
            hasNestedFilters ? 'border-border' : 'border-dashed border-muted-foreground/30',
          )}
        >
          {hasNestedFilters ? (
            <FilterList
              filters={nestedFilters}
              onUpdateFilter={handleUpdateNestedFilter}
              onRemoveFilter={handleRemoveNestedFilter}
              compact
            />
          ) : (
            <p className="text-[10px] text-muted-foreground/70">
              No nested filters yet.
            </p>
          )}

          {/* Add nested filter — same menu as the top level, including
              AND/OR/NOT groups and path filters, so nesting has no depth cap.
              Distinct aria-label from the top-level trigger so screen readers
              (and tests) can tell them apart when both are on screen. */}
          <AddFilterMenu
            onAddFilter={handleAddNestedFilter}
            compact
            ariaLabel="Add nested filter"
          />
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
