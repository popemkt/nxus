/**
 * Graph Data Provider Hook
 *
 * Main hook for transforming AssembledNode[] into GraphData.
 * This is the primary interface between the node data layer and graph renderers.
 *
 * Responsibilities:
 * - Convert AssembledNodes to GraphNodes with supertag info and metrics
 * - Extract edges using modular extractors
 * - Optionally synthesize virtual tag nodes
 * - Compute graph statistics
 * - Generate consistent supertag color palette
 */

import { useMemo } from 'react'
import type { AssembledNode } from '@nxus/db'
import type {
  GraphData,
  GraphDataOptions,
  GraphNode,
} from './types.js'
import {
  DEFAULT_GRAPH_DATA_OPTIONS,
} from './types.js'
import {
  extractAllEdges,
  createExtractionContext,
} from './extractors/index.js'
import {
  generateSupertagColorMap,
  getSupertagColor,
  computeGraphStats,
  computeConnectionMetrics,
  synthesizeTags,
  mergeTagSynthesis,
} from './utils/index.js'

/**
 * Large graph threshold for performance considerations.
 * Above this threshold, we might want to offload to a Web Worker.
 */
export const LARGE_GRAPH_THRESHOLD = 500

/**
 * Transform AssembledNodes into renderer-agnostic GraphData.
 *
 * This is the core transformation function used by the hook.
 * It's exported separately for testing and non-React usage.
 *
 * @param sourceNodes - Raw AssembledNode data from the database
 * @param options - Configuration for what to include and how to filter
 * @returns Complete GraphData ready for rendering
 */
export function transformToGraphData(
  sourceNodes: AssembledNode[],
  options: GraphDataOptions = DEFAULT_GRAPH_DATA_OPTIONS,
): GraphData {
  // 1. Filter nodes based on options
  const filteredNodes = filterNodes(sourceNodes, options)

  // 2. Convert AssembledNodes to GraphNodes
  const { graphNodes, graphNodeMap } = convertToGraphNodes(
    filteredNodes,
    options,
  )

  // 3. Extract edges using modular extractors
  const context = createExtractionContext(filteredNodes, graphNodeMap)
  const edges = extractAllEdges(filteredNodes, context, {
    includeRefs: options.includeRefs,
    includeHierarchy: options.includeHierarchy,
  })

  // 4. Optionally synthesize virtual tag nodes
  if (options.includeTags) {
    const existingNodeIds = new Set(graphNodes.map((n) => n.id))
    const synthesis = synthesizeTags(filteredNodes, existingNodeIds)
    mergeTagSynthesis(graphNodes, edges, synthesis)
  }

  // 5. Compute connection metrics (updates nodes in place)
  computeConnectionMetrics(graphNodes, edges)

  // 6. Apply search highlighting
  if (options.searchQuery) {
    applySearchHighlighting(graphNodes, options.searchQuery)
  }

  // 7. Filter out orphans if requested
  const finalNodes = options.showOrphans
    ? graphNodes
    : graphNodes.filter((n) => !n.isOrphan)

  // Re-filter edges to only include edges between final nodes
  const finalNodeIds = new Set(finalNodes.map((n) => n.id))
  const finalEdges = edges.filter(
    (e) => finalNodeIds.has(e.source) && finalNodeIds.has(e.target),
  )

  // 8. Generate supertag color map
  const supertagIds = finalNodes
    .map((n) => n.supertag?.id)
    .filter((id): id is string => id !== undefined)
  const supertagColors = generateSupertagColorMap(supertagIds)

  // 9. Compute graph statistics
  const stats = computeGraphStats(finalNodes, finalEdges)

  return {
    nodes: finalNodes,
    edges: finalEdges,
    supertagColors,
    stats,
  }
}

/**
 * Filter source nodes based on options.
 */
function filterNodes(
  nodes: AssembledNode[],
  options: GraphDataOptions,
): AssembledNode[] {
  let filtered = nodes

  // Filter by supertag
  if (options.supertagFilter.length > 0) {
    const allowedSupertags = new Set(options.supertagFilter)
    filtered = filtered.filter((node) =>
      node.supertags.some((st) => allowedSupertags.has(st.id)),
    )
  }

  return filtered
}

/**
 * Convert AssembledNodes to GraphNodes.
 */
