/**
 * GraphView Orchestrator
 *
 * Main component that orchestrates the graph visualization system.
 * Handles data fetching, transformation, and rendering with 2D/3D renderers.
 *
 * Features:
 * - Fetches nodes from server using React Query
 * - Transforms data using useGraphData hook
 * - Applies local graph filtering when enabled
 * - Renders Graph2D or Graph3D based on store settings
 * - Displays GraphControls, RendererSwitcher, and GraphLegend
 * - Handles node selection and navigation callbacks
 */

import { useMemo } from 'react'
import type { AssembledNode } from '@nxus/db'

import { Graph2D } from './renderers/graph-2d'
import { Graph3D } from './renderers/graph-3d'
import { GraphControls, RendererSwitcher, GraphLegend } from './controls'
import {
  useGraphData,
  useLocalGraph,
  type GraphData,
  type GraphDataOptions,
  type GraphNode,
} from './provider'
import {
  useGraphFilter,
  useGraphLocalGraph,
  useGraphView,
} from './store'

// ============================================================================
// Types
// ============================================================================

export interface GraphViewProps {
  /** Assembled nodes from the server */
  nodes: AssembledNode[]
  /** Optional loading state indicator */
  isLoading?: boolean
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
 * Build GraphDataOptions from store filter and local graph settings.
 */
function buildDataOptions(
  filter: ReturnType<typeof useGraphFilter>,
  localGraph: ReturnType<typeof useGraphLocalGraph>,
): GraphDataOptions {
  return {
    includeTags: filter.includeTags,
    includeRefs: filter.includeRefs,
    includeHierarchy: filter.includeHierarchy,
    showOrphans: filter.showOrphans,
    supertagFilter: filter.supertagFilter,
    searchQuery: filter.searchQuery,
    localGraph: {
      enabled: localGraph.enabled,
      focusNodeId: localGraph.focusNodeId,
      depth: localGraph.depth,
      linkTypes: localGraph.linkTypes,
    },
  }
}

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

function GraphViewLoading() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        <span className="text-sm">Loading graph data...</span>
      </div>
    </div>
  )
}

// ============================================================================
// Empty State Component
// ============================================================================

function GraphViewEmpty() {
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
          Try adjusting filters or adding more data
        </p>
      </div>
    </div>
  )
}

// ============================================================================
// Main Component
// ============================================================================

/**
 * GraphView - Main graph visualization orchestrator.
 *
 * This component:
 * 1. Takes AssembledNode[] data from the parent
 * 2. Transforms it to GraphData using the provider hooks
 * 3. Applies local graph filtering based on store settings
 * 4. Renders either Graph2D or Graph3D based on view settings
 * 5. Provides controls for physics, display, and filtering
 *
 * @example
 * ```tsx
 * function WorkbenchPage() {
 *   const { data: nodes = [] } = useQuery({
 *     queryKey: ['nodes'],
 *     queryFn: () => getAllNodesServerFn({ data: {} }),
 *   })
 *
 *   return (
 *     <GraphView
 *       nodes={nodes}
 *       selectedNodeId={selectedId}
 *       onNodeClick={(id) => setSelectedId(id)}
 *       onNodeDoubleClick={(id) => navigate(`/node/${id}`)}
 *     />
 *   )
 * }
 * ```
 */
export function GraphView({
  nodes,
  isLoading = false,
  onNodeClick,
  onNodeDoubleClick,
  onBackgroundClick,
  selectedNodeId,
  className,
}: GraphViewProps) {
  // Get store settings
  const filter = useGraphFilter()
  const localGraph = useGraphLocalGraph()
  const view = useGraphView()

  // Build data options from store
  const dataOptions = useMemo(
    () => buildDataOptions(filter, localGraph),
    [filter, localGraph],
  )

  // Transform AssembledNodes to GraphData
  const rawGraphData = useGraphData(nodes, dataOptions)

  // Apply local graph filtering/annotation
  // Memoize options to avoid new object reference on every render,
  // which would cause useLocalGraph to recompute and reset the 3D graph simulation.
  const localGraphOptions = useMemo(
    () => ({
      enabled: localGraph.enabled,
      focusNodeId: localGraph.focusNodeId,
      depth: localGraph.depth,
      linkTypes: localGraph.linkTypes,
    }),
    [localGraph.enabled, localGraph.focusNodeId, localGraph.depth, localGraph.linkTypes],
  )
  const graphData = useLocalGraph(rawGraphData, localGraphOptions)

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
        <GraphViewLoading />
      </div>
    )
  }

  // Show empty state
  if (nodes.length === 0) {
    return (
      <div className={`relative h-full w-full ${className ?? ''}`}>
        <GraphViewEmpty />
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

export default GraphView
