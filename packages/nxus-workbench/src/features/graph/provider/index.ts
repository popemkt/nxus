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

// Main hook
export {
  useGraphData,
  transformToGraphData,
  isLargeGraph,
  LARGE_GRAPH_THRESHOLD,
} from './use-graph-data.js'

// Edge extractors
export {
  extractAllEdges,
  createExtractionContext,
  extractDependencyEdges,
  extractBacklinkEdges,
  extractReferenceEdges,
  extractHierarchyEdges,
  buildBacklinkMap,
  buildChildrenMap,
} from './extractors/index.js'

// Local graph filtering
export {
  useLocalGraph,
  useLocalGraphResult,
  filterLocalGraph,
  getLocalGraphOnly,
  buildAdjacencyLists,
  bfsTraversal,
} from './use-local-graph.js'

export type { LocalGraphResult } from './use-local-graph.js'

// Utilities
export {
  // Color palette
  DEFAULT_SUPERTAG_COLORS,
  NO_SUPERTAG_COLOR,
  VIRTUAL_NODE_COLOR,
  getSupertagColor,
  generateSupertagColorMap,
  adjustBrightness,
  getDimmedColor,
  getHighlightedColor,
  // Graph statistics
  computeGraphStats,
  countConnectedComponents,
  countOrphans,
  computeConnectionMetrics,
  getMostConnectedNodes,
  getEdgeTypeDistribution,
  // Tag synthesis
  synthesizeTags,
  mergeTagSynthesis,
} from './utils/index.js'

export type { TagSynthesisResult } from './utils/index.js'
