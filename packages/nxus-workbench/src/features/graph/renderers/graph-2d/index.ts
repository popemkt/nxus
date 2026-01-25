/**
 * 2D Graph Renderer
 *
 * React Flow-based graph visualization with force-directed and hierarchical layouts.
 */

// Main component
export { Graph2D, default as Graph2DComponent } from './Graph2D'
export type { Graph2DProps } from './Graph2D'

// Node components
export {
  graphNodeTypes,
  DetailedNode,
  SimpleNode,
  calculateNodeSize,
  shouldShowLabel,
} from './nodes'
export type { GraphNodeType, GraphNodeData, GraphNodeProps } from './nodes'

// Edge components
export {
  graphEdgeTypes,
  AnimatedEdge,
  StaticEdge,
  EDGE_DIRECTION_COLORS,
  EDGE_TYPE_COLORS,
  DEFAULT_EDGE_COLOR,
  DIMMED_EDGE_COLOR,
  EDGE_OPACITY,
  getEdgeColor,
  getEdgeOpacity,
  getEdgeStrokeWidth,
  shouldShowEdgeLabel,
} from './edges'
export type { GraphEdgeType, GraphEdgeData, GraphEdgeProps } from './edges'

// Layout hooks
export {
  useGraphLayout,
  useDagreLayout,
  useForceLayout,
} from './layouts'
export type {
  UseGraphLayoutOptions,
  UseDagreLayoutOptions,
  UseForceLayoutOptions,
  DagreDirection,
  HandlePosition,
  LayoutType,
  LayoutResult,
  SimulationState,
} from './layouts'
