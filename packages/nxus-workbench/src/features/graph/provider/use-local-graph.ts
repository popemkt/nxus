/**
 * Local Graph Filtering Hook
 *
 * Provides BFS-based traversal from a focus node to create local graph views.
 * Supports configurable depth and direction filtering.
 */

import { useMemo } from 'react'
import type {
  GraphData,
  GraphNode,
  GraphEdge,
  LocalGraphOptions,
  LinkTraversalType,
} from './types.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Result of local graph filtering
 */
export interface LocalGraphResult {
  /** Filtered graph data with local graph flags set */
  data: GraphData
  /** IDs of nodes within the local graph */
  localNodeIds: Set<string>
  /** IDs of edges within the local graph */
  localEdgeIds: Set<string>
  /** The focus node (if found) */
  focusNode: GraphNode | null
  /** Distance from focus node for each included node */
  nodeDistances: Map<string, number>
}

/**
 * Internal adjacency representation for BFS
 */
interface AdjacencyEntry {
  /** Node ID this entry connects to */
  nodeId: string
  /** Edge ID for the connection */
  edgeId: string
  /** Whether this is an outgoing edge from the current node */
  isOutgoing: boolean
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Build adjacency lists for efficient BFS traversal.
 * Creates both outgoing and incoming adjacency for each node.
 */
export function buildAdjacencyLists(
  edges: GraphEdge[],
): Map<string, AdjacencyEntry[]> {
  const adjacency = new Map<string, AdjacencyEntry[]>()

  for (const edge of edges) {
    // Add outgoing edge from source
    const sourceAdj = adjacency.get(edge.source) ?? []
    sourceAdj.push({
      nodeId: edge.target,
      edgeId: edge.id,
      isOutgoing: true,
    })
    adjacency.set(edge.source, sourceAdj)

    // Add incoming edge to target
    const targetAdj = adjacency.get(edge.target) ?? []
    targetAdj.push({
      nodeId: edge.source,
      edgeId: edge.id,
      isOutgoing: false,
    })
    adjacency.set(edge.target, targetAdj)
  }

  return adjacency
}

/**
 * Check if a traversal entry matches the allowed link types.
 */
function shouldTraverse(
  entry: AdjacencyEntry,
  linkTypes: LinkTraversalType[],
): boolean {
  if (linkTypes.includes('both')) {
    return true
  }
  if (entry.isOutgoing && linkTypes.includes('outgoing')) {
    return true
  }
  if (!entry.isOutgoing && linkTypes.includes('incoming')) {
    return true
  }
  return false
}

/**
 * Perform BFS traversal from the focus node.
 *
 * @param focusNodeId - The starting node ID
 * @param adjacency - Pre-computed adjacency lists
 * @param depth - Maximum traversal depth (1-3)
 * @param linkTypes - Which edge directions to follow
 * @returns Sets of node IDs and edge IDs within the local graph, plus distance map
 */
export function bfsTraversal(
  focusNodeId: string,
  adjacency: Map<string, AdjacencyEntry[]>,
  depth: number,
  linkTypes: LinkTraversalType[],
): { nodeIds: Set<string>; edgeIds: Set<string>; distances: Map<string, number> } {
  const nodeIds = new Set<string>([focusNodeId])
  const edgeIds = new Set<string>()
  const distances = new Map<string, number>([[focusNodeId, 0]])

  // BFS queue: [nodeId, currentDepth]
  const queue: Array<[string, number]> = [[focusNodeId, 0]]

  while (queue.length > 0) {
    const [currentNodeId, currentDepth] = queue.shift()!

    // Don't traverse beyond max depth
    if (currentDepth >= depth) {
      continue
    }

    const neighbors = adjacency.get(currentNodeId) ?? []

    for (const neighbor of neighbors) {
      // Check if we should traverse this edge based on link type filter
      if (!shouldTraverse(neighbor, linkTypes)) {
        continue
      }

      // Add the edge regardless of whether node was already visited
      // (edges between visited nodes at same depth should be included)
      edgeIds.add(neighbor.edgeId)

      // Only queue unvisited nodes
      if (!nodeIds.has(neighbor.nodeId)) {
        nodeIds.add(neighbor.nodeId)
        distances.set(neighbor.nodeId, currentDepth + 1)
        queue.push([neighbor.nodeId, currentDepth + 1])
      }
    }
  }

  return { nodeIds, edgeIds, distances }
}

/**
 * Filter graph data to only include nodes and edges within the local graph.
 * Also updates the isInLocalGraph and isFocused flags on nodes/edges.
 *
 * @param graphData - The full graph data
 * @param options - Local graph options
 * @returns LocalGraphResult with filtered/annotated data
 */
export function filterLocalGraph(
  graphData: GraphData,
  options: LocalGraphOptions,
): LocalGraphResult {
  const { enabled, focusNodeId, depth, linkTypes } = options

  // If local graph is disabled or no focus node, return all data with flags cleared
  if (!enabled || !focusNodeId) {
    return {
      data: {
        ...graphData,
        nodes: graphData.nodes.map((node) => ({
          ...node,
          isFocused: false,
          isInLocalGraph: false,
        })),
        edges: graphData.edges.map((edge) => ({
          ...edge,
          isInLocalGraph: false,
          isHighlighted: false,
        })),
      },
      localNodeIds: new Set(),
      localEdgeIds: new Set(),
      focusNode: null,
      nodeDistances: new Map(),
    }
  }

  // Check if focus node exists
  const focusNode = graphData.nodes.find((n) => n.id === focusNodeId) ?? null

  // If focus node doesn't exist in graph, return empty local graph
  if (!focusNode) {
    return {
      data: {
        ...graphData,
        nodes: graphData.nodes.map((node) => ({
          ...node,
          isFocused: false,
          isInLocalGraph: false,
        })),
        edges: graphData.edges.map((edge) => ({
          ...edge,
          isInLocalGraph: false,
          isHighlighted: false,
        })),
      },
      localNodeIds: new Set(),
      localEdgeIds: new Set(),
      focusNode: null,
      nodeDistances: new Map(),
    }
  }

  // Build adjacency and perform BFS
  const adjacency = buildAdjacencyLists(graphData.edges)
  const { nodeIds: localNodeIds, edgeIds: localEdgeIds, distances } = bfsTraversal(
    focusNodeId,
    adjacency,
    depth,
    linkTypes,
  )

  // Determine which edges should be highlighted (direct connections from focus)
  const directEdgeIds = new Set<string>()
  const focusAdjacency = adjacency.get(focusNodeId) ?? []
  for (const entry of focusAdjacency) {
    if (shouldTraverse(entry, linkTypes)) {
      directEdgeIds.add(entry.edgeId)
    }
  }

  // Update nodes with local graph flags
  const updatedNodes = graphData.nodes.map((node) => ({
    ...node,
    isFocused: node.id === focusNodeId,
    isInLocalGraph: localNodeIds.has(node.id),
  }))

  // Update edges with local graph flags
  const updatedEdges = graphData.edges.map((edge) => ({
    ...edge,
    isInLocalGraph: localEdgeIds.has(edge.id),
    isHighlighted: directEdgeIds.has(edge.id),
  }))

  return {
    data: {
      ...graphData,
      nodes: updatedNodes,
      edges: updatedEdges,
    },
    localNodeIds,
    localEdgeIds,
    focusNode: {
      ...focusNode,
      isFocused: true,
      isInLocalGraph: true,
    },
    nodeDistances: distances,
  }
}

/**
 * Get only the nodes and edges within the local graph (filtered view).
 * Unlike filterLocalGraph which annotates all nodes, this returns only local nodes.
 *
 * @param graphData - The full graph data
 * @param options - Local graph options
 * @returns Filtered GraphData containing only local graph elements
 */
export function getLocalGraphOnly(
  graphData: GraphData,
  options: LocalGraphOptions,
): GraphData {
  const result = filterLocalGraph(graphData, options)

  if (!options.enabled || !options.focusNodeId || !result.focusNode) {
    return graphData
  }

  // Filter to only local nodes and edges
  const filteredNodes = result.data.nodes.filter((node) =>
    result.localNodeIds.has(node.id),
  )
  const filteredEdges = result.data.edges.filter((edge) =>
    result.localEdgeIds.has(edge.id),
  )

  // Recompute stats for filtered graph
  const orphanCount = filteredNodes.filter((n) => n.isOrphan).length

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    supertagColors: graphData.supertagColors,
    stats: {
      totalNodes: filteredNodes.length,
      totalEdges: filteredEdges.length,
      orphanCount,
      // For local graph, typically 1 component (all connected to focus)
      connectedComponents: filteredNodes.length > 0 ? 1 : 0,
    },
  }
}

