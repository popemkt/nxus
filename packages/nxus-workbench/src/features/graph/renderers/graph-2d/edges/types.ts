/**
 * Edge Component Types
 *
 * Shared types for React Flow edge components in the 2D graph renderer.
 */

import type { Position } from '@xyflow/react'
import type { GraphEdge, EdgeType, EdgeDirection } from '../../../provider/types'
import type { EdgeStyleOption, LabelVisibility } from '../../../store/types'

/**
 * Data passed to React Flow edge components.
 * Extends GraphEdge with display options from the store.
 */
export interface GraphEdgeData extends GraphEdge {
  /** Edge rendering style */
  edgeStyle: EdgeStyleOption
  /** When to show the label */
  labelVisibility: LabelVisibility
  /** Whether this edge is hovered from external interaction */
  isHovered: boolean
}

/**
 * Props for custom React Flow edge components.
 * Matches React Flow's EdgeProps structure but with required data.
 */
export interface GraphEdgeProps {
  /** Unique edge identifier */
  id: string
  /** Source node X coordinate */
  sourceX: number
  /** Source node Y coordinate */
  sourceY: number
  /** Target node X coordinate */
  targetX: number
  /** Target node Y coordinate */
  targetY: number
  /** Source handle position */
  sourcePosition: Position
  /** Target handle position */
  targetPosition: Position
  /** Edge data (required, unlike React Flow's optional data) */
  data: GraphEdgeData
  /** Whether the edge is selected */
  selected?: boolean
}

// ============================================================================
// Color Constants
// ============================================================================

/**
 * Colors for different edge directions.
 * Teal for outgoing, violet for incoming (matches common convention).
 */
export const EDGE_DIRECTION_COLORS: Record<EdgeDirection, string> = {
  outgoing: '#14b8a6', // Teal-500
  incoming: '#8b5cf6', // Violet-500
}

/**
 * Colors for different edge types.
 */
export const EDGE_TYPE_COLORS: Record<EdgeType, string> = {
  dependency: '#3b82f6', // Blue-500
  backlink: '#8b5cf6', // Violet-500
  reference: '#6b7280', // Gray-500
  hierarchy: '#22c55e', // Green-500
  tag: '#eab308', // Yellow-500
}

/**
 * Default edge color when type is unknown.
 */
export const DEFAULT_EDGE_COLOR = '#6b7280' // Gray-500

/**
 * Dimmed edge color for non-highlighted edges.
 */
export const DIMMED_EDGE_COLOR = '#374151' // Gray-700

/**
 * Edge opacity values for different states.
 */
export const EDGE_OPACITY = {
  normal: 0.6,
  highlighted: 1,
  dimmed: 0.15,
} as const

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get edge color based on direction or type.
 *
 * @param direction - Edge direction (outgoing/incoming)
 * @param type - Edge type for fallback coloring
 * @param useDirectionColors - Whether to use direction-based colors
 * @returns Hex color string
 */
export function getEdgeColor(
  direction: EdgeDirection,
  type: EdgeType,
  useDirectionColors: boolean = true,
): string {
  if (useDirectionColors) {
    return EDGE_DIRECTION_COLORS[direction] ?? DEFAULT_EDGE_COLOR
  }
  return EDGE_TYPE_COLORS[type] ?? DEFAULT_EDGE_COLOR
}

/**
 * Get edge opacity based on state.
 *
 * @param isHighlighted - Whether edge is highlighted (direct connection to focus)
 * @param isInLocalGraph - Whether edge is within local graph traversal
 * @returns Opacity value (0-1)
 */
export function getEdgeOpacity(
  isHighlighted: boolean,
  isInLocalGraph: boolean,
): number {
  if (isHighlighted) {
    return EDGE_OPACITY.highlighted
  }
  if (!isInLocalGraph) {
    return EDGE_OPACITY.dimmed
  }
  return EDGE_OPACITY.normal
}

/**
 * Determine if edge label should be visible based on visibility option and state.
 */
export function shouldShowEdgeLabel(
  visibility: LabelVisibility,
  isHovered: boolean,
  isHighlighted: boolean,
): boolean {
  switch (visibility) {
    case 'always':
      return true
    case 'hover':
      return isHovered || isHighlighted
    case 'never':
      return false
    default:
      return false
  }
}

/**
 * Get stroke width based on highlight state.
 */
export function getEdgeStrokeWidth(isHighlighted: boolean): number {
  return isHighlighted ? 2.5 : 1.5
}
