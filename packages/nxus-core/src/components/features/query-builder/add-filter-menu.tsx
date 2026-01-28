/**
 * AddFilterMenu - Dropdown menu for adding new filters
 *
 * Provides options to add different filter types to the query.
 */

import {
  Plus,
  Hash,
  TextT,
  MagnifyingGlass,
  Calendar,
  LinkSimple,
  CheckSquare,
  TreeStructure,
} from '@phosphor-icons/react'
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@nxus/ui'

// ============================================================================
// Types
// ============================================================================

type FilterType = 'supertag' | 'property' | 'content' | 'relation' | 'temporal' | 'hasField' | 'and' | 'or' | 'not'

export interface AddFilterMenuProps {
  /** Called when a filter type is selected */
  onAddFilter: (filterType: FilterType) => void
  /** Compact mode */
  compact?: boolean
  /** Disabled state */
  disabled?: boolean
}

// ============================================================================
// Filter Type Options
// ============================================================================

const BASIC_FILTER_OPTIONS = [
  {
    type: 'supertag' as const,
    label: 'Supertag',
    description: 'Filter by supertag (e.g., #Item, #Tool)',
    icon: Hash,
    color: '#8b5cf6', // Purple
  },
  {
    type: 'property' as const,
    label: 'Property',
    description: 'Filter by field value',
    icon: TextT,
    color: '#3b82f6', // Blue
  },
  {
    type: 'content' as const,
    label: 'Content',
    description: 'Full-text search',
    icon: MagnifyingGlass,
    color: '#22c55e', // Green
  },
] as const

const ADVANCED_FILTER_OPTIONS = [
  {
    type: 'temporal' as const,
    label: 'Date',
    description: 'Filter by creation/update date',
    icon: Calendar,
    color: '#f59e0b', // Amber
  },
  {
    type: 'relation' as const,
    label: 'Relation',
    description: 'Filter by relationships',
    icon: LinkSimple,
    color: '#ec4899', // Pink
  },
  {
    type: 'hasField' as const,
    label: 'Has Field',
    description: 'Check if field exists',
    icon: CheckSquare,
    color: '#06b6d4', // Cyan
  },
] as const

const LOGICAL_FILTER_OPTIONS = [
  {
    type: 'and' as const,
    label: 'AND Group',
    description: 'All conditions must match',
    icon: TreeStructure,
    color: '#6b7280', // Gray
  },
  {
    type: 'or' as const,
    label: 'OR Group',
    description: 'Any condition can match',
    icon: TreeStructure,
    color: '#6b7280', // Gray
  },
  {
    type: 'not' as const,
    label: 'NOT Group',
    description: 'Exclude matching nodes',
    icon: TreeStructure,
    color: '#6b7280', // Gray
  },
] as const

// ============================================================================
// Component
// ============================================================================

export function AddFilterMenu({
  onAddFilter,
  compact = false,
  disabled = false,
}: AddFilterMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size={compact ? 'xs' : 'sm'}
            disabled={disabled}
            className={cn(
              'border-dashed',
              !compact && 'gap-1',
            )}
          />
        }
      >
        <Plus weight="bold" data-icon="inline-start" />
        {!compact && 'Add filter'}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Basic Filters</DropdownMenuLabel>

        {BASIC_FILTER_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.type}
            onClick={() => onAddFilter(option.type)}
          >
            <option.icon
              className="size-4 shrink-0"
              weight="bold"
              style={{ color: option.color }}
            />
            <div className="flex flex-col gap-0.5">
              <span>{option.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {option.description}
              </span>
            </div>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Advanced Filters</DropdownMenuLabel>

        {ADVANCED_FILTER_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.type}
            onClick={() => onAddFilter(option.type)}
          >
            <option.icon
              className="size-4 shrink-0"
              weight="bold"
              style={{ color: option.color }}
            />
            <div className="flex flex-col gap-0.5">
              <span>{option.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {option.description}
              </span>
            </div>
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Logical Groups</DropdownMenuLabel>

        {LOGICAL_FILTER_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.type}
            onClick={() => onAddFilter(option.type)}
          >
            <option.icon
              className="size-4 shrink-0"
              weight="bold"
              style={{ color: option.color }}
            />
            <div className="flex flex-col gap-0.5">
              <span>{option.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {option.description}
              </span>
            </div>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
