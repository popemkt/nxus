import { memo } from 'react'
import { BaseEdge } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'

const NODE_RADIUS = 12

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

  const dx = targetX - sourceX
  const dy = targetY - sourceY
  const length = Math.sqrt(dx * dx + dy * dy)

  if (length < NODE_RADIUS * 2) {
    return null
  }

  const nx = dx / length
  const ny = dy / length

  const adjustedSourceX = sourceX + nx * NODE_RADIUS
  const adjustedSourceY = sourceY + ny * NODE_RADIUS
  const adjustedTargetX = targetX - nx * (NODE_RADIUS + 4)
  const adjustedTargetY = targetY - ny * (NODE_RADIUS + 4)

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
        opacity: isDimmed ? 0.3 : 1,
        ...style,
      }}
    />
  )
})

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
