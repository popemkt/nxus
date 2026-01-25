/**
 * LightweightGraphView Component
 *
 * Optimized graph view for large datasets (500+ nodes).
 * Fetches data directly from the lightweight server endpoint,
 * avoiding full property assembly overhead.
 *
 * Use this component when:
 * - Displaying a global graph with many nodes
 * - Full node properties are not needed for display
 * - Performance is a priority over detail
 */

import { useMemo } from 'react'

import { Graph2D } from './renderers/graph-2d'
import { Graph3D } from './renderers/graph-3d'
import { GraphControls, RendererSwitcher, GraphLegend } from './controls'
import {
  useLightweightGraph,
  useLocalGraph,
  type GraphData,
  type GraphNode,
  type LightweightGraphOptions,
} from './provider'
import {
  useGraphFilter,
  useGraphLocalGraph,
  useGraphView,
} from './store'

// ============================================================================
// Types
// ============================================================================

export interface LightweightGraphViewProps {
  /** Options for the lightweight fetch */
  fetchOptions?: LightweightGraphOptions
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
// Helper Functions
// ============================================================================

/**
 * Build supertag name map from graph data for the legend.
 */
function buildSupertagNames(graphData: GraphData): Map<string, string> {
  const names = new Map<string, string>()

  for (const node of graphData.nodes) {
    if (node.supertag) {
      names.set(node.supertag.id, node.supertag.name)
    }
  }

  return names
}

// ============================================================================
// Loading Component
// ============================================================================

function LightweightGraphViewLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <span className="text-sm">Loading graph structure...</span>
        <span className="text-xs text-muted-foreground/60">
          Optimized for large graphs
        </span>
      </div>
    </div>
  )
}

// ============================================================================
// Error Component
// ============================================================================

function LightweightGraphViewError({
  error,
  onRetry,
}: {
  error: Error
  onRetry: () => void
}) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-12 w-12 text-destructive/50"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
          />
        </svg>
        <p className="text-sm">Failed to load graph</p>
        <p className="text-xs text-muted-foreground/60">{error.message}</p>
        <button
          onClick={onRetry}
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    </div>
  )
}

// ============================================================================
// Empty State Component
// ============================================================================

function LightweightGraphViewEmpty() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-2 text-muted-foreground">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-12 w-12 opacity-30"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
          />
        </svg>
        <p className="text-sm">No nodes to display</p>
        <p className="text-xs text-muted-foreground/60">
          The database appears to be empty
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * LightweightGraphView - Optimized graph for large datasets.
 *
 * This component fetches data directly from the lightweight endpoint
 * instead of receiving pre-loaded AssembledNode[].
 *
 * @example
 * ```tsx
 * function GlobalGraphPage() {
 *   return (
 *     <LightweightGraphView
 *       fetchOptions={{ limit: 1000 }}
 *       selectedNodeId={selectedId}
 *       onNodeClick={(id) => setSelectedId(id)}
 *     />
 *   )
 * }
 * ```
 */
export function LightweightGraphView({
  fetchOptions,
  onNodeClick,
  onNodeDoubleClick,
  onBackgroundClick,
  selectedNodeId,
  className,
}: LightweightGraphViewProps) {
  // Get store settings
  const filter = useGraphFilter()
  const localGraph = useGraphLocalGraph()
  const view = useGraphView()

  // Merge fetch options with filter settings
  const mergedFetchOptions = useMemo<LightweightGraphOptions>(
    () => ({
      ...fetchOptions,
      includeHierarchy: filter.includeHierarchy,
      includeReferences: filter.includeRefs,
    }),
    [fetchOptions, filter.includeHierarchy, filter.includeRefs],
  )

  // Fetch lightweight graph data
  const { data: rawGraphData, isLoading, error, refetch } = useLightweightGraph(
    mergedFetchOptions,
  )

  // Apply local graph filtering/annotation if we have data
  const graphData = useLocalGraph(
    rawGraphData ?? {
      nodes: [],
      edges: [],
      supertagColors: new Map(),
      stats: { totalNodes: 0, totalEdges: 0, orphanCount: 0, connectedComponents: 0 },
    },
    {
      enabled: localGraph.enabled && !!rawGraphData,
      focusNodeId: localGraph.focusNodeId,
      depth: localGraph.depth,
      linkTypes: localGraph.linkTypes,
    },
  )

  // Build supertag names for legend
  const supertagNames = useMemo(
    () => buildSupertagNames(graphData),
    [graphData],
  )

  // Determine which renderer to use
  const is3D = view.renderer === '3d'

  // Show loading state
  if (isLoading) {
    return (
      <div className={`relative h-full w-full ${className ?? ''}`}>
        <LightweightGraphViewLoading />
      </div>
    )
  }

  // Show error state
  if (error) {
    return (
      <div className={`relative h-full w-full ${className ?? ''}`}>
        <LightweightGraphViewError error={error} onRetry={refetch} />
      </div>
    )
  }

  // Show empty state
  if (!rawGraphData || graphData.nodes.length === 0) {
    return (
      <div className={`relative h-full w-full ${className ?? ''}`}>
        <LightweightGraphViewEmpty />
      </div>
    )
  }

  return (
    <div className={`relative h-full w-full ${className ?? ''}`}>
      {/* Graph Renderer */}
      {is3D ? (
        <Graph3D
          data={graphData}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onBackgroundClick={onBackgroundClick}
          selectedNodeId={selectedNodeId}
          className="h-full w-full"
        />
      ) : (
        <Graph2D
          data={graphData}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onBackgroundClick={onBackgroundClick}
          selectedNodeId={selectedNodeId}
          className="h-full w-full"
        />
      )}

      {/* Performance indicator */}
      <div className="absolute left-4 top-14 z-10">
        <div className="rounded-md bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          {graphData.stats.totalNodes} nodes • {graphData.stats.totalEdges} edges
        </div>
      </div>

      {/* Renderer Switcher (top-left) */}
      <div className="absolute left-4 top-4 z-10">
        <RendererSwitcher size="sm" />
      </div>

      {/* Graph Controls (top-right) */}
      <div className="absolute right-4 top-4 z-10">
        <GraphControls />
      </div>

      {/* Graph Legend (bottom-right) */}
      {graphData.supertagColors.size > 0 && (
        <div className="absolute bottom-4 right-4 z-10 max-h-[40vh] w-48 overflow-auto">
          <GraphLegend
            supertagColors={graphData.supertagColors}
            supertagNames={supertagNames}
          />
        </div>
      )}
    </div>
  )
}

export default LightweightGraphView
