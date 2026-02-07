/**
 * Graph Store
 *
 * Shared Zustand store for graph options across 2D and 3D renderers.
 */

// Types
export type {
  ColorByOption,
  EdgeStyleOption,
  GraphDisplayOptions,
  GraphFilterOptions,
  GraphLocalGraphOptions,
  GraphPhysicsOptions,
  GraphStoreActions,
  GraphStoreState,
  GraphViewOptions,
  LabelVisibility,
  LayoutType,
  NodeSizeOption,
  RendererType,
  WorkbenchGraphStore,
} from './types'

// Defaults
export {
  DEFAULT_DISPLAY,
  DEFAULT_FILTER,
  DEFAULT_GRAPH_STORE_STATE,
  DEFAULT_LOCAL_GRAPH,
  DEFAULT_PHYSICS,
  DEFAULT_VIEW,
  PHYSICS_CONSTRAINTS,
} from './defaults'

// Store and hooks
export {
  graphStoreService,
  useGraphDisplay,
  useGraphFilter,
  useGraphLocalGraph,
  useGraphPhysics,
  useGraphStore,
  useGraphView,
} from './graph.store'
