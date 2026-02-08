/**
 * Graph Store Types
 *
 * Type definitions for the shared Zustand store that controls
 * physics, display, filtering, and view options for graph renderers.
 */

import type { LinkTraversalType } from '../provider/types'

// ============================================================================
// Physics Options
// ============================================================================

/**
 * Force simulation parameters for graph layout.
 * Based on Obsidian's graph physics controls.
 */
export interface GraphPhysicsOptions {
  /** Pull toward center (0-1, default 0.5) */
  centerForce: number
  /** Push nodes apart (0-500, default 200) */
  repelForce: number
  /** Connection tightness (0-1, default 0.4) */
  linkForce: number
  /** Target edge length in pixels (50-300, default 100) */
  linkDistance: number
}

// ============================================================================
// Display Options
// ============================================================================

/** What property to use for node coloring */
export type ColorByOption = 'supertag' | 'type' | 'none'

/** When to show labels */
export type LabelVisibility = 'always' | 'hover' | 'never'

/** How to size nodes */
export type NodeSizeOption = 'uniform' | 'connections'

/** Edge rendering style */
export type EdgeStyleOption = 'solid' | 'animated'

/**
 * Visual display options for the graph.
 */
export interface GraphDisplayOptions {
  /** What property to use for node coloring */
  colorBy: ColorByOption
  /** When to show node labels */
  nodeLabels: LabelVisibility
  /** When to show edge labels */
  edgeLabels: LabelVisibility
  /** How to size nodes */
  nodeSize: NodeSizeOption
  /** Edge rendering style (animated = directional particles) */
  edgeStyle: EdgeStyleOption
}

// ============================================================================
// Filter Options
// ============================================================================

/**
 * Filtering options for what nodes/edges to include.
 */
export interface GraphFilterOptions {
  /** Show tags as separate (virtual) nodes */
  includeTags: boolean
  /** Treat node-type property references as connections */
  includeRefs: boolean
  /** Show parent/child hierarchy edges */
  includeHierarchy: boolean
  /** Include nodes with no connections */
  showOrphans: boolean
  /** Only show nodes with these supertag IDs (empty = show all) */
  supertagFilter: string[]
  /** Highlight nodes matching this search query */
  searchQuery: string
}

// ============================================================================
// Local Graph Options
// ============================================================================

/**
 * Options for local graph mode (BFS traversal from focus node).
 */
export interface GraphLocalGraphOptions {
  /** Whether local graph mode is enabled */
  enabled: boolean
  /** The node ID to center the local graph on */
  focusNodeId: string | null
  /** Traversal depth (1-3 degrees of separation) */
  depth: 1 | 2 | 3
  /** Which link directions to follow during traversal */
  linkTypes: LinkTraversalType[]
}

// ============================================================================
// View Options
// ============================================================================

/** Available graph renderer types */
export type RendererType = '2d' | '3d'

/** Available layout algorithms (2D only) */
export type LayoutType = 'force' | 'hierarchical'

/**
 * View configuration options.
 */
export interface GraphViewOptions {
  /** Which renderer to use */
  renderer: RendererType
  /** Layout algorithm (2D only) */
  layout: LayoutType
}

// ============================================================================
// Complete Store State
// ============================================================================

/**
 * Complete graph store state with all option groups.
 */
export interface GraphStoreState {
  physics: GraphPhysicsOptions
  display: GraphDisplayOptions
  filter: GraphFilterOptions
  localGraph: GraphLocalGraphOptions
  view: GraphViewOptions
}

/**
 * Actions for updating store state.
 */
export interface GraphStoreActions {
  /** Update physics options (partial update) */
  setPhysics: (options: Partial<GraphPhysicsOptions>) => void
  /** Update display options (partial update) */
  setDisplay: (options: Partial<GraphDisplayOptions>) => void
  /** Update filter options (partial update) */
  setFilter: (options: Partial<GraphFilterOptions>) => void
  /** Update local graph options (partial update) */
  setLocalGraph: (options: Partial<GraphLocalGraphOptions>) => void
  /** Update view options (partial update) */
  setView: (options: Partial<GraphViewOptions>) => void
  /** Reset all options to defaults */
  resetToDefaults: () => void
}

/**
 * Complete graph store type combining state and actions.
 */
export type WorkbenchGraphStore = GraphStoreState & GraphStoreActions
