/**
 * SortConfig - Sort configuration UI for query builder
 *
 * Allows configuring the sort field and direction for query results.
 */

import { ArrowUp, ArrowDown, X } from '@phosphor-icons/react'
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@nxus/ui'
import type { QuerySort } from '@nxus/db'
import { SYSTEM_FIELDS } from '@nxus/db'

// ============================================================================
// Types
// ============================================================================

export interface SortConfigProps {
  /** Current sort configuration */
  value?: QuerySort
  /** Called when sort configuration changes */
  onChange: (sort: QuerySort | undefined) => void
  /** Compact mode */
  compact?: boolean
  /** Additional class names */
  className?: string
}

// ============================================================================
// Constants
// ============================================================================

/**
 * Available sort fields
 */
const SORT_FIELDS = [
  { value: 'content', label: 'Name' },
  { value: 'createdAt', label: 'Created' },
  { value: 'updatedAt', label: 'Updated' },
  { value: SYSTEM_FIELDS.TYPE, label: 'Type' },
  { value: SYSTEM_FIELDS.STATUS, label: 'Status' },
  { value: SYSTEM_FIELDS.CATEGORY, label: 'Category' },
  { value: SYSTEM_FIELDS.TITLE, label: 'Title' },
] as const

// ============================================================================
// Component
// ============================================================================

export function SortConfig({
  value,
  onChange,
  compact = false,
  className,
}: SortConfigProps) {
  const hasSort = !!value

  // Handle field change
  const handleFieldChange = (field: string | null) => {
    if (!field) return
    onChange({
      field,
      direction: value?.direction || 'asc',
    })
  }

  // Handle direction toggle
  const handleDirectionToggle = () => {
    if (!value) return
    onChange({
      ...value,
      direction: value.direction === 'asc' ? 'desc' : 'asc',
    })
  }

  // Handle clear sort
  const handleClear = () => {
    onChange(undefined)
  }

  // Get selected field label
  const selectedFieldLabel = SORT_FIELDS.find((f) => f.value === value?.field)?.label

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {/* Sort field selector */}
      <Select
        value={value?.field || undefined}
        onValueChange={handleFieldChange}
      >
        <SelectTrigger
          className={cn(
            'border-dashed',
            hasSort && 'border-solid border-primary/30 bg-primary/5',
            compact ? 'h-6 text-[10px] min-w-20' : 'h-7 text-xs min-w-24',
          )}
        >
          <SelectValue>
            {hasSort ? (
              <span>Sort: {selectedFieldLabel}</span>
            ) : (
              <span className="text-muted-foreground">Sort by...</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {SORT_FIELDS.map((field) => (
            <SelectItem key={field.value} value={field.value}>
              {field.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Direction toggle */}
      {hasSort && (
        <Button
          variant="outline"
          size={compact ? 'icon-xs' : 'icon-sm'}
          onClick={handleDirectionToggle}
          title={value.direction === 'asc' ? 'Ascending (click to change)' : 'Descending (click to change)'}
          className={cn(
            'border-primary/30 bg-primary/5',
            compact ? 'size-6' : 'size-7',
          )}
        >
          {value.direction === 'asc' ? (
            <ArrowUp className={compact ? 'size-3' : 'size-3.5'} weight="bold" />
          ) : (
            <ArrowDown className={compact ? 'size-3' : 'size-3.5'} weight="bold" />
          )}
        </Button>
      )}

      {/* Clear button */}
      {hasSort && (
        <Button
          variant="ghost"
          size={compact ? 'icon-xs' : 'icon-sm'}
          onClick={handleClear}
          title="Clear sort"
          className={cn(
            'opacity-50 hover:opacity-100',
            compact ? 'size-6' : 'size-7',
          )}
        >
          <X className={compact ? 'size-2.5' : 'size-3'} weight="bold" />
        </Button>
      )}
    </div>
  )
}
