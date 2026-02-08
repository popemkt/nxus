/**
 * StraightEdge Component
 *
 * Minimalist straight-line edge like Obsidian's graph view.
 * Clean, simple lines without bezier curves for a professional look.
 */

import { memo, useMemo } from 'react'
import { BaseEdge, getStraightPath, EdgeLabelRenderer } from '@xyflow/react'
import type { GraphEdgeProps } from './types'
import {
  getEdgeColor,
  getEdgeOpacity,
  shouldShowEdgeLabel,
} from './types'

// Unique ID counter for SVG definitions
let straightEdgeIdCounter = 0

/**
 * StraightEdge - Minimalist straight-line edge.
 *
 * Features:
 * - Simple straight lines (no bezier curves)
 * - Small arrow marker at target end
 * - Subtle colors that don't dominate
 * - Thin stroke width (1px normal, 1.5px highlighted)
 * - Smooth transitions
 */
export const StraightEdge = memo(function StraightEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: GraphEdgeProps) {
  // Generate unique ID for this edge's SVG definitions
  const uniqueId = useMemo(() => `straight-edge-${id}-${++straightEdgeIdCounter}`, [id])

  const {
    type,
    direction,
    label,
    isHighlighted,
    isInLocalGraph,
    labelVisibility,
    isHovered,
  } = data

  // Calculate straight path
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })

  // Calculate edge styling - more subtle than before
  const edgeColor = getEdgeColor(direction, type)
  const opacity = getEdgeOpacity(isHighlighted, isInLocalGraph)
  // Minimalist stroke width: 1px normal, 1.5px when highlighted
  const strokeWidth = (isHighlighted || selected) ? 1.5 : 1
  const showLabel = shouldShowEdgeLabel(labelVisibility, isHovered, isHighlighted)

  return (
    <>
      {/* SVG Definitions for small arrow marker */}
      <defs>
        <marker
          id={`${uniqueId}-arrow`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth={3}
          markerHeight={3}
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill={edgeColor}
            fillOpacity={opacity}
          />
        </marker>
      </defs>

      {/* Main edge path - straight line */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: edgeColor,
          strokeWidth,
          strokeOpacity: opacity,
          transition: 'stroke-opacity 0.15s ease, stroke-width 0.15s ease',
        }}
        markerEnd={`url(#${uniqueId}-arrow)`}
      />

      {/* Edge label (only on hover/highlight) */}
      {showLabel && label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 9,
              fontWeight: 500,
              padding: '1px 4px',
              borderRadius: 3,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              color: edgeColor,
              whiteSpace: 'nowrap',
              opacity: opacity,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})
