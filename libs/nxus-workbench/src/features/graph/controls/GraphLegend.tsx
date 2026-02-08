/**
 * GraphLegend - Displays supertag colors and enables filtering
 *
 * Features:
 * - Shows all supertags with their assigned colors
 * - Click to toggle supertag filter
 * - Visual indication of active filters
 * - Collapsible for space efficiency
 */

import { Circle, Palette, X } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { useState } from 'react'

import { useGraphStore, useGraphFilter } from '../store'

/** Edge direction colors (shared between 2D and 3D renderers) */
const EDGE_DIRECTION_COLORS = {
  outgoing: '#14b8a6', // Teal-500
  incoming: '#8b5cf6', // Violet-500
}

export interface GraphLegendProps {
  /** Map of supertag ID to color hex */
  supertagColors: Map<string, string>
  /** Map of supertag ID to name */
  supertagNames: Map<string, string>
  /** Additional classes */
  className?: string
  /** Start collapsed */
  defaultCollapsed?: boolean
}

interface LegendItemProps {
  id: string
  name: string
  color: string
  isFiltered: boolean
  isActive: boolean
  onToggle: (id: string) => void
}

function LegendItem({
  id,
  name,
  color,
  isFiltered,
  isActive,
  onToggle,
}: LegendItemProps) {
  return (
    <button
      onClick={() => onToggle(id)}
      className={cn(
        'flex items-center gap-2 px-2 py-1 rounded-md w-full text-left',
        'transition-all hover:bg-muted/50',
        isFiltered && !isActive && 'opacity-40',
        isActive && 'bg-muted/80',
      )}
      title={isActive ? `Remove ${name} from filter` : `Filter by ${name}`}
    >
      <Circle
        className="size-3 shrink-0"
        weight="fill"
        style={{ color }}
      />
      <span className="text-xs truncate flex-1">{name}</span>
      {isActive && (
        <X className="size-3 text-muted-foreground shrink-0" />
      )}
    </button>
  )
}

/**
 * Legend showing supertag colors with click-to-filter functionality.
 * When filters are active, only selected supertags are shown at full opacity.
 */
export function GraphLegend({
  supertagColors,
  supertagNames,
  className,
  defaultCollapsed = false,
}: GraphLegendProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const filter = useGraphFilter()
  const setFilter = useGraphStore((state) => state.setFilter)

  const supertagIds = Array.from(supertagColors.keys())
  const hasFilters = filter.supertagFilter.length > 0

  const handleToggle = (supertagId: string) => {
    const currentFilter = filter.supertagFilter
    const isActive = currentFilter.includes(supertagId)

    if (isActive) {
      // Remove from filter
      setFilter({
        supertagFilter: currentFilter.filter((id) => id !== supertagId),
      })
    } else {
      // Add to filter
      setFilter({
        supertagFilter: [...currentFilter, supertagId],
      })
    }
  }

  const handleClearFilters = () => {
    setFilter({ supertagFilter: [] })
  }

  if (supertagIds.length === 0) {
    return null
  }

  return (
    <div
      className={cn(
        'bg-background/95 backdrop-blur-sm',
        'border border-border rounded-lg shadow-md',
        'overflow-hidden',
        className,
      )}
    >
      {/* Header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={cn(
          'w-full flex items-center justify-between px-3 py-2',
          'hover:bg-muted/50 transition-colors',
        )}
      >
        <div className="flex items-center gap-2">
          <Palette className="size-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">Legend</span>
          {hasFilters && (
            <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[10px] rounded">
              {filter.supertagFilter.length} active
            </span>
          )}
        </div>
      </button>

      {/* Content */}
      {!collapsed && (
        <div className="px-2 pb-2">
          {/* Edge directions */}
          <div className="flex items-center gap-3 px-2 py-1.5 mb-1">
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-3 rounded-full"
                style={{ backgroundColor: EDGE_DIRECTION_COLORS.outgoing }}
              />
              <span className="text-[10px] text-muted-foreground">Outgoing</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="h-2 w-3 rounded-full"
                style={{ backgroundColor: EDGE_DIRECTION_COLORS.incoming }}
              />
              <span className="text-[10px] text-muted-foreground">Incoming</span>
            </div>
          </div>

          {/* Supertag colors */}
          <div className="space-y-0.5">
          {supertagIds.map((id) => (
            <LegendItem
              key={id}
              id={id}
              name={supertagNames.get(id) || 'Unknown'}
              color={supertagColors.get(id) || '#888888'}
              isFiltered={hasFilters}
              isActive={filter.supertagFilter.includes(id)}
              onToggle={handleToggle}
            />
          ))}

          {/* Clear filters button */}
          {hasFilters && (
            <button
              onClick={handleClearFilters}
              className={cn(
                'w-full flex items-center justify-center gap-1.5',
                'px-2 py-1.5 mt-2 rounded-md text-xs',
                'text-muted-foreground hover:text-foreground',
                'hover:bg-muted/50 transition-colors',
                'border border-dashed border-border',
              )}
            >
              <X className="size-3" />
              Clear all filters
            </button>
          )}
          </div>
        </div>
      )}
    </div>
  )
}
