/**
 * NodeWorkbenchRoute - Main route component for the Node Workbench
 *
 * A Tana-inspired interface for exploring the node-based architecture.
 * This component composes NodeBrowser, NodeInspector, SupertagSidebar,
 * and GraphView to provide a full node exploration experience.
 *
 * Features:
 * - Sidebar for view mode switching (list/graph)
 * - Supertag sidebar for filtering
 * - Node browser with search and grouping
 * - Graph visualization with 2D/3D renderers
 * - Node inspector for deep visualization
 * - Keyboard navigation
 * - Bidirectional focus synchronization between views
 */

import { Cube } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import { NodeBrowser } from './components/node-browser/index.js'
import { NodeInspector } from './components/node-inspector/index.js'
import { SupertagSidebar } from './components/supertag-sidebar/index.js'
import { Sidebar, type ViewMode } from './components/layout/index.js'
import { GraphView } from './features/graph/index.js'
import { useGraphStore } from './features/graph/store/index.js'
import type { AssembledNode } from '@nxus/db'
import { getNodeServerFn } from './server/nodes.server.js'
import {
  getAllNodesServerFn,
  getSupertagsServerFn,
  searchNodesServerFn,
} from './server/search-nodes.server.js'

export interface NodeWorkbenchRouteProps {
  /** Custom class name for the container */
  className?: string
}

/**
 * NodeWorkbenchRoute - Full-page node workbench layout
 *
 * Provides the complete layout with view switching:
 * - Far Left: Sidebar for view mode switching (list/graph)
 * - Left: Supertag filter sidebar (visible in list view)
 * - Center: Node browser (list view) or GraphView (graph view)
 * - Right: Node inspector
 *
 * Focus Synchronization:
 * - selectedNodeId is the single source of truth
 * - Selecting a node in NodeBrowser updates graph local focus
 * - Clicking a node in Graph updates NodeBrowser selection + NodeInspector
 * - Toggling local graph ON uses the current selectedNodeId as focus
 */
export function NodeWorkbenchRoute({ className }: NodeWorkbenchRouteProps) {
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // Node selection state (single source of truth)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [supertagFilter, setSupertagFilter] = useState<string | null>(null)

  // Graph store for local graph focus synchronization
  const { localGraph, setLocalGraph } = useGraphStore()

  // ============================================================================
  // Data Fetching
  // ============================================================================

  // Fetch all supertags for the sidebar
  const { data: supertagsResult, isLoading: supertagsLoading } = useQuery({
    queryKey: ['supertags'],
    queryFn: () => getSupertagsServerFn(),
    staleTime: 60000,
  })

  // Fetch nodes - either search results or all nodes
  const { data: nodesResult, isLoading: nodesLoading } = useQuery({
    queryKey: ['nodes', searchQuery, supertagFilter],
    queryFn: async () => {
      if (searchQuery.trim()) {
        return searchNodesServerFn({
          data: { query: searchQuery, limit: 100 },
        })
      }
      return getAllNodesServerFn({
        data: {
          supertagSystemId: supertagFilter || undefined,
          limit: 200,
        },
      })
    },
    staleTime: 10000,
  })

  // Fetch the selected node separately (for navigation to nodes outside current list)
  const { data: selectedNodeResult } = useQuery({
    queryKey: ['node', selectedNodeId],
    queryFn: () => getNodeServerFn({ data: { identifier: selectedNodeId! } }),
    enabled: !!selectedNodeId,
    staleTime: 30000,
  })

  const nodes: AssembledNode[] = nodesResult?.success ? nodesResult.nodes : []
  const supertags: AssembledNode[] = supertagsResult?.success
    ? supertagsResult.supertags
    : []

  // Prefer the separately fetched node (works even if not in filtered list)
  // Fall back to finding in the list for instant UI
  const selectedNode = selectedNodeResult?.success
    ? selectedNodeResult.node
    : nodes.find((n) => n.id === selectedNodeId)

  // ============================================================================
  // Focus Synchronization
  // ============================================================================

  /**
   * Handle node selection from NodeBrowser.
   * Updates selection and syncs local graph focus if local graph is enabled.
   */
  const handleNodeBrowserSelect = useCallback(
    (nodeId: string | null) => {
      setSelectedNodeId(nodeId)

      // Sync local graph focus when local graph is enabled
      if (localGraph.enabled && nodeId) {
        setLocalGraph({ focusNodeId: nodeId })
      }
    },
    [localGraph.enabled, setLocalGraph],
  )

  /**
   * Handle node click from GraphView.
   * Updates selection (which syncs Inspector) and local graph focus.
   */
  const handleGraphNodeClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId)

      // Update local graph focus when clicking in graph
      if (localGraph.enabled) {
        setLocalGraph({ focusNodeId: nodeId })
      }
    },
    [localGraph.enabled, setLocalGraph],
  )

  /**
   * Handle node double-click from GraphView.
   * Same as click for now - could navigate to node detail page in the future.
   */
  const handleGraphNodeDoubleClick = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId)

      // Always update focus on double-click (enables "drill down" behavior)
      if (localGraph.enabled) {
        setLocalGraph({ focusNodeId: nodeId })
      }
    },
    [localGraph.enabled, setLocalGraph],
  )

  /**
   * Handle background click in GraphView.
   * Clears selection but keeps local graph focus intact.
   */
  const handleGraphBackgroundClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  /**
   * Sync local graph focus when local graph is toggled ON.
   * Uses current selectedNodeId as the focus node.
   */
  useEffect(() => {
    // When local graph is enabled and we have a selection but no focus node,
    // set the selected node as the focus
    if (localGraph.enabled && selectedNodeId && !localGraph.focusNodeId) {
      setLocalGraph({ focusNodeId: selectedNodeId })
    }
  }, [localGraph.enabled, localGraph.focusNodeId, selectedNodeId, setLocalGraph])

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className={`h-screen bg-background flex ${className || ''}`}>
      {/* Far Left - View Mode Sidebar */}
      <Sidebar activeView={viewMode} onViewChange={setViewMode} />

      {/* List View: Supertag Sidebar + Node Browser */}
      {viewMode === 'list' && (
        <>
          {/* Left Sidebar - Supertag Browser */}
          <SupertagSidebar
            supertags={supertags}
            selectedSupertag={supertagFilter}
            onSelectSupertag={setSupertagFilter}
            isLoading={supertagsLoading}
          />

          {/* Center - Node Browser */}
          <NodeBrowser
            nodes={nodes}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleNodeBrowserSelect}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            isLoading={nodesLoading}
          />
        </>
      )}

      {/* Graph View */}
      {viewMode === 'graph' && (
        <div className="flex-1 h-full">
          <GraphView
            nodes={nodes}
            isLoading={nodesLoading}
            selectedNodeId={selectedNodeId}
            onNodeClick={handleGraphNodeClick}
            onNodeDoubleClick={handleGraphNodeDoubleClick}
            onBackgroundClick={handleGraphBackgroundClick}
          />
        </div>
      )}

      {/* Right Panel - Node Inspector (visible in both views) */}
      <div className="w-[480px] border-l border-border flex flex-col bg-card/30">
        {selectedNode ? (
          <NodeInspector node={selectedNode} onNavigate={setSelectedNodeId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Cube className="size-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a node to inspect</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                {viewMode === 'list'
                  ? 'Use ↑↓ to navigate, Enter to select'
                  : 'Click a node in the graph to select'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
