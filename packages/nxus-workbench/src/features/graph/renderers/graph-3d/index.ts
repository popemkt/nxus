/**
 * 3D Graph Renderer
 *
 * Lazy-loaded 3D force-directed graph visualization using 3d-force-graph and Three.js.
 * The heavy 3D dependencies are only loaded when the user switches to 3D view mode.
 */

// ============================================================================
// Main Component
// ============================================================================

export { Graph3D, default as Graph3DComponent } from './Graph3D'
export type { Graph3DProps } from './Graph3D'

// ============================================================================
// Lazy Loader Utilities
// ============================================================================

export {
  loadForceGraph3D,
  isForceGraph3DLoaded,
  preloadForceGraph3D,
  clearForceGraph3DCache,
} from './lazy-loader'
export type {
  ForceGraph3DConstructor,
  LazyLoadResult,
  LoadingState,
  ForceGraph3DInstance,
  ConfigOptions,
  NodeObject,
  LinkObject,
} from './lazy-loader'

// ============================================================================
// React Hooks
// ============================================================================

// Lazy loading hook
export { useLazyForceGraph } from './use-lazy-force-graph'
export type {
  UseLazyForceGraphResult,
  UseLazyForceGraphOptions,
} from './use-lazy-force-graph'

// 3D graph instance management hook
export { use3DGraph } from './use-3d-graph'
export type {
  Graph3DNode,
  Graph3DLink,
  Graph3DData,
  Use3DGraphOptions,
  Use3DGraphResult,
} from './use-3d-graph'

// ============================================================================
// Loading Component
// ============================================================================

export { Graph3DLoading } from './Graph3DLoading'
export type { Graph3DLoadingProps } from './Graph3DLoading'

// ============================================================================
// Rendering Utilities
// ============================================================================

// Node rendering
export {
  NODE_COLORS,
  NODE_TYPE_COLORS,
  SIZE_MULTIPLIERS,
  getNodeColor,
  getNodeSize,
  getNodeOpacity,
  computeNodeVisuals,
  createNodeObject,
  createNodeLabel,
  calculateNodeVal,
} from './node-renderer'
export type { NodeRenderOptions, NodeVisuals } from './node-renderer'

// Edge/link rendering
export {
  EDGE_DIRECTION_COLORS,
  EDGE_TYPE_COLORS,
  DIMMED_EDGE_COLOR,
  EDGE_WIDTHS,
  PARTICLE_SETTINGS,
  getEdgeColor,
  getEdgeWidth,
  getEdgeOpacity,
  getParticleCount,
  getParticleSpeed,
  computeEdgeVisuals,
  createLinkColorCallback,
  createLinkWidthCallback,
  createParticleCountCallback,
  createParticleSpeedCallback,
  createParticleColorCallback,
  createLinkObject,
  calculateLinkCurvature,
  createLinkCurvatureCallback,
} from './edge-renderer'
export type { EdgeRenderOptions, EdgeVisuals } from './edge-renderer'
