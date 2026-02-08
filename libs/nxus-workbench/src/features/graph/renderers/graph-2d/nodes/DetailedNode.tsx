/**
 * DetailedNode Component
 *
 * Card-style node with label, supertag badge, and connection count.
 * Used when more detailed information needs to be visible at a glance.
 */

import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Hash, Circle } from '@phosphor-icons/react'
import { cn, Badge } from '@nxus/ui'
import { NO_SUPERTAG_COLOR, VIRTUAL_NODE_COLOR } from '../../../provider/utils'
import type { GraphNodeProps } from './types'
import { shouldShowLabel } from './types'

/**
 * DetailedNode - Card-style node for rich information display.
 *
 * Features:
 * - Supertag color indicator with badge
 * - Connection count display
 * - Visual states: normal, dimmed, highlighted, focused
 * - Type indicator (node vs virtual tag)
 */
export const DetailedNode = memo(function DetailedNode({
  data,
  selected,
}: GraphNodeProps) {
  const {
    label,
    type,
    isVirtual,
    supertag,
    outgoingCount,
    incomingCount,
    totalConnections,
    isOrphan,
    isMatched,
    isFocused,
    isInLocalGraph,
    isHovered,
    labelVisibility,
  } = data

  // Determine visual state
  const isDimmed = !isInLocalGraph && !isFocused && !isMatched
  const isHighlighted = isMatched && !isFocused && !selected

  // Get node color
  const nodeColor = isVirtual
    ? VIRTUAL_NODE_COLOR
    : supertag?.color ?? NO_SUPERTAG_COLOR

  // Label visibility
  const showLabel = shouldShowLabel(labelVisibility, isHovered, isFocused)

  return (
    <div
      className={cn(
        'rounded-lg border bg-card shadow-md transition-all',
        'min-w-[160px] max-w-[220px]',
        // State styles
        selected && 'ring-2 ring-primary',
        isFocused && !selected && 'ring-2 ring-amber-500',
        isHighlighted && !selected && !isFocused && 'ring-2 ring-primary/70',
        isDimmed && 'opacity-40',
      )}
      style={{
        borderLeftWidth: '3px',
        borderLeftColor: nodeColor,
      }}
    >
      {/* Target handle - left side */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-primary !border-background !w-2 !h-2"
        style={{ left: -4 }}
      />

      {/* Header */}
      <div className="px-3 py-2">
        {/* Type indicator and label */}
        <div className="flex items-start gap-2">
          {/* Type icon */}
          <div
            className={cn(
              'shrink-0 mt-0.5 rounded-full p-1',
              isVirtual ? 'bg-muted' : 'bg-muted/50',
            )}
            style={{ color: nodeColor }}
          >
            {type === 'tag' || type === 'supertag' ? (
              <Hash className="size-3" weight="bold" />
            ) : (
              <Circle className="size-3" weight="fill" />
            )}
          </div>

          {/* Label */}
          <div className="flex-1 min-w-0">
            {showLabel ? (
              <h4 className="font-medium text-sm line-clamp-2 leading-tight">
                {label}
              </h4>
            ) : (
              <div className="h-4 w-16 bg-muted/30 rounded animate-pulse" />
            )}
          </div>
        </div>

        {/* Supertag badge (if present and not a tag itself) */}
        {supertag && type === 'node' && (
          <div className="mt-1.5">
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0"
              style={{
                borderColor: `${supertag.color}40`,
                color: supertag.color,
              }}
            >
              <Hash className="size-2.5 mr-0.5" weight="bold" />
              {supertag.name}
            </Badge>
          </div>
        )}

        {/* Connection counts */}
        <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
          {/* Outgoing */}
          <span className="flex items-center gap-0.5" title="Outgoing links">
            <span className="text-teal-500">→</span>
            {outgoingCount}
          </span>

          {/* Incoming */}
          <span className="flex items-center gap-0.5" title="Incoming links">
            <span className="text-violet-500">←</span>
            {incomingCount}
          </span>

          {/* Total */}
          <span className="ml-auto">
            {totalConnections} link{totalConnections !== 1 ? 's' : ''}
          </span>

          {/* Orphan indicator */}
          {isOrphan && (
            <span className="text-amber-500" title="No connections">
              ⊘
            </span>
          )}
        </div>
      </div>

      {/* Source handle - right side */}
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-primary !border-background !w-2 !h-2"
        style={{ right: -4 }}
      />
    </div>
  )
})
