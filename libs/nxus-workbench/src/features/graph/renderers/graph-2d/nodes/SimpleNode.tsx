/**
 * SimpleNode Component
 *
 * Minimalist colored dot node with optional label.
 * Size scales based on connection count for importance visualization.
 */

import { memo, useState } from 'react'
import { Handle, Position } from '@xyflow/react'
import { cn } from '@nxus/ui'
import { NO_SUPERTAG_COLOR, VIRTUAL_NODE_COLOR } from '../../../provider/utils'
import type { GraphNodeProps } from './types'
import { calculateNodeSize, shouldShowLabel } from './types'

/**
 * SimpleNode - Minimalist dot-style node.
 *
 * Features:
 * - Colored dot based on supertag
 * - Size scales with connection count
 * - Optional label (hover or always visible)
 * - Visual states: normal, dimmed, highlighted, focused
 * - Centered handles for force-directed layout
 */
export const SimpleNode = memo(function SimpleNode({
  data,
  selected,
}: GraphNodeProps) {
  const [isLocalHover, setIsLocalHover] = useState(false)

  const {
    label,
    type,
    isVirtual,
    supertag,
    totalConnections,
    isOrphan,
    isMatched,
    isFocused,
    isInLocalGraph,
    isHovered,
    nodeSize: sizeOption,
    labelVisibility,
  } = data

  // Determine visual state
  const isDimmed = !isInLocalGraph && !isFocused && !isMatched
  const isHighlighted = isMatched && !isFocused && !selected

  // Get node color
  const nodeColor = isVirtual
    ? VIRTUAL_NODE_COLOR
    : supertag?.color ?? NO_SUPERTAG_COLOR

  // Calculate size based on connections
  const size = calculateNodeSize(totalConnections, sizeOption)

  // Label visibility - also show on local hover
  const showLabel = shouldShowLabel(
    labelVisibility,
    isHovered || isLocalHover,
    isFocused,
  )

  return (
    <div
      className="flex flex-col items-center gap-1"
      onMouseEnter={() => setIsLocalHover(true)}
      onMouseLeave={() => setIsLocalHover(false)}
    >
      {/* The dot */}
      <div
        className={cn(
          'rounded-full flex items-center justify-center transition-all cursor-pointer shadow-lg relative',
          // Ring states
          selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background',
          isFocused &&
            !selected &&
            'ring-2 ring-amber-500 ring-offset-1 ring-offset-background',
          isHighlighted &&
            !selected &&
            !isFocused &&
            'ring-2 ring-primary/70 ring-offset-1 ring-offset-background',
          // Dimmed state
          isDimmed && 'opacity-30',
          // Orphan visual cue
          isOrphan && !isDimmed && 'ring-1 ring-dashed ring-muted-foreground/30',
        )}
        style={{
          width: size,
          height: size,
          backgroundColor: nodeColor,
        }}
      >
        {/* Virtual node indicator (inner ring for tags) */}
        {isVirtual && (
          <div
            className="absolute inset-1 rounded-full border-2 border-dashed border-background/50"
            style={{ borderColor: 'rgba(255,255,255,0.3)' }}
          />
        )}

        {/* Centered handles for force-directed layout */}
        <Handle
          type="target"
          position={Position.Top}
          id="center-target"
          className="!bg-transparent !border-0"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 1,
            height: 1,
          }}
        />
        <Handle
          type="source"
          position={Position.Bottom}
          id="center-source"
          className="!bg-transparent !border-0"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: 1,
            height: 1,
          }}
        />
      </div>

      {/* Label */}
      {showLabel && (
        <div
          className={cn(
            'text-[10px] font-medium max-w-[100px] text-center truncate',
            'px-1.5 py-0.5 rounded',
            'bg-background/90 backdrop-blur-sm shadow-sm',
            'text-foreground/90',
            'pointer-events-none',
            isDimmed && 'opacity-30',
          )}
        >
          {/* Type indicator for virtual nodes */}
          {type === 'tag' && (
            <span className="text-muted-foreground mr-0.5">#</span>
          )}
          {label}
        </div>
      )}
    </div>
  )
})
