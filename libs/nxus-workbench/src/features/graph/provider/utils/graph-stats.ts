/**
 * Graph Statistics Utilities
 *
 * Functions for computing graph metrics and statistics.
 * Uses Union-Find for efficient connected component detection.
 */

import type { GraphEdge, GraphNode, GraphStats } from '../types.js'

/**
 * Compute comprehensive statistics for a graph.
 *
 * @param nodes - All nodes in the graph
 * @param edges - All edges in the graph
 * @returns GraphStats with computed metrics
 */
export function computeGraphStats(
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphStats {
  const totalNodes = nodes.length
  const totalEdges = edges.length
  const orphanCount = nodes.filter((n) => n.isOrphan).length
  const connectedComponents = countConnectedComponents(nodes, edges)

  return {
    totalNodes,
    totalEdges,
    orphanCount,
    connectedComponents,
  }
}

/**
 * Count connected components using Union-Find (Disjoint Set Union).
 *
 * Time complexity: O(n + m * α(n)) where α is the inverse Ackermann function
 * Space complexity: O(n)
 *
 * @param nodes - All nodes in the graph
 * @param edges - All edges connecting the nodes
 * @returns Number of connected components
 */
export function countConnectedComponents(
  nodes: GraphNode[],
  edges: GraphEdge[],
): number {
  if (nodes.length === 0) return 0

  // Build Union-Find structure
  const parent = new Map<string, string>()
  const rank = new Map<string, number>()

  // Initialize: each node is its own parent
  for (const node of nodes) {
    parent.set(node.id, node.id)
    rank.set(node.id, 0)
  }

  // Find with path compression
  const find = (id: string): string => {
    if (parent.get(id) !== id) {
      parent.set(id, find(parent.get(id)!))
    }
    return parent.get(id)!
  }

  // Union by rank
  const union = (id1: string, id2: string): void => {
    const root1 = find(id1)
    const root2 = find(id2)

    if (root1 === root2) return

    const rank1 = rank.get(root1)!
    const rank2 = rank.get(root2)!

    if (rank1 < rank2) {
      parent.set(root1, root2)
    } else if (rank1 > rank2) {
      parent.set(root2, root1)
    } else {
      parent.set(root2, root1)
      rank.set(root1, rank1 + 1)
    }
  }

  // Process all edges
  for (const edge of edges) {
    // Only process if both nodes exist
    if (parent.has(edge.source) && parent.has(edge.target)) {
      union(edge.source, edge.target)
    }
  }

  // Count unique roots
  const roots = new Set<string>()
  for (const node of nodes) {
    roots.add(find(node.id))
  }

  return roots.size
}

/**
 * Count the number of orphan nodes (nodes with no connections).
 *
 * @param nodes - All nodes in the graph
 * @returns Number of orphan nodes
 */
export function countOrphans(nodes: GraphNode[]): number {
  return nodes.filter((n) => n.totalConnections === 0).length
}

/**
 * Compute connection metrics for nodes based on edges.
 *
 * Updates outgoingCount, incomingCount, and totalConnections for each node.
 *
 * @param nodes - Mutable array of nodes to update
 * @param edges - All edges in the graph
 */
export function computeConnectionMetrics(
  nodes: GraphNode[],
  edges: GraphEdge[],
): void {
  // Build node map for quick lookup
  const nodeMap = new Map<string, GraphNode>()
  for (const node of nodes) {
    nodeMap.set(node.id, node)
  }

  // Reset all counts
  for (const node of nodes) {
    node.outgoingCount = 0
    node.incomingCount = 0
    node.totalConnections = 0
  }

  // Count connections from edges
  for (const edge of edges) {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)

    if (sourceNode) {
      sourceNode.outgoingCount++
      sourceNode.totalConnections++
    }

    if (targetNode) {
      targetNode.incomingCount++
      targetNode.totalConnections++
    }
  }

  // Mark orphans
  for (const node of nodes) {
    node.isOrphan = node.totalConnections === 0
  }
}

/**
 * Get the most connected nodes (hubs) in the graph.
 *
 * @param nodes - All nodes in the graph
 * @param limit - Maximum number of nodes to return
 * @returns Array of nodes sorted by total connections (descending)
 */
export function getMostConnectedNodes(
  nodes: GraphNode[],
  limit: number = 10,
): GraphNode[] {
  return [...nodes]
    .sort((a, b) => b.totalConnections - a.totalConnections)
    .slice(0, limit)
}

/**
 * Get edge type distribution in the graph.
 *
 * @param edges - All edges in the graph
 * @returns Map of edge type to count
 */
export function getEdgeTypeDistribution(
  edges: GraphEdge[],
): Map<string, number> {
  const distribution = new Map<string, number>()

  for (const edge of edges) {
    const count = distribution.get(edge.type) ?? 0
    distribution.set(edge.type, count + 1)
  }

  return distribution
}