// ============================================================================
// React Hook
// ============================================================================

/**
 * React hook for local graph filtering.
 *
 * Transforms full GraphData into a local graph view based on options.
 * Supports two modes:
 * - Annotate mode (default): Returns full graph with isInLocalGraph flags
 * - Filter mode: Returns only nodes/edges within local graph
 *
 * @param graphData - The full graph data from useGraphData
 * @param options - Local graph options
 * @param filterMode - If true, return only local graph elements; if false, annotate all
 * @returns Filtered/annotated GraphData
 */
export function useLocalGraph(
  graphData: GraphData,
  options: LocalGraphOptions,
  filterMode: boolean = false,
): GraphData {
  return useMemo(() => {
    if (filterMode) {
      return getLocalGraphOnly(graphData, options)
    }
    return filterLocalGraph(graphData, options).data
  }, [graphData, options, filterMode])
}

/**
 * React hook for detailed local graph result.
 *
 * Returns additional metadata about the local graph traversal,
 * including distances and ID sets.
 *
 * @param graphData - The full graph data from useGraphData
 * @param options - Local graph options
 * @returns LocalGraphResult with detailed traversal info
 */
export function useLocalGraphResult(
  graphData: GraphData,
  options: LocalGraphOptions,
): LocalGraphResult {
  return useMemo(
    () => filterLocalGraph(graphData, options),
    [graphData, options],
  )
}
