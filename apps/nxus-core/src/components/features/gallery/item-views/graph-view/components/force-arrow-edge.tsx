import { memo } from 'react'
import { BaseEdge  } from '@xyflow/react'
import type {EdgeProps} from '@xyflow/react';

// Node radius constant - should match SimpleNode baseSize / 2
const NODE_RADIUS = 12

// Arrow edge for force-directed layout - straight line with arrowhead, stops at node edge
export const ForceArrowEdge = memo(function ForceArrowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
  style,
}: EdgeProps) {
  const isDimmed = data && (data as { isMatched?: boolean }).isMatched === false

  // Calculate direction vector
  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const length = Math.sqrt(dx * dx + dy * dy)

  // Don't render if nodes are overlapping
  if (length < NODE_RADIUS * 2) {
    return null
  }

  // Normalize direction
  const nx = dx / length
  const ny = dy / length

  // Shorten both ends by node radius so edges stop at circle edge
  const adjustedSourceX = sourceX + nx * NODE_RADIUS
  const adjustedSourceY = sourceY + ny * NODE_RADIUS
  const adjustedTargetX = targetX - nx * (NODE_RADIUS + 4) // Extra 4px for arrow head
  const adjustedTargetY = targetY - ny * (NODE_RADIUS + 4)

  // Build straight path
  const edgePath = `M ${adjustedSourceX} ${adjustedSourceY} L ${adjustedTargetX} ${adjustedTargetY}`

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd={
        isDimmed ? 'url(#force-arrow-marker-dim)' : 'url(#force-arrow-marker)'
      }
      style={{
        stroke: selected
          ? 'var(--primary)'
          : isDimmed
            ? 'var(--muted)'
            : 'var(--muted-foreground)',
        strokeWidth: selected ? 2 : 1.5,
        opacity: isDimmed ? 0.3 : 1, // Solid for normal, dim only when filtered
        ...style,
      }}
    />
  )
})

// Arrow marker definition component - render once in the graph
export function ForceArrowMarkerDefs() {
  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}>
      <defs>
        <marker
          id="force-arrow-marker"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted-foreground)" />
        </marker>
        <marker
          id="force-arrow-marker-dim"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" opacity={0.3} />
        </marker>
      </defs>
    </svg>
  )
}
