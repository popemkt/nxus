/**
 * graph.types.ts - Client-safe type exports for graph server functions
 *
 * This file contains only type definitions, no runtime code.
 * It can be safely imported in browser/client code without
 * pulling in server-only dependencies like better-sqlite3.
 *
 * Import from this file instead of graph.server.ts when you
 * only need types.
 */

// ============================================================================
// Lightweight Graph Types
// ============================================================================

/**
 * Lightweight node structure for graph visualization.
 * Contains only essential data for rendering - no full property assembly.
 */
export interface LightweightGraphNode {
  /** Node ID */
  id: string
  /** Display label (content or systemId) */
  label: string
  /** System ID if present */
  systemId: string | null
  /** Primary supertag ID */
  supertagId: string | null
  /** Primary supertag name */
  supertagName: string | null
  /** Owner ID for hierarchy */
  ownerId: string | null
}

/**
 * Lightweight edge structure for graph visualization.
 */
export interface LightweightGraphEdge {
  /** Source node ID */
  source: string
  /** Target node ID */
  target: string
  /** Edge type: 'dependency' | 'reference' | 'hierarchy' | 'backlink' */
  type: 'dependency' | 'reference' | 'hierarchy' | 'backlink'
}

/**
 * Complete lightweight graph structure result.
 */
export interface GraphStructureResult {
  success: true
  nodes: LightweightGraphNode[]
  edges: LightweightGraphEdge[]
  /** Map of supertag ID to name for color legend */
  supertagNames: Record<string, string>
}

/**
 * Recursive backlinks result with depth information.
 */
export interface RecursiveBacklinksResult {
  success: true
  /** Backlinks organized by depth level */
  backlinks: Array<{
    nodeId: string
    label: string
    supertagId: string | null
    depth: number
  }>
  /** Total count of unique backlinks */
  totalCount: number
}

/**
 * Edges between nodes result.
 */
export interface EdgesBetweenNodesResult {
  success: true
  edges: LightweightGraphEdge[]
}
