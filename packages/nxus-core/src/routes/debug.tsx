import { NodeInspector } from '@/components/features/debug/node-inspector'
import { cn } from '@/lib/utils'
import type { AssembledNode } from '@/services/nodes/node.service'
import {
  getAllNodesServerFn,
  getSupertagsServerFn,
  searchNodesServerFn,
} from '@/services/nodes/search-nodes.server'
import {
  CaretDown,
  CaretRight,
  Cube,
  Database,
  Hash,
  MagnifyingGlass,
  TreeStructure,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'

export const Route = createFileRoute('/debug')({ component: DebugView })

function DebugView() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [supertagFilter, setSupertagFilter] = useState<string | null>(null)
  const [expandedSupertags, setExpandedSupertags] = useState<Set<string>>(
    new Set(),
  )

  // Fetch all supertags for the sidebar
  const { data: supertagsResult } = useQuery({
    queryKey: ['supertags'],
    queryFn: () => getSupertagsServerFn(),
    staleTime: 60000,
  })

  // Fetch nodes - either search results or all nodes
  const { data: nodesResult, isLoading } = useQuery({
    queryKey: ['debug-nodes', searchQuery, supertagFilter],
    queryFn: async () => {
      if (searchQuery.trim()) {
        return searchNodesServerFn({ query: searchQuery, limit: 100 })
      }
      return getAllNodesServerFn({
        supertagSystemId: supertagFilter || undefined,
        limit: 200,
      })
    },
    staleTime: 10000,
  })

  const nodes = nodesResult?.success ? nodesResult.nodes : []
  const supertags = supertagsResult?.success ? supertagsResult.supertags : []

  // Group nodes by supertag for display
  const groupedNodes = useMemo(() => {
    const groups = new Map<string, AssembledNode[]>()

    for (const node of nodes) {
      const supertagName =
        node.supertags.length > 0
          ? node.supertags.map((st) => st.content).join(', ')
          : 'No Supertag'

      if (!groups.has(supertagName)) {
        groups.set(supertagName, [])
      }
      groups.get(supertagName)!.push(node)
    }

    return groups
  }, [nodes])

  const toggleSupertag = (name: string) => {
    setExpandedSupertags((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  return (
    <div className="h-screen bg-background flex">
      {/* Left Sidebar - Supertag Browser */}
      <div className="w-64 border-r border-border flex flex-col bg-card/50">
        <div className="p-4 border-b border-border">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
            <TreeStructure className="size-4" />
            Supertags
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <button
            className={cn(
              'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors',
              !supertagFilter
                ? 'bg-primary/10 text-primary'
                : 'hover:bg-muted text-foreground',
            )}
            onClick={() => setSupertagFilter(null)}
          >
            All Nodes
          </button>
          {supertags.map((st) => (
            <button
              key={st.id}
              className={cn(
                'w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2',
                supertagFilter === st.systemId
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted text-foreground',
              )}
              onClick={() => setSupertagFilter(st.systemId)}
            >
              <Hash className="size-3 text-muted-foreground" />
              {st.content}
            </button>
          ))}
        </div>
      </div>

      {/* Center - Node Browser */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Search Bar */}
        <div className="p-4 border-b border-border">
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search all nodes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
            />
          </div>
        </div>

        {/* Node List */}
        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              Loading nodes...
            </div>
          ) : nodes.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-muted-foreground">
              No nodes found
            </div>
          ) : (
            <div className="space-y-4">
              {Array.from(groupedNodes.entries()).map(
                ([supertagName, groupNodes]) => (
                  <div key={supertagName} className="space-y-1">
                    <button
                      className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full"
                      onClick={() => toggleSupertag(supertagName)}
                    >
                      {expandedSupertags.has(supertagName) ? (
                        <CaretDown className="size-3" />
                      ) : (
                        <CaretRight className="size-3" />
                      )}
                      <Hash className="size-3" />
                      {supertagName}
                      <span className="text-muted-foreground/60 font-normal">
                        ({groupNodes.length})
                      </span>
                    </button>

                    {expandedSupertags.has(supertagName) && (
                      <div className="ml-5 space-y-1">
                        {groupNodes.map((node) => (
                          <button
                            key={node.id}
                            className={cn(
                              'w-full text-left px-3 py-2 rounded-lg transition-all group',
                              selectedNodeId === node.id
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-muted border border-transparent',
                            )}
                            onClick={() => setSelectedNodeId(node.id)}
                          >
                            <div className="flex items-start gap-2">
                              <Cube className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-medium truncate">
                                  {node.content || (
                                    <span className="text-muted-foreground italic">
                                      (no content)
                                    </span>
                                  )}
                                </div>
                                {node.systemId && (
                                  <div className="text-xs text-muted-foreground font-mono truncate">
                                    {node.systemId}
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
          )}
        </div>

        {/* Stats Bar */}
        <div className="px-4 py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground flex items-center gap-4">
          <span className="flex items-center gap-1">
            <Database className="size-3" />
            {nodes.length} nodes
          </span>
          {searchQuery && (
            <span className="text-primary">Searching: "{searchQuery}"</span>
          )}
        </div>
      </div>

      {/* Right Panel - Node Inspector */}
      <div className="w-[480px] border-l border-border flex flex-col bg-card/30">
        {selectedNode ? (
          <NodeInspector node={selectedNode} onNavigate={setSelectedNodeId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Cube className="size-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Select a node to inspect</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
