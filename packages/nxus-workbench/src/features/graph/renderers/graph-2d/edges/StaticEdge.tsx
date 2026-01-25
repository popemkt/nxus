/**
 * StaticEdge Component
 *
 * A simple static edge with arrow marker to indicate direction.
 * More performant than AnimatedEdge for graphs with many edges.
 */

import { memo, useMemo } from 'react'
import { BaseEdge, getBezierPath, EdgeLabelRenderer } from '@xyflow/react'
import type { GraphEdgeProps } from './types'
import {
  getEdgeColor,
  getEdgeOpacity,
  getEdgeStrokeWidth,
  shouldShowEdgeLabel,
} from './types'

// Unique ID counter for SVG definitions
let staticEdgeIdCounter = 0

/**
 * StaticEdge - Simple edge with arrow marker.
 *
 * Features:
 * - Arrow marker at target end indicating direction
 * - Color coding: teal for outgoing, violet for incoming
 * - Opacity states: normal, highlighted, dimmed
 * - Optional label showing edge type
 * - Better performance for large graphs (no animation)
 */
export const StaticEdge = memo(function StaticEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: GraphEdgeProps) {
  // Generate unique ID for this edge's SVG definitions
  const uniqueId = useMemo(() => `static-edge-${id}-${++staticEdgeIdCounter}`, [id])

  const {
    type,
    direction,
    label,
    isHighlighted,
    isInLocalGraph,
    labelVisibility,
    isHovered,
  } = data

  // Calculate bezier path
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  // Calculate edge styling
  const edgeColor = getEdgeColor(direction, type)
  const opacity = getEdgeOpacity(isHighlighted, isInLocalGraph)
  const strokeWidth = getEdgeStrokeWidth(isHighlighted || !!selected)
  const showLabel = shouldShowEdgeLabel(labelVisibility, isHovered, isHighlighted)

  return (
    <>
      {/* SVG Definitions for arrow marker */}
      <defs>
        <marker
          id={`${uniqueId}-arrow`}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth={isHighlighted ? 5 : 4}
          markerHeight={isHighlighted ? 5 : 4}
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill={edgeColor}
            fillOpacity={opacity}
          />
        </marker>
      </defs>

      {/* Main edge path */}
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: edgeColor,
          strokeWidth,
          strokeOpacity: opacity,
          transition: 'stroke-opacity 0.2s ease, stroke-width 0.2s ease',
        }}
        markerEnd={`url(#${uniqueId}-arrow)`}
      />

      {/* Edge label */}
      {showLabel && label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              fontSize: 10,
              fontWeight: 500,
              padding: '2px 6px',
              borderRadius: 4,
              backgroundColor: 'rgba(0, 0, 0, 0.75)',
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
