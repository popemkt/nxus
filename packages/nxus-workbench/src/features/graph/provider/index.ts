/**
 * Graph Provider
 *
 * Renderer-agnostic data layer for graph visualization.
 * Transforms AssembledNode[] into GraphData for consumption by renderers.
 */

// Types
export type {
  GraphNode,
  GraphEdge,
  GraphData,
  GraphStats,
  GraphDataOptions,
  LocalGraphOptions,
  EdgeType,
  EdgeDirection,
  LinkTraversalType,
  EdgeExtractionContext,
  EdgeExtractor,
} from './types.js'

// Default options
export {
  DEFAULT_GRAPH_DATA_OPTIONS,
  DEFAULT_LOCAL_GRAPH_OPTIONS,
} from './types.js'
