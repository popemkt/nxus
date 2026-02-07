import { memo } from 'react'
import { BaseEdge, getBezierPath } from '@xyflow/react'
import { cn } from '@nxus/ui'

interface DependencyEdgeProps {
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  sourcePosition: any
  targetPosition: any
  data?: { isMatched?: boolean }
  selected?: boolean
}

// Automaker style: bezier curves without arrows
export const DependencyEdge = memo(function DependencyEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: DependencyEdgeProps) {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const isDimmed = data && data.isMatched === false

  return (
    <BaseEdge
      id={id}
      path={edgePath}
      className={cn(
        'transition-opacity',
        selected && '!stroke-primary',
        isDimmed && 'opacity-30',
      )}
      style={{
        stroke: selected ? 'var(--primary)' : 'var(--muted-foreground)',
        strokeWidth: selected ? 2 : 1.5,
        opacity: isDimmed ? 0.3 : 1,
      }}
    />
  )
})
