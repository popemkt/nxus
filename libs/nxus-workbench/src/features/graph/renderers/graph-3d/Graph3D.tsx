/**
 * Graph3D Component
 *
 * Main 3D graph renderer using 3d-force-graph.
 * Converts GraphData from the provider into an interactive 3D visualization.
 *
 * Features:
 * - Force-directed 3D layout with physics controls
 * - Directional particles showing edge direction
 * - Orbit camera controls
 * - Node selection and focus
 * - Lazy-loaded to avoid bundle bloat
 */

import { useEffect, useMemo, useCallback, useState } from 'react'
import type { GraphData, GraphNode, GraphEdge } from '../../provider/types'
import {
  useGraphStore,
  useGraphPhysics,
  useGraphDisplay,
  useGraphLocalGraph,
} from '../../store'
import { useLazyForceGraph } from './use-lazy-force-graph'
import { Graph3DLoading } from './Graph3DLoading'
import { use3DGraph, type Graph3DNode, type Graph3DLink, type Graph3DData } from './use-3d-graph'

// ============================================================================
// Types
// ============================================================================

export interface Graph3DProps {
  /** Graph data from the provider */
  data: GraphData
  /** Callback when a node is clicked (for selection) */
  onNodeClick?: (nodeId: string, node: GraphNode) => void
  /** Callback when a node is double-clicked (for navigation) */
  onNodeDoubleClick?: (nodeId: string, node: GraphNode) => void
  /** Callback when background is clicked (clear selection) */
  onBackgroundClick?: () => void
  /** Currently selected node ID */
  selectedNodeId?: string | null
  /** CSS class name */
  className?: string
}

// ============================================================================
// Data Conversion
// ============================================================================

/**
 * Convert GraphNode[] to Graph3DNode[] for 3d-force-graph
 */
function convertToGraph3DNodes(
  graphNodes: GraphNode[],
  nodeSize: 'uniform' | 'connections',
  selectedNodeId: string | null,
): Graph3DNode[] {
  return graphNodes.map((node) => ({
    // GraphNode properties
    id: node.id,
    label: node.label,
    type: node.type,
    isVirtual: node.isVirtual,
    supertag: node.supertag,
    outgoingCount: node.outgoingCount,
    incomingCount: node.incomingCount,
    totalConnections: node.totalConnections,
    isOrphan: node.isOrphan,
    isMatched: node.isMatched,
    isFocused: node.isFocused,
    isInLocalGraph: node.isInLocalGraph,
    isHighlighted: node.id === selectedNodeId,
    // Display options
    nodeSize,
    isHovered: false,
  }))
}

/**
 * Convert GraphEdge[] to Graph3DLink[] for 3d-force-graph
 */
function convertToGraph3DLinks(graphEdges: GraphEdge[]): Graph3DLink[] {
  return graphEdges.map((edge) => ({
    // GraphEdge properties
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: edge.type,
    label: edge.label,
    direction: edge.direction,
    isHighlighted: edge.isHighlighted,
    isInLocalGraph: edge.isInLocalGraph,
    // Display options
    isHovered: false,
  }))
}

// ============================================================================
// Inner Component (renders after lazy load)
// ============================================================================

interface Graph3DInnerProps extends Omit<Graph3DProps, 'className'> {
  /** ForceGraph3D constructor from lazy loader - typed as any to avoid complex generic issues */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ForceGraph3D: any
}

