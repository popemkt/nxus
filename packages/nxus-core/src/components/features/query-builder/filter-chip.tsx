/**
 * FilterChip - Individual filter display and edit component
 *
 * Renders a filter as a chip with inline editing capability.
 * Clicking opens an editor appropriate to the filter type.
 */

import { useState } from 'react'
import {
  X,
  Hash,
  TextT,
  MagnifyingGlass,
  Calendar,
  LinkSimple,
  CheckSquare,
  TreeStructure,
} from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { QueryFilter, FilterOp } from '@nxus/db'
import { SupertagFilterEditor } from './filters/supertag-filter'
import { PropertyFilterEditor } from './filters/property-filter'
import { ContentFilterEditor } from './filters/content-filter'
import { RelationFilterEditor } from './filters/relation-filter'
import { TemporalFilterEditor } from './filters/temporal-filter'
import { HasFieldFilterEditor } from './filters/hasfield-filter'
import { LogicalFilterEditor } from './filters/logical-filter'

// ============================================================================
// Types
// ============================================================================

export interface FilterChipProps {
  /** The filter to display */
  filter: QueryFilter
  /** Called when filter is updated */
  onUpdate: (updates: Record<string, unknown>) => void
  /** Called when filter is removed */
  onRemove: () => void
  /** Compact mode */
  compact?: boolean
}

// ============================================================================
// Component
// ============================================================================

export function FilterChip({
  filter,
  onUpdate,
  onRemove,
  compact = false,
}: FilterChipProps) {
  const [isEditing, setIsEditing] = useState(false)

  // Get filter display info
  const { icon: Icon, label, color } = getFilterDisplay(filter)

  // Determine if filter is complete (has required values)
  const isComplete = isFilterComplete(filter)

  return (
    <div className="relative">
      {/* Chip display */}
      <div
        className={cn(
          'flex items-center gap-1.5 px-2 py-1 rounded-md border cursor-pointer transition-all',
          'hover:border-primary/50',
          isComplete
            ? 'bg-primary/10 border-primary/30 text-primary'
            : 'bg-muted/50 border-dashed border-muted-foreground/30 text-muted-foreground',
          compact ? 'text-[10px] h-6' : 'text-xs h-7',
        )}
        onClick={() => setIsEditing(true)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            setIsEditing(true)
          }
        }}
      >
        {/* Filter type icon */}
        <Icon
          className={cn('shrink-0', compact ? 'size-3' : 'size-3.5')}
          weight="bold"
          style={{ color }}
        />

        {/* Filter label */}
        <span className="truncate max-w-32">{label}</span>

        {/* Remove button */}
        <button
          className={cn(
            'flex items-center justify-center shrink-0 bg-transparent border-none cursor-pointer',
            'opacity-50 hover:opacity-100 transition-opacity',
          )}
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          title="Remove filter"
        >
          <X className={compact ? 'size-2.5' : 'size-3'} weight="bold" />
        </button>
      </div>

      {/* Inline editor popover */}
      {isEditing && (
        <FilterEditor
          filter={filter}
          onUpdate={onUpdate}
          onClose={() => setIsEditing(false)}
          compact={compact}
        />
      )}
    </div>
  )
}

// ============================================================================
// Filter Editor
// ============================================================================

interface FilterEditorProps {
  filter: QueryFilter
  onUpdate: (updates: Record<string, unknown>) => void
  onClose: () => void
  compact?: boolean
}

function FilterEditor({ filter, onUpdate, onClose, compact }: FilterEditorProps) {
  // Close on click outside
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={handleBackdropClick}
      />

      {/* Editor popup */}
      <div
        className={cn(
          'absolute z-50 top-full left-0 mt-1',
          'bg-popover border border-border rounded-lg shadow-lg',
          'animate-in fade-in-0 zoom-in-95',
          compact ? 'min-w-48 p-2' : 'min-w-56 p-3',
        )}
      >
        {filter.type === 'supertag' && (
          <SupertagFilterEditor
            filter={filter}
            onUpdate={onUpdate}
            onClose={onClose}
          />
        )}
        {filter.type === 'property' && (
          <PropertyFilterEditor
            filter={filter}
            onUpdate={onUpdate}
            onClose={onClose}
          />
        )}
        {filter.type === 'content' && (
          <ContentFilterEditor
            filter={filter}
            onUpdate={onUpdate}
            onClose={onClose}
          />
        )}
        {filter.type === 'relation' && (
          <RelationFilterEditor
            filter={filter}
            onUpdate={onUpdate}
            onClose={onClose}
          />
        )}
        {filter.type === 'temporal' && (
          <TemporalFilterEditor
            filter={filter}
            onUpdate={onUpdate}
            onClose={onClose}
          />
        )}
        {filter.type === 'hasField' && (
          <HasFieldFilterEditor
            filter={filter}
            onUpdate={onUpdate}
            onClose={onClose}
          />
        )}
        {(filter.type === 'and' || filter.type === 'or' || filter.type === 'not') && (
          <LogicalFilterEditor
            filter={filter}
            onUpdate={onUpdate}
            onClose={onClose}
          />
        )}
      </div>
    </>
  )
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get display info for a filter (icon, label, color)
 */
