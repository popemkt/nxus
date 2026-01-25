/**
 * 3D Graph Renderer
 *
 * Lazy-loaded 3D force-directed graph visualization using 3d-force-graph and Three.js.
 * The heavy 3D dependencies are only loaded when the user switches to 3D view mode.
 */

// Lazy loader utilities
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

// React hook for lazy loading
export { useLazyForceGraph } from './use-lazy-force-graph'
export type {
  UseLazyForceGraphResult,
  UseLazyForceGraphOptions,
} from './use-lazy-force-graph'

// Loading component
export { Graph3DLoading, default as Graph3DLoadingComponent } from './Graph3DLoading'
export type { Graph3DLoadingProps } from './Graph3DLoading'
