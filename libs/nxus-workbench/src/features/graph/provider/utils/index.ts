/**
 * Graph Provider Utilities
 *
 * Helper functions for graph data transformation and computation.
 */

// Color palette
export {
  DEFAULT_SUPERTAG_COLORS,
  NO_SUPERTAG_COLOR,
  VIRTUAL_NODE_COLOR,
  getSupertagColor,
  generateSupertagColorMap,
  adjustBrightness,
  getDimmedColor,
  getHighlightedColor,
} from './color-palette.js'

// Graph statistics
export {
  computeGraphStats,
  countConnectedComponents,
  countOrphans,
  computeConnectionMetrics,
  getMostConnectedNodes,
  getEdgeTypeDistribution,
} from './graph-stats.js'

// Tag synthesis
export type { TagSynthesisResult } from './tag-synthesizer.js'
export {
  synthesizeTags,
  mergeTagSynthesis,
} from './tag-synthesizer.js'