function getFilterDisplay(filter: QueryFilter): {
  icon: typeof Hash
  label: string
  color?: string
} {
  switch (filter.type) {
    case 'supertag':
      return {
        icon: Hash,
        label: filter.supertagSystemId
          ? formatSystemId(filter.supertagSystemId)
          : 'Select supertag...',
        color: filter.supertagSystemId ? '#8b5cf6' : undefined, // Purple for supertags
      }

    case 'property':
      return {
        icon: TextT,
        label: filter.fieldSystemId
          ? `${formatSystemId(filter.fieldSystemId)} ${formatOp(filter.op)} ${formatValue(filter.value)}`
          : 'Select property...',
        color: filter.fieldSystemId ? '#3b82f6' : undefined, // Blue for properties
      }

    case 'content':
      return {
        icon: MagnifyingGlass,
        label: filter.query
          ? `Contains "${filter.query}"`
          : 'Enter search text...',
        color: filter.query ? '#22c55e' : undefined, // Green for content search
      }

    case 'temporal':
      return {
        icon: Calendar,
        label: formatTemporalFilter(filter),
        color: '#f59e0b', // Amber for temporal
      }

    case 'relation':
      return {
        icon: LinkSimple,
        label: formatRelationFilter(filter),
        color: '#ec4899', // Pink for relations
      }

    case 'hasField':
      return {
        icon: CheckSquare,
        label: filter.fieldSystemId
          ? `${filter.negate ? 'Missing' : 'Has'} ${formatSystemId(filter.fieldSystemId)}`
          : 'Select field...',
        color: filter.fieldSystemId ? '#06b6d4' : undefined, // Cyan for hasField
      }

    case 'and':
    case 'or':
    case 'not':
      return {
        icon: TreeStructure,
        label: `${filter.type.toUpperCase()} (${filter.filters.length} filters)`,
        color: '#6b7280', // Gray for logical
      }

    default:
      return {
        icon: TextT,
        label: 'Unknown filter',
      }
  }
}

/**
 * Check if a filter is complete (has all required values)
 */
function isFilterComplete(filter: QueryFilter): boolean {
  switch (filter.type) {
    case 'supertag':
      return !!filter.supertagSystemId
    case 'property':
      return !!(filter.fieldSystemId && filter.op)
    case 'content':
      return !!filter.query
    case 'temporal':
      return !!(filter.field && filter.op && (filter.days || filter.date))
    case 'relation':
      return !!filter.relationType
    case 'hasField':
      return !!filter.fieldSystemId
    case 'and':
    case 'or':
    case 'not':
      return filter.filters.length > 0
    default:
      return false
  }
}

/**
 * Format a system ID for display (e.g., "supertag:item" -> "Item")
 */
function formatSystemId(systemId: string): string {
  const parts = systemId.split(':')
  const name = parts[parts.length - 1] ?? ''
  if (!name) return systemId
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/**
 * Format a filter operator for display
 */
function formatOp(op: FilterOp): string {
  const opLabels: Record<FilterOp, string> = {
    eq: '=',
    neq: '!=',
    gt: '>',
    gte: '>=',
    lt: '<',
    lte: '<=',
    contains: 'contains',
    startsWith: 'starts with',
    endsWith: 'ends with',
    isEmpty: 'is empty',
    isNotEmpty: 'is not empty',
  }
  return opLabels[op] || op
}

/**
 * Format a filter value for display
 */
function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '...'
  }
  if (typeof value === 'string') {
    return `"${value.slice(0, 15)}${value.length > 15 ? '...' : ''}"`
  }
  return String(value)
}

/**
 * Format a temporal filter for display
 */
function formatTemporalFilter(filter: QueryFilter & { type: 'temporal' }): string {
  const fieldLabel = filter.field === 'createdAt' ? 'Created' : 'Updated'

  switch (filter.op) {
    case 'within':
      return `${fieldLabel} within ${filter.days} days`
    case 'before':
      return `${fieldLabel} before ${filter.date}`
    case 'after':
      return `${fieldLabel} after ${filter.date}`
    default:
      return fieldLabel
  }
}

/**
 * Format a relation filter for display
 */
function formatRelationFilter(filter: QueryFilter & { type: 'relation' }): string {
  const relationLabels: Record<string, string> = {
    childOf: 'Child of',
    ownedBy: 'Owned by',
    linksTo: 'Links to',
    linkedFrom: 'Linked from',
  }

  const label = relationLabels[filter.relationType] || filter.relationType

  if (filter.targetNodeId) {
    return `${label} (node)`
  }

  return `${label} any`
}
