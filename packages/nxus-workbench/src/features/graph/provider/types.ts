/**
 * Graph Provider Types
 *
 * Renderer-agnostic data types for the graph visualization system.
 * These types are consumed by both 2D (React Flow) and 3D (3d-force-graph) renderers.
 */

import type { AssembledNode } from '@nxus/db'

// ============================================================================
// Graph Node (renderer-agnostic)
// ============================================================================

/**
 * A node in the graph visualization.
 * Can represent a real node from the database or a virtual node (e.g., tag).
 */
export interface GraphNode {
  /** Unique identifier */
  id: string

  /** Display label */
  label: string

  /** Node type for visual differentiation */
  type: 'node' | 'tag' | 'supertag'

  /** Whether this is a synthesized node (e.g., tag nodes when includeTags=true) */
  isVirtual: boolean

  /** Supertag metadata for coloring and grouping */
  supertag: {
    id: string
    name: string
    color: string
  } | null

  /** Connection metrics for sizing and importance calculations */
  outgoingCount: number
  incomingCount: number
  totalConnections: number

  // State flags
  /** Node has no connections */
  isOrphan: boolean
  /** Matches current search/filter query */
  isMatched: boolean
  /** Is the current focus node in local graph mode */
  isFocused: boolean
  /** Within N degrees of the focus node */
  isInLocalGraph: boolean

  /** Reference to original AssembledNode data (null for virtual nodes) */
  sourceNode: AssembledNode | null
}

// ============================================================================
// Graph Edge (renderer-agnostic)
// ============================================================================

/** Types of relationships between nodes */
export type EdgeType = 'dependency' | 'backlink' | 'reference' | 'hierarchy' | 'tag'

/** Direction of the edge relative to a given node */
export type EdgeDirection = 'outgoing' | 'incoming'

/**
 * An edge (connection) between two nodes in the graph.
 */
export interface GraphEdge {
  /** Unique identifier (typically `${source}-${type}-${target}`) */
  id: string

  /** Source node ID */
  source: string

  /** Target node ID */
  target: string

  /** Type of relationship */
  type: EdgeType

  /** Optional label (e.g., field name) */
  label?: string

  /**
   * Direction semantics relative to source node.
   * - 'outgoing': source depends on / points to target
   * - 'incoming': target depends on / points to source (backlink)
   */
  direction: EdgeDirection

  // State flags
  /** Part of the focused node's direct connections */
  isHighlighted: boolean
  /** Within the local graph traversal */
  isInLocalGraph: boolean
}

// ============================================================================
// Graph Statistics
// ============================================================================

/**
 * Computed statistics about the graph.
 */
export interface GraphStats {
  /** Total number of nodes in the graph */
  totalNodes: number
  /** Total number of edges in the graph */
  totalEdges: number
  /** Number of nodes with no connections */
  orphanCount: number
  /** Number of connected components (disjoint subgraphs) */
  connectedComponents: number
}

// ============================================================================
// Graph Data (complete graph state)
// ============================================================================

/**
 * Complete graph data structure returned by the provider.
 * This is the primary interface consumed by renderers.
 */
export interface GraphData {
  /** All nodes in the graph */
  nodes: GraphNode[]

  /** All edges in the graph */
  edges: GraphEdge[]

  /** Consistent color mapping for supertags (supertag ID -> color hex) */
  supertagColors: Map<string, string>

  /** Computed graph statistics */
  stats: GraphStats
}

// ============================================================================
// Provider Options
// ============================================================================

/** Link types for local graph traversal */
export type LinkTraversalType = 'outgoing' | 'incoming' | 'both'

/**
 * Options for local graph mode (BFS traversal from focus node).
 */
export interface LocalGraphOptions {
  /** Whether local graph mode is enabled */
  enabled: boolean
  /** The node ID to center the local graph on */
  focusNodeId: string | null
  /** Traversal depth (1-3 degrees of separation) */
  depth: 1 | 2 | 3
  /** Which link directions to follow during traversal */
  linkTypes: LinkTraversalType[]
}

/**
 * Options for the graph data provider.
 * Controls what data is included and how it's filtered.
 */
export interface GraphDataOptions {
  // What to include
  /** Show tags as separate (virtual) nodes */
  includeTags: boolean
  /** Treat node-type property references as connections */
  includeRefs: boolean
  /** Show parent/child hierarchy edges */
  includeHierarchy: boolean

  // Filtering
  /** Only show nodes with these supertag IDs (empty = show all) */
  supertagFilter: string[]
  /** Highlight nodes matching this search query */
  searchQuery: string
  /** Include nodes with no connections */
  showOrphans: boolean

  // Local graph
  /** Local graph traversal options */
  localGraph: LocalGraphOptions
}

// ============================================================================
// Edge Extractor Types
// ============================================================================

/**
 * Context provided to edge extractors for resolving nodes.
 */
export interface EdgeExtractionContext {
  /** Map of node ID to GraphNode for quick lookups */
  nodeMap: Map<string, GraphNode>
  /** Map of node ID to AssembledNode for accessing properties */
  sourceNodeMap: Map<string, AssembledNode>
}

/**
 * Function signature for edge extractors.
 * Each extractor handles a specific relationship type.
 */
export type EdgeExtractor = (
  node: AssembledNode,
  context: EdgeExtractionContext,
) => GraphEdge[]

// ============================================================================
// Default Options
// ============================================================================

/**
 * Default local graph options.
 */
export const DEFAULT_LOCAL_GRAPH_OPTIONS: LocalGraphOptions = {
  enabled: false,
  focusNodeId: null,
  depth: 1,
  linkTypes: ['outgoing', 'incoming'],
}

/**
 * Default graph data options.
 */
export const DEFAULT_GRAPH_DATA_OPTIONS: GraphDataOptions = {
  includeTags: false,
  includeRefs: true,
  includeHierarchy: true,
  supertagFilter: [],
  searchQuery: '',
  showOrphans: true,
  localGraph: DEFAULT_LOCAL_GRAPH_OPTIONS,
}