function Graph3DInner({
  data,
  onNodeClick,
  onNodeDoubleClick,
  onBackgroundClick,
  selectedNodeId,
  ForceGraph3D,
}: Graph3DInnerProps) {
  // Store hooks
  const physics = useGraphPhysics()
  const display = useGraphDisplay()
  const localGraph = useGraphLocalGraph()
  const setLocalGraph = useGraphStore((s) => s.setLocalGraph)

  // Local state
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  // Create node map for quick lookups
  const nodeMap = useMemo(() => {
    return new Map(data.nodes.map((n) => [n.id, n]))
  }, [data.nodes])

  // Convert GraphData to 3d-force-graph format
  // Note: selectedNodeId is NOT a dependency here — changing selection should not
  // rebuild graph data (which resets the simulation). isHighlighted is updated in-place below.
  const graph3DData = useMemo((): Graph3DData => {
    const nodes = convertToGraph3DNodes(
      data.nodes,
      display.nodeSize,
      selectedNodeId ?? null,
    )
    const links = convertToGraph3DLinks(data.edges)

    return { nodes, links }
  }, [data.nodes, data.edges, display.nodeSize])

  // Node click handler
  const handleNodeClick = useCallback(
    (node: Graph3DNode) => {
      const graphNode = nodeMap.get(node.id)
      if (graphNode && onNodeClick) {
        onNodeClick(node.id, graphNode)
      }
    },
    [nodeMap, onNodeClick],
  )

  // Node double-click handler (also handles local graph focus)
  const handleNodeDoubleClick = useCallback(
    (node: Graph3DNode) => {
      const graphNode = nodeMap.get(node.id)
      if (graphNode) {
        // If local graph is enabled, double-click changes focus
        if (localGraph.enabled) {
          setLocalGraph({ focusNodeId: node.id })
        }
        // Fire navigation callback
        if (onNodeDoubleClick) {
          onNodeDoubleClick(node.id, graphNode)
        }
      }
    },
    [nodeMap, localGraph.enabled, setLocalGraph, onNodeDoubleClick],
  )

  // Node hover handler
  const handleNodeHover = useCallback((node: Graph3DNode | null) => {
    setHoveredNodeId(node?.id ?? null)
  }, [])

  // Background click handler
  const handleBackgroundClick = useCallback(() => {
    setHoveredNodeId(null)
    onBackgroundClick?.()
  }, [onBackgroundClick])

  // Initialize 3D graph
  const {
    containerRef,
    setGraphData,
    refreshStyles,
    isPaused,
    pauseSimulation,
    resumeSimulation,
  } = use3DGraph({
    ForceGraph3D,
    physics,
    onNodeClick: handleNodeClick,
    onNodeRightClick: handleNodeDoubleClick, // Right-click for navigation/focus
    onNodeDoubleClick: handleNodeDoubleClick,
    onBackgroundClick: handleBackgroundClick,
    onNodeHover: handleNodeHover,
  })

  // Update graph data when it changes (structural changes only)
  useEffect(() => {
    setGraphData(graph3DData)
  }, [graph3DData, setGraphData])

  // Update isHighlighted in-place when selection changes (no simulation reset)
  useEffect(() => {
    for (const node of graph3DData.nodes) {
      node.isHighlighted = node.id === (selectedNodeId ?? null)
    }
    refreshStyles()
  }, [selectedNodeId, graph3DData.nodes, refreshStyles])

  return (
    <div className="relative h-full w-full overflow-hidden">
      {/* 3D Graph Container */}
      <div
        ref={containerRef}
        className="h-full w-full bg-background overflow-hidden"
        style={{ touchAction: 'none' }}
      />

      {/* Bottom bar: stats + simulation controls */}
      <div className="absolute bottom-4 left-4 flex items-center gap-3">
        <span className="text-xs text-muted-foreground">
          {data.stats.totalNodes} nodes · {data.stats.totalEdges} edges
          {data.stats.orphanCount > 0 && ` · ${data.stats.orphanCount} orphans`}
        </span>
        <button
          onClick={isPaused ? resumeSimulation : pauseSimulation}
          className="rounded-md bg-background/80 px-3 py-1.5 text-xs font-medium shadow-sm ring-1 ring-border transition-colors hover:bg-muted"
          title={isPaused ? 'Resume simulation' : 'Pause simulation'}
        >
          {isPaused ? '▶ Resume' : '⏸ Pause'}
        </button>
      </div>

      {/* Hovered node tooltip */}
      {hoveredNodeId && (
        <div className="absolute left-4 top-16 max-w-xs rounded-md bg-background/90 px-3 py-2 shadow-lg ring-1 ring-border backdrop-blur z-10">
          <p className="text-sm font-medium">{nodeMap.get(hoveredNodeId)?.label}</p>
          {nodeMap.get(hoveredNodeId)?.supertag && (
            <p
              className="mt-0.5 text-xs"
              style={{ color: nodeMap.get(hoveredNodeId)?.supertag?.color }}
            >
              #{nodeMap.get(hoveredNodeId)?.supertag?.name}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            {nodeMap.get(hoveredNodeId)?.totalConnections ?? 0} connections
          </p>
        </div>
      )}
    </div>
  )
}

// ============================================================================
// Main Component (handles lazy loading)
// ============================================================================

/**
 * Graph3D - 3D graph visualization using 3d-force-graph.
 *
 * This component lazy-loads the 3D libraries (three.js, 3d-force-graph) to avoid
 * bundle bloat. A loading indicator is shown while the libraries are loading.
 *
 * Features:
 * - Force-directed 3D layout with physics controls
 * - Directional particles showing edge direction (teal = outgoing, violet = incoming)
 * - Orbit camera controls (drag to rotate, scroll to zoom)
 * - Node selection and navigation
 * - Focus camera on nodes
 *
 * @example
 * ```tsx
 * <Graph3D
 *   data={graphData}
 *   onNodeClick={(id, node) => setSelectedNode(id)}
 *   onNodeDoubleClick={(id, node) => navigate(`/node/${id}`)}
 *   selectedNodeId={selectedNode}
 * />
 * ```
 */
export function Graph3D({ className, ...props }: Graph3DProps) {
  const {
    ForceGraph3D,
    isLoading,
    isError,
    error,
    load,
  } = useLazyForceGraph({ autoLoad: true })

  // Show loading state
  if (isLoading || (!ForceGraph3D && !isError)) {
    return (
      <div className={className} style={{ width: '100%', height: '100%' }}>
        <Graph3DLoading />
      </div>
    )
  }

  // Show error state
  if (isError) {
    return (
      <div className={className} style={{ width: '100%', height: '100%' }}>
        <Graph3DLoading error={error} onRetry={load} />
      </div>
    )
  }

  // Render 3D graph
  return (
    <div className={className} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
      <Graph3DInner {...props} ForceGraph3D={ForceGraph3D!} />
    </div>
  )
}

export default Graph3D
