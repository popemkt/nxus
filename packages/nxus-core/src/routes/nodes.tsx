/**
 * Node Workbench - Main route for browsing and inspecting nodes
 *
 * A Tana-inspired interface for exploring the node-based architecture.
 *
 * Features:
 * - Supertag sidebar for filtering
 * - Node browser with search and grouping
 * - Node inspector for deep visualization
 * - Keyboard navigation
 */

import { Cube } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'

import { NodeBrowser } from '@/components/features/nodes/node-browser'
import { NodeInspector } from '@/components/features/nodes/node-inspector'
import { SupertagSidebar } from '@/components/features/nodes/supertag-sidebar'
import type { AssembledNode } from '@/services/nodes/node.service'
import {
    getAllNodesServerFn,
    getSupertagsServerFn,
    searchNodesServerFn,
} from '@/services/nodes/search-nodes.server'

export const Route = createFileRoute('/nodes')({ component: NodeWorkbench })

function NodeWorkbench() {
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

  const nodes: AssembledNode[] = nodesResult?.success ? nodesResult.nodes : []
  const supertags: AssembledNode[] = supertagsResult?.success
    ? supertagsResult.supertags
    : []

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  return (
    <div className="h-screen bg-background flex">
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
