/**
 * FilterList - Renders the list of active filter chips
 *
 * Displays each filter as an interactive chip that can be edited or removed.
 */

import type { QueryFilter } from '@nxus/db'
import { FilterChip } from './filter-chip'

// ============================================================================
// Types
// ============================================================================

export interface FilterListProps {
  /** List of active filters */
  filters: QueryFilter[]
  /** Called when a filter is updated */
  onUpdateFilter: (filterId: string, updates: Record<string, unknown>) => void
  /** Called when a filter is removed */
  onRemoveFilter: (filterId: string) => void
  /** Compact mode for inline use */
  compact?: boolean
}

// ============================================================================
// Component
// ============================================================================

export function FilterList({
  filters,
  onUpdateFilter,
  onRemoveFilter,
  compact = false,
}: FilterListProps) {
  if (filters.length === 0) {
    return null
  }

  return (
    <>
      {filters.map((filter, index) => (
        <FilterChip
          key={filter.id || index}
          filter={filter}
          onUpdate={(updates) => {
            if (filter.id) {
              onUpdateFilter(filter.id, updates)
            }
          }}
          onRemove={() => {
            if (filter.id) {
              onRemoveFilter(filter.id)
            }
          }}
          compact={compact}
        />
      ))}
    </>
  )
}