function convertToGraphNodes(
  sourceNodes: AssembledNode[],
  options: GraphDataOptions,
): { graphNodes: GraphNode[]; graphNodeMap: Map<string, GraphNode> } {
  const graphNodes: GraphNode[] = []
  const graphNodeMap = new Map<string, GraphNode>()

  for (const source of sourceNodes) {
    const graphNode = assembledNodeToGraphNode(source)

    // Apply search matching
    if (options.searchQuery) {
      graphNode.isMatched = matchesSearch(source, options.searchQuery)
    }

    graphNodes.push(graphNode)
    graphNodeMap.set(graphNode.id, graphNode)
  }

  return { graphNodes, graphNodeMap }
}

/**
 * Convert a single AssembledNode to a GraphNode.
 */
function assembledNodeToGraphNode(source: AssembledNode): GraphNode {
  // Get primary supertag (first one if multiple)
  const primarySupertag = source.supertags[0] ?? null

  const supertag = primarySupertag
    ? {
        id: primarySupertag.id,
        name: primarySupertag.content || 'Unknown',
        color: getSupertagColor(primarySupertag.id),
      }
    : null

  return {
    id: source.id,
    label: source.content || source.systemId || 'Untitled',
    type: 'node',
    isVirtual: false,
    supertag,
    // Connection metrics will be computed later
    outgoingCount: 0,
    incomingCount: 0,
    totalConnections: 0,
    // State flags - will be updated as needed
    isOrphan: true, // Default to true, will be updated after edge extraction
    isMatched: false,
    isFocused: false,
    isInLocalGraph: false,
    sourceNode: source,
  }
}

/**
 * Check if a node matches the search query.
 */
function matchesSearch(node: AssembledNode, query: string): boolean {
  if (!query) return false

  const lowerQuery = query.toLowerCase()

  // Match against content
  if (node.content?.toLowerCase().includes(lowerQuery)) {
    return true
  }

  // Match against systemId
  if (node.systemId?.toLowerCase().includes(lowerQuery)) {
    return true
  }

  // Match against supertag names
  for (const st of node.supertags) {
    if (st.content.toLowerCase().includes(lowerQuery)) {
      return true
    }
  }

  return false
}

/**
 * Apply search highlighting to graph nodes.
 */
function applySearchHighlighting(
  nodes: GraphNode[],
  query: string,
): void {
  const lowerQuery = query.toLowerCase()

  for (const node of nodes) {
    // Match against label
    if (node.label.toLowerCase().includes(lowerQuery)) {
      node.isMatched = true
      continue
    }

    // Match against supertag name
    if (node.supertag?.name.toLowerCase().includes(lowerQuery)) {
      node.isMatched = true
      continue
    }

    // For non-virtual nodes, check source node
    if (node.sourceNode) {
      node.isMatched = matchesSearch(node.sourceNode, query)
    }
  }
}

/**
 * React hook for transforming AssembledNodes into GraphData.
 *
 * Memoizes the transformation to avoid unnecessary recomputation.
 *
 * @param sourceNodes - Raw AssembledNode data from the database
 * @param options - Configuration for what to include and how to filter
 * @returns GraphData ready for rendering
 *
 * @example
 * ```tsx
 * function GraphView() {
 *   const { data: nodes } = useNodes()
 *   const graphData = useGraphData(nodes, {
 *     includeTags: true,
 *     includeRefs: true,
 *     showOrphans: false,
 *   })
 *
 *   return <Graph2D data={graphData} />
 * }
 * ```
 */
export function useGraphData(
  sourceNodes: AssembledNode[],
  options: Partial<GraphDataOptions> = {},
): GraphData {
  const mergedOptions: GraphDataOptions = {
    ...DEFAULT_GRAPH_DATA_OPTIONS,
    ...options,
    localGraph: {
      ...DEFAULT_GRAPH_DATA_OPTIONS.localGraph,
      ...options.localGraph,
    },
  }

  return useMemo(
    () => transformToGraphData(sourceNodes, mergedOptions),
    [
      sourceNodes,
      mergedOptions.includeTags,
      mergedOptions.includeRefs,
      mergedOptions.includeHierarchy,
      mergedOptions.supertagFilter,
      mergedOptions.searchQuery,
      mergedOptions.showOrphans,
      mergedOptions.localGraph.enabled,
      mergedOptions.localGraph.focusNodeId,
      mergedOptions.localGraph.depth,
      // Note: localGraph.linkTypes is an array - stringify for comparison
      JSON.stringify(mergedOptions.localGraph.linkTypes),
    ],
  )
}

/**
 * Check if graph is considered "large" and may benefit from optimization.
 *
 * @param nodeCount - Number of nodes in the graph
 * @returns true if the graph exceeds the large graph threshold
 */
export function isLargeGraph(nodeCount: number): boolean {
  return nodeCount > LARGE_GRAPH_THRESHOLD
}
