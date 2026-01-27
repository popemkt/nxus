/**
 * Graph Store Defaults
 *
 * Default values for all graph options.
 * Physics defaults are inspired by Obsidian's graph settings.
 */

import type {
  GraphDisplayOptions,
  GraphFilterOptions,
  GraphLocalGraphOptions,
  GraphPhysicsOptions,
  GraphStoreState,
  GraphViewOptions,
} from './types'

// ============================================================================
// Physics Defaults (Obsidian-inspired)
// ============================================================================

/**
 * Default physics options.
 * These values are calibrated to provide a balanced, readable graph layout.
 */
export const DEFAULT_PHYSICS: GraphPhysicsOptions = {
  centerForce: 0.5, // Moderate pull toward center
  repelForce: 200, // Strong enough to prevent overlap
  linkForce: 0.4, // Moderate connection tightness
  linkDistance: 100, // Standard edge length
}

/**
 * Physics value constraints for UI sliders.
 */
export const PHYSICS_CONSTRAINTS = {
  centerForce: { min: 0, max: 1, step: 0.05 },
  repelForce: { min: 0, max: 500, step: 10 },
  linkForce: { min: 0, max: 1, step: 0.05 },
  linkDistance: { min: 50, max: 300, step: 10 },
} as const

// ============================================================================
// Display Defaults
// ============================================================================

/**
 * Default display options.
 */
export const DEFAULT_DISPLAY: GraphDisplayOptions = {
  colorBy: 'supertag', // Color nodes by their supertag
  nodeLabels: 'hover', // Show labels on hover for performance
  edgeLabels: 'never', // Edge labels are usually noisy
  nodeSize: 'connections', // Size by connection count for importance visualization
  edgeStyle: 'solid', // Solid edges for clean, minimalist look (like Obsidian)
}

// ============================================================================
// Filter Defaults
// ============================================================================

/**
 * Default filter options.
 */
export const DEFAULT_FILTER: GraphFilterOptions = {
  includeTags: false, // Tags as nodes can add visual noise
  includeRefs: true, // Show reference connections by default
  includeHierarchy: true, // Show parent-child relationships
  showOrphans: true, // Show all nodes including orphans
  supertagFilter: [], // No filter = show all supertags
  searchQuery: '', // No search query
}

// ============================================================================
// Local Graph Defaults
// ============================================================================

/**
 * Default local graph options.
 */
export const DEFAULT_LOCAL_GRAPH: GraphLocalGraphOptions = {
  enabled: false, // Start with global view
  focusNodeId: null, // No focus node
  depth: 1, // Show direct connections only
  linkTypes: ['outgoing', 'incoming'], // Follow both directions
}

// ============================================================================
// View Defaults
// ============================================================================

/**
 * Default view options.
 */
export const DEFAULT_VIEW: GraphViewOptions = {
  renderer: '2d', // Start with 2D view (faster to load)
  layout: 'force', // Force-directed layout is more organic
}

// ============================================================================
// Complete Default State
// ============================================================================

/**
 * Complete default store state.
 */
export const DEFAULT_GRAPH_STORE_STATE: GraphStoreState = {
  physics: DEFAULT_PHYSICS,
  display: DEFAULT_DISPLAY,
  filter: DEFAULT_FILTER,
  localGraph: DEFAULT_LOCAL_GRAPH,
  view: DEFAULT_VIEW,
}
