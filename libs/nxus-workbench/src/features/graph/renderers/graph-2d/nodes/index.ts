/**
 * 2D Graph Node Components
 *
 * Custom React Flow node components for the 2D graph renderer.
 */

export { DetailedNode } from './DetailedNode'
export { SimpleNode } from './SimpleNode'

// Types
export type { GraphNodeData, GraphNodeProps } from './types'
export { calculateNodeSize, shouldShowLabel } from './types'

// Node types map for React Flow registration
import type { NodeTypes } from '@xyflow/react'
import { DetailedNode } from './DetailedNode'
import { SimpleNode } from './SimpleNode'

/**
 * Map of custom node types for React Flow.
 *
 * Usage:
 * ```tsx
 * <ReactFlow nodeTypes={graphNodeTypes} ... />
 * ```
 */
export const graphNodeTypes: NodeTypes = {
  detailed: DetailedNode,
  simple: SimpleNode,
} as const

/**
 * Available node type identifiers.
 */
export type GraphNodeType = keyof typeof graphNodeTypes
