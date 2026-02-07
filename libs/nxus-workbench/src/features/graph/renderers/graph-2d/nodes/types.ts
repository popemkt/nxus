/**
 * Node Component Types
 *
 * Shared types for React Flow node components in the 2D graph renderer.
 */

import type { GraphNode } from '../../../provider/types'
import type { LabelVisibility, NodeSizeOption } from '../../../store/types'

/**
 * Data passed to React Flow node components.
 * Extends GraphNode with display options from the store.
 */
export interface GraphNodeData extends GraphNode {
  /** How to size the node */
  nodeSize: NodeSizeOption
  /** When to show the label */
  labelVisibility: LabelVisibility
  /** Whether this node matches hover state from external interaction */
  isHovered: boolean
}

/**
 * Props for custom React Flow node components.
 */
export interface GraphNodeProps {
  /** Node data */
  data: GraphNodeData
  /** Whether node is selected in React Flow */
  selected?: boolean
}

/**
 * Calculate node size based on connection count and sizing option.
 *
 * @param totalConnections - Number of connections for the node
 * @param sizeOption - 'uniform' | 'connections'
 * @param baseSize - Base size in pixels
 * @returns Calculated size in pixels
 */
export function calculateNodeSize(
  totalConnections: number,
  sizeOption: NodeSizeOption,
  baseSize: number = 24,
): number {
  if (sizeOption === 'uniform') {
    return baseSize
  }

  // Scale by connections: min 0.8x, max 2.5x
  const scaleFactor = Math.min(0.8 + totalConnections * 0.15, 2.5)
  return Math.round(baseSize * scaleFactor)
}

/**
 * Determine if label should be visible based on visibility option and state.
 */
export function shouldShowLabel(
  visibility: LabelVisibility,
  isHovered: boolean,
  isFocused: boolean,
): boolean {
  switch (visibility) {
    case 'always':
      return true
    case 'hover':
      return isHovered || isFocused
    case 'never':
      return false
    default:
      return false
  }
}
