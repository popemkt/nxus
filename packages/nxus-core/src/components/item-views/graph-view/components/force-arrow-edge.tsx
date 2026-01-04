import { memo } from 'react'
import { BaseEdge, type EdgeProps, getStraightPath } from '@xyflow/react'

// Arrow edge for force-directed layout - straight line with arrowhead pointing to target
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

  // Get straight path (shortened slightly so arrow doesn't go into node)
  const [edgePath] = getStraightPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
  })

  // Use BaseEdge with markerEnd
  return (
    <BaseEdge
      id={id}
      path={edgePath}
      markerEnd="url(#force-arrow-marker)"
      style={{
        stroke: selected
          ? 'var(--primary)'
          : isDimmed
            ? 'var(--muted)'
            : 'var(--muted-foreground)',
        strokeWidth: selected ? 2 : 1.5,
        opacity: isDimmed ? 0.3 : 0.7,
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
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill="var(--muted-foreground)"
            opacity={0.7}
          />
        </marker>
        <marker
          id="force-arrow-marker-dim"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--muted)" opacity={0.3} />
        </marker>
      </defs>
    </svg>
  )
}
