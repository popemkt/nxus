import { memo } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import type { WorkflowEdgeData } from '../types'
import { EDGE_TYPE_STYLES } from '../types'

interface WorkflowEdgeProps extends EdgeProps {
  data?: WorkflowEdgeData
}

/**
 * Custom edge component for workflow transitions.
 *
 * Styles:
 * - Success: Green solid line with arrow
 * - Failure: Red dashed line with arrow
 * - Next/Default: Gray solid line with arrow
 * - Branch: Gray solid line with label
 * - Parallel: Cyan dashed line with arrow
 */
export const WorkflowEdge = memo(function WorkflowEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: WorkflowEdgeProps) {
  const edgeType = data?.edgeType ?? 'next'
  const label = data?.label
  const style = EDGE_TYPE_STYLES[edgeType]

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  // Determine which marker to use based on edge type
  const markerId = `workflow-edge-marker-${edgeType}`

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={`url(#${markerId})`}
        style={{
          stroke: selected ? 'var(--primary)' : style.stroke,
          strokeWidth: selected ? 2.5 : 2,
          strokeDasharray: style.strokeDasharray,
        }}
      />
      {/* Render label for branch edges or edges with explicit labels */}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <span
              className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-background border shadow-sm"
              style={{
                borderColor: style.stroke,
                color: style.stroke,
              }}
            >
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
})

/**
 * SVG marker definitions for workflow edges.
 * Render this component once in the graph container.
 */
export function WorkflowEdgeMarkerDefs() {
  return (
    <svg style={{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 }}>
      <defs>
        {/* Success marker - Green */}
        <marker
          id="workflow-edge-marker-success"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill={EDGE_TYPE_STYLES.success.stroke}
          />
        </marker>

        {/* Failure marker - Red */}
        <marker
          id="workflow-edge-marker-failure"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill={EDGE_TYPE_STYLES.failure.stroke}
          />
        </marker>

        {/* Next marker - Gray */}
        <marker
          id="workflow-edge-marker-next"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={EDGE_TYPE_STYLES.next.stroke} />
        </marker>

        {/* Branch marker - Gray (same as next) */}
        <marker
          id="workflow-edge-marker-branch"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill={EDGE_TYPE_STYLES.branch.stroke}
          />
        </marker>

        {/* Parallel marker - Cyan */}
        <marker
          id="workflow-edge-marker-parallel"
          viewBox="0 0 10 10"
          refX="10"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path
            d="M 0 0 L 10 5 L 0 10 z"
            fill={EDGE_TYPE_STYLES.parallel.stroke}
          />
        </marker>
      </defs>
    </svg>
  )
}

/**
 * Edge types configuration for React Flow
 */
export const workflowEdgeTypes = {
  'workflow-edge': WorkflowEdge,
}
