/**
 * Lightweight Graph Data Hook
 *
 * Provides efficient graph data fetching for large graphs (500+ nodes).
 * Uses the lightweight server endpoint that returns minimal data
 * without full property assembly.
 *
 * Key differences from useGraphData:
 * - Fetches data via server function (not from pre-loaded AssembledNodes)
 * - Returns minimal node structure (no sourceNode reference)
 * - More efficient for global graph views with many nodes
 */

import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'

// Import types from the client-safe types file (no server dependencies)
import type { GraphStructureResult } from '../../../server/graph.types.js'
// Import server function directly from .server.ts file (TanStack handles code splitting)
import { getGraphStructureServerFn } from '../../../server/graph.server.js'
import type { GraphData, GraphNode, GraphEdge } from './types.js'
import { getSupertagColor, computeGraphStats } from './utils/index.js'

// ============================================================================
// Types
// ============================================================================

export interface LightweightGraphOptions {
  /** Filter by supertag systemId (e.g., 'supertag:note') */
  supertagSystemId?: string
  /** Maximum number of nodes to fetch */
  limit?: number
  /** Include hierarchy (parent-child) edges */
  includeHierarchy?: boolean
  /** Include generic reference edges */
  includeReferences?: boolean
}

export interface UseLightweightGraphResult {
  /** The transformed graph data */
  data: GraphData | null
  /** Loading state */
  isLoading: boolean
  /** Error state */
  error: Error | null
  /** Refetch function */
  refetch: () => void
}

// ============================================================================
// Transformation Functions
// ============================================================================

/**
 * Transform lightweight server response to GraphData format.
 *
 * Converts the minimal LightweightGraphNode/Edge structures
 * to the full GraphNode/Edge format expected by renderers.
 */
export function transformLightweightToGraphData(
  result: GraphStructureResult,
): GraphData {
  const { nodes: lwNodes, edges: lwEdges, supertagNames } = result

  // Build node map for edge validation and metrics computation
  const nodeMap = new Map<string, GraphNode>()

  // Transform nodes
  const graphNodes: GraphNode[] = lwNodes.map((ln) => {
    const supertag = ln.supertagId
      ? {
          id: ln.supertagId,
          name: ln.supertagName || supertagNames[ln.supertagId] || 'Unknown',
          color: getSupertagColor(ln.supertagId),
        }
      : null

    const graphNode: GraphNode = {
      id: ln.id,
      label: ln.label,
      type: ln.systemId?.startsWith('supertag:') ? 'supertag' : 'node',
      isVirtual: false,
      supertag,
      outgoingCount: 0,
      incomingCount: 0,
      totalConnections: 0,
      isOrphan: true, // Will be updated after edge processing
      isMatched: false,
      isFocused: false,
      isInLocalGraph: false,
      sourceNode: null, // Lightweight nodes don't have full source
    }

    nodeMap.set(graphNode.id, graphNode)
    return graphNode
  })

  // Transform edges
  const graphEdges: GraphEdge[] = lwEdges.map((le) => ({
    id: `${le.source}-${le.type}-${le.target}`,
    source: le.source,
    target: le.target,
    type: le.type,
    direction: 'outgoing' as const,
    isHighlighted: false,
    isInLocalGraph: false,
  }))

  // Compute connection metrics
  for (const edge of graphEdges) {
    const sourceNode = nodeMap.get(edge.source)
    const targetNode = nodeMap.get(edge.target)

    if (sourceNode) {
      sourceNode.outgoingCount++
      sourceNode.totalConnections++
      sourceNode.isOrphan = false
    }

    if (targetNode) {
      targetNode.incomingCount++
      targetNode.totalConnections++
      targetNode.isOrphan = false
    }
  }

  // Generate supertag color map
  const supertagColors = new Map<string, string>()
  for (const node of graphNodes) {
    if (node.supertag && !supertagColors.has(node.supertag.id)) {
      supertagColors.set(node.supertag.id, node.supertag.color)
    }
  }

  // Compute statistics
  const stats = computeGraphStats(graphNodes, graphEdges)

  return {
    nodes: graphNodes,
    edges: graphEdges,
    supertagColors,
    stats,
  }
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook for fetching lightweight graph data from the server.
 *
 * Use this instead of useGraphData when:
 * - You need to display 500+ nodes
 * - You don't need full node properties
 * - You want to minimize initial load time
 *
 * @example
 * ```tsx
 * function GlobalGraphView() {
 *   const { data, isLoading } = useLightweightGraph({
 *     limit: 1000,
 *     includeHierarchy: true,
 *   })
 *
 *   if (isLoading) return <Loading />
 *   if (!data) return <Empty />
 *
 *   return <Graph2D data={data} />
 * }
 * ```
 */
export function useLightweightGraph(
  options: LightweightGraphOptions = {},
): UseLightweightGraphResult {
  const {
    supertagSystemId,
    limit = 1000,
    includeHierarchy = true,
    includeReferences = true,
  } = options

  const query = useQuery({
    queryKey: [
      'graph-structure',
      supertagSystemId,
      limit,
      includeHierarchy,
      includeReferences,
    ],
    queryFn: () =>
      getGraphStructureServerFn({
        data: {
          supertagSystemId,
          limit,
          includeHierarchy,
          includeReferences,
        },
      }),
    staleTime: 30000, // Cache for 30 seconds
  })

  const data = useMemo(() => {
    if (!query.data?.success) return null
    return transformLightweightToGraphData(query.data)
  }, [query.data])

  return {
    data,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    refetch: query.refetch,
  }
}

/**
 * Check if a graph should use lightweight fetching.
 *
 * Returns true if node count exceeds threshold and full properties
 * are not required.
 *
 * @param nodeCount - Known or estimated node count
 * @param requiresFullProperties - Whether the view needs full node properties
 */
export function shouldUseLightweightFetch(
  nodeCount: number,
  requiresFullProperties: boolean = false,
): boolean {
  // Never use lightweight if full properties are needed
  if (requiresFullProperties) return false

  // Use lightweight for large graphs
  return nodeCount > 500
}
