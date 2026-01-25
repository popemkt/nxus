/**
 * 2D Graph Edge Components
 *
 * Custom React Flow edge components for the 2D graph renderer.
 */

export { AnimatedEdge } from './AnimatedEdge'
export { StaticEdge } from './StaticEdge'

// Types
export type { GraphEdgeData, GraphEdgeProps } from './types'
export {
  EDGE_DIRECTION_COLORS,
  EDGE_TYPE_COLORS,
  DEFAULT_EDGE_COLOR,
  DIMMED_EDGE_COLOR,
  EDGE_OPACITY,
  getEdgeColor,
  getEdgeOpacity,
  getEdgeStrokeWidth,
  shouldShowEdgeLabel,
} from './types'

// Edge types map for React Flow registration
import type { EdgeTypes } from '@xyflow/react'
import { AnimatedEdge } from './AnimatedEdge'
import { StaticEdge } from './StaticEdge'

/**
 * Map of custom edge types for React Flow.
 *
 * Usage:
 * ```tsx
 * <ReactFlow edgeTypes={graphEdgeTypes} ... />
 * ```
 *
 * Note: Type assertion needed because React Flow's EdgeTypes expects
 * generic edge components, but our components are typed with GraphEdgeData.
 */
export const graphEdgeTypes = {
  animated: AnimatedEdge,
  static: StaticEdge,
} as EdgeTypes

/**
 * Available edge type identifiers.
 */
export type GraphEdgeType = 'animated' | 'static'
