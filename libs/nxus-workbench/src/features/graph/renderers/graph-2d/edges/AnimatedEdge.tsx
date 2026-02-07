/**
 * AnimatedEdge Component
 *
 * An edge with animated particles flowing along the path to indicate direction.
 * Particles flow from source to target for outgoing edges.
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
let edgeIdCounter = 0

/**
 * AnimatedEdge - Edge with directional particle animation.
 *
 * Features:
 * - Animated particles flowing along the edge path
 * - Direction indicated by particle flow (source → target)
 * - Color coding: teal for outgoing, violet for incoming
 * - Opacity states: normal, highlighted, dimmed
 * - Optional label showing edge type
 */
export const AnimatedEdge = memo(function AnimatedEdge({
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
  const uniqueId = useMemo(() => `edge-${id}-${++edgeIdCounter}`, [id])

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

  // Particle animation configuration
  const particleCount = isHighlighted ? 3 : 2
  const animationDuration = isHighlighted ? '1.5s' : '2s'

  return (
    <>
      {/* SVG Definitions for particles and markers */}
      <defs>
        {/* Animated particle circles */}
        {Array.from({ length: particleCount }).map((_, i) => (
          <circle
            key={`${uniqueId}-particle-${i}`}
            id={`${uniqueId}-particle-${i}`}
            r={isHighlighted ? 3 : 2}
            fill={edgeColor}
          >
            <animateMotion
              dur={animationDuration}
              repeatCount="indefinite"
              begin={`${(i / particleCount) * parseFloat(animationDuration)}s`}
            >
              <mpath href={`#${uniqueId}-path`} />
            </animateMotion>
          </circle>
        ))}

        {/* Arrow marker for end of edge */}
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

      {/* Hidden path for particle motion (needed for animateMotion mpath) */}
      <path
        id={`${uniqueId}-path`}
        d={edgePath}
        fill="none"
        stroke="none"
      />

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

      {/* Particle elements using the defined circles */}
      {Array.from({ length: particleCount }).map((_, i) => (
        <use
          key={`${uniqueId}-use-${i}`}
          href={`#${uniqueId}-particle-${i}`}
          style={{ opacity }}
        />
      ))}

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
