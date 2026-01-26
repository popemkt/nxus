/**
 * QueryBuilder - Main query builder component
 *
 * Visual interface for constructing Tana-like queries.
 * Displays active filters as chips with add/edit/remove controls.
 */

import { Play, X, FloppyDisk } from '@phosphor-icons/react'
import { Button, cn } from '@nxus/ui'
import type { QueryDefinition, QuerySort } from '@nxus/db'
import { FilterList } from './filter-list'
import { AddFilterMenu } from './add-filter-menu'
import { SortConfig } from './sort-config'
import { QueryLinter } from './query-linter'

// ============================================================================
// Types
// ============================================================================

export interface QueryBuilderProps {
  /** Current query definition */
  value: QueryDefinition
  /** Called when query changes */
  onChange: (query: QueryDefinition) => void
  /** Called when user wants to execute the query */
  onExecute?: () => void
  /** Called when user wants to save the query */
  onSave?: () => void
  /** Called when user wants to close/cancel */
  onClose?: () => void
  /** Compact mode for inline use */
  compact?: boolean
  /** Show execute button */
  showExecute?: boolean
  /** Show save button */
  showSave?: boolean
  /** Additional class names */
  className?: string
  /** Result count to display */
  resultCount?: number
  /** Loading state */
  isLoading?: boolean
  /** Show sort configuration */
  showSort?: boolean
  /** Show query linter (plain text representation) */
  showLinter?: boolean
}

// ============================================================================
// Component
// ============================================================================

export function QueryBuilder({
  value,
  onChange,
  onExecute,
  onSave,
  onClose,
  compact = false,
  showExecute = true,
  showSave = false,
  className,
  resultCount,
  isLoading = false,
  showSort = true,
  showLinter = true,
}: QueryBuilderProps) {
  const hasFilters = value.filters.length > 0

  // Handle adding a new filter
  const handleAddFilter = (
    filterType: 'supertag' | 'property' | 'content' | 'relation' | 'temporal' | 'hasField' | 'and' | 'or' | 'not',
  ) => {
    const newFilter = createDefaultFilter(filterType)
    onChange({
      ...value,
      filters: [...value.filters, newFilter],
    })
  }

  // Handle updating a filter
  const handleUpdateFilter = (filterId: string, updates: Record<string, unknown>) => {
    onChange({
      ...value,
      filters: value.filters.map((f) =>
        f.id === filterId ? { ...f, ...updates } : f,
      ),
    })
  }

  // Handle removing a filter
  const handleRemoveFilter = (filterId: string) => {
    onChange({
      ...value,
      filters: value.filters.filter((f) => f.id !== filterId),
    })
  }

  // Handle clearing all filters
  const handleClearAll = () => {
    onChange({
      ...value,
      filters: [],
      sort: undefined,
    })
  }

  // Handle sort change
  const handleSortChange = (sort: QuerySort | undefined) => {
    onChange({
      ...value,
      sort,
    })
  }

  return (
    <div
      className={cn(
        'flex flex-col gap-3',
        compact ? 'p-2' : 'p-4',
        className,
      )}
    >
      {/* Header with title and close button */}
      {!compact && onClose && (
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground/80">
            Query Builder
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            title="Close query builder"
          >
            <X weight="bold" />
          </Button>
        </div>
      )}

      {/* Filter list and add button */}
      <div className="flex flex-wrap items-center gap-2">
        {hasFilters && (
          <FilterList
            filters={value.filters}
            onUpdateFilter={handleUpdateFilter}
            onRemoveFilter={handleRemoveFilter}
            compact={compact}
          />
        )}

        {/* Add filter menu */}
        <AddFilterMenu onAddFilter={handleAddFilter} compact={compact} />

        {/* Sort configuration */}
        {showSort && (
          <SortConfig
            value={value.sort}
            onChange={handleSortChange}
            compact={compact}
          />
        )}

        {/* Clear all button */}
        {hasFilters && (
          <Button
            variant="ghost"
            size={compact ? 'xs' : 'sm'}
            onClick={handleClearAll}
            className="text-muted-foreground hover:text-foreground"
          >
            Clear all
          </Button>
        )}
      </div>

      {/* Query linter - plain text representation */}
      {showLinter && hasFilters && (
        <div className="border-t border-border pt-2">
          <QueryLinter query={value} compact={compact} />
        </div>
      )}

      {/* Result count and action buttons */}
      <div className="flex items-center justify-between">
        {/* Result count */}
        <div className="text-xs text-muted-foreground">
          {isLoading ? (
            <span>Loading...</span>
          ) : resultCount !== undefined ? (
            <span>
              {resultCount} {resultCount === 1 ? 'result' : 'results'}
            </span>
          ) : hasFilters ? (
            <span>Click execute to see results</span>
          ) : (
            <span>Add filters to build your query</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {showSave && onSave && hasFilters && (
            <Button
              variant="outline"
              size={compact ? 'sm' : 'default'}
              onClick={onSave}
            >
              <FloppyDisk weight="bold" data-icon="inline-start" />
              Save
            </Button>
          )}

          {showExecute && onExecute && hasFilters && (
            <Button
              variant="default"
              size={compact ? 'sm' : 'default'}
              onClick={onExecute}
              disabled={isLoading}
            >
              <Play weight="fill" data-icon="inline-start" />
              Execute
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a default filter of the given type with placeholder values
 */
function createDefaultFilter(
  filterType: 'supertag' | 'property' | 'content' | 'relation' | 'temporal' | 'hasField' | 'and' | 'or' | 'not',
) {
  const id = crypto.randomUUID().slice(0, 8)

  switch (filterType) {
    case 'supertag':
      return {
        id,
        type: 'supertag' as const,
        supertagSystemId: '',
        includeInherited: true,
      }
    case 'property':
      return {
        id,
        type: 'property' as const,
        fieldSystemId: '',
        op: 'eq' as const,
        value: '',
      }
    case 'content':
      return {
        id,
        type: 'content' as const,
        query: '',
        caseSensitive: false,
      }
    case 'relation':
      return {
        id,
        type: 'relation' as const,
        relationType: 'childOf' as const,
        targetNodeId: undefined,
      }
    case 'temporal':
      return {
        id,
        type: 'temporal' as const,
        field: 'createdAt' as const,
        op: 'within' as const,
        days: 7,
      }
    case 'hasField':
      return {
        id,
        type: 'hasField' as const,
        fieldSystemId: '',
        negate: false,
      }
    case 'and':
      return {
        id,
        type: 'and' as const,
        filters: [],
      }
    case 'or':
      return {
        id,
        type: 'or' as const,
        filters: [],
      }
    case 'not':
      return {
        id,
        type: 'not' as const,
        filters: [],
      }
    default:
      throw new Error(`Unknown filter type: ${filterType}`)
  }
}
