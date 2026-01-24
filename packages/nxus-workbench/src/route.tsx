/**
 * NodeWorkbenchRoute - Main route component for the Node Workbench
 *
 * A Tana-inspired interface for exploring the node-based architecture.
 * This component composes NodeBrowser, NodeInspector, and SupertagSidebar
 * to provide a full node exploration experience.
 *
 * Features:
 * - Supertag sidebar for filtering
 * - Node browser with search and grouping
 * - Node inspector for deep visualization
 * - Keyboard navigation
 */

import { Cube } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { NodeBrowser } from './components/node-browser/index.js'
import { NodeInspector } from './components/node-inspector/index.js'
import { SupertagSidebar } from './components/supertag-sidebar/index.js'
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
 * Provides the complete three-panel layout:
 * - Left: Supertag filter sidebar
 * - Center: Node browser with search
 * - Right: Node inspector
 */
export function NodeWorkbenchRoute({ className }: NodeWorkbenchRouteProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [supertagFilter, setSupertagFilter] = useState<string | null>(null)

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

  return (
    <div className={`h-screen bg-background flex ${className || ''}`}>
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
        onSelectNode={setSelectedNodeId}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        isLoading={nodesLoading}
      />

      {/* Right Panel - Node Inspector */}
      <div className="w-[480px] border-l border-border flex flex-col bg-card/30">
        {selectedNode ? (
          <NodeInspector node={selectedNode} onNavigate={setSelectedNodeId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Cube className="size-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a node to inspect</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Use ↑↓ to navigate, Enter to select
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
