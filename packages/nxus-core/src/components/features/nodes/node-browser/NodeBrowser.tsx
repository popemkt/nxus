import { cn } from '@/lib/utils'
import type { AssembledNode } from '@/services/nodes/node.service'
import {
    CaretDown,
    CaretRight,
    Cube,
    Database,
    Hash,
    MagnifyingGlass,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { NodeBadge } from '../shared'

export interface NodeBrowserProps {
  nodes: AssembledNode[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  isLoading?: boolean
}

/**
 * NodeBrowser - Main panel for browsing and searching nodes
 *
 * Features:
 * - Search bar with instant filtering
 * - Nodes grouped by supertag
 * - Collapsible groups
 * - Keyboard navigation (up/down/enter)
 * - Stats bar showing count
 */
export function NodeBrowser({
  nodes,
  selectedNodeId,
  onSelectNode,
  searchQuery,
  onSearchChange,
  isLoading,
}: NodeBrowserProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  // Group nodes by supertag
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

  // Flat list for keyboard navigation
  const flatNodeList = useMemo(() => {
    const list: AssembledNode[] = []
    for (const [groupName, groupNodes] of groupedNodes) {
      if (expandedGroups.has(groupName)) {
        list.push(...groupNodes)
      }
    }
    return list
  }, [groupedNodes, expandedGroups])

  const toggleGroup = useCallback((name: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(name)) {
        next.delete(name)
      } else {
        next.add(name)
      }
      return next
    })
  }, [])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setFocusedIndex((prev) =>
            Math.min(prev + 1, flatNodeList.length - 1),
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setFocusedIndex((prev) => Math.max(prev - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (focusedIndex >= 0 && flatNodeList[focusedIndex]) {
            onSelectNode(flatNodeList[focusedIndex].id)
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [flatNodeList, focusedIndex, onSelectNode])

  // Auto-expand first group on load
  useEffect(() => {
    if (groupedNodes.size > 0 && expandedGroups.size === 0) {
      const firstGroup = groupedNodes.keys().next().value
      if (firstGroup) {
        setExpandedGroups(new Set([firstGroup]))
      }
    }
  }, [groupedNodes, expandedGroups.size])

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Search Bar */}
      <div className="p-4 border-b border-border">
        <div className="relative">
          <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search all nodes..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-muted/50 border border-border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-all"
          />
        </div>
      </div>

      {/* Node List */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Loading nodes...
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Cube className="size-12 mb-3 opacity-30" />
            <p className="text-sm">No nodes found</p>
            {searchQuery && (
              <p className="text-xs mt-1">Try a different search term</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(groupedNodes.entries()).map(
              ([supertagName, groupNodes]) => (
                <div key={supertagName} className="space-y-1">
                  {/* Group Header */}
                  <button
                    className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full"
                    onClick={() => toggleGroup(supertagName)}
                  >
                    {expandedGroups.has(supertagName) ? (
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

                  {/* Group Items */}
                  {expandedGroups.has(supertagName) && (
                    <div className="ml-5 space-y-1">
                      {groupNodes.map((node) => {
                        const globalIdx = flatNodeList.indexOf(node)
                        return (
                          <NodeBadge
                            key={node.id}
                            content={node.content}
                            systemId={node.systemId}
                            isSelected={selectedNodeId === node.id}
                            onClick={() => onSelectNode(node.id)}
                            className={cn(
                              globalIdx === focusedIndex &&
                                'ring-2 ring-primary/50',
                            )}
                          />
                        )
                      })}
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
        <span className="ml-auto text-muted-foreground/60">
          ↑↓ navigate • Enter select
        </span>
      </div>
    </div>
  )
}
