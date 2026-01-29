/**
 * QueryResultsView - Display query builder and results
 *
 * This is the third sidebar view in the workbench, alongside List and Graph views.
 * It provides a dedicated space for building queries and viewing their results.
 *
 * Features:
 * - Query builder panel at the top
 * - Results list grouped by supertag (similar to NodeBrowser)
 * - Keyboard navigation
 * - Integration with saved queries
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CaretDown,
  CaretRight,
  Funnel,
  Hash,
  Database,
} from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import type { AssembledNode, QueryDefinition } from '@nxus/db'
import { NodeBadge } from '../shared/index.js'
import { QueryBuilderWithSaved } from '../../features/query-builder/index.js'
import { useQueryEvaluation } from '../../hooks/use-query.js'
import { useQueryStore } from '../../stores/query.store.js'

// ============================================================================
// Types
// ============================================================================

export interface QueryResultsViewProps {
  /** Currently selected node ID */
  selectedNodeId: string | null
  /** Called when a node is selected */
  onSelectNode: (nodeId: string) => void
}

// ============================================================================
// Component
// ============================================================================

export function QueryResultsView({
  selectedNodeId,
  onSelectNode,
}: QueryResultsViewProps) {
  // Query state
  const {
    currentQuery,
    setCurrentQuery,
  } = useQueryStore()

  const [loadedQueryId, setLoadedQueryId] = useState<string | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [focusedIndex, setFocusedIndex] = useState<number>(-1)

  // Evaluate query with debounce
  const hasFilters = (currentQuery.filters?.length ?? 0) > 0
  const { nodes, totalCount, isLoading, isError, error } = useQueryEvaluation(
    currentQuery,
    {
      enabled: hasFilters,
      debounceMs: 300,
    }
  )

  // Group nodes by supertag
  const groupedNodes = useMemo(() => {
    const groups = new Map<string, AssembledNode[]>()

    for (const node of nodes) {
      const supertagName =
        node.supertags.length > 0
          ? node.supertags
              .map((st: { id: string; content: string; systemId: string | null }) => st.content)
              .join(', ')
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
          setFocusedIndex((prev) => Math.min(prev + 1, flatNodeList.length - 1))
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

  // Track if we've done the initial auto-expand
  const hasAutoExpanded = useRef(false)

  // Auto-expand first group only on initial load
  useEffect(() => {
    if (!hasAutoExpanded.current && groupedNodes.size > 0) {
      const firstGroup = groupedNodes.keys().next().value
      if (firstGroup) {
        setExpandedGroups(new Set([firstGroup]))
        hasAutoExpanded.current = true
      }
    }
  }, [groupedNodes])

  // Reset auto-expand when query changes
  useEffect(() => {
    hasAutoExpanded.current = false
  }, [currentQuery])

  // Handle query change
  const handleQueryChange = useCallback(
    (query: QueryDefinition) => {
      setCurrentQuery(query)
    },
    [setCurrentQuery]
  )

  return (
    <div className="flex-1 flex flex-col min-w-0">
      {/* Query Builder Panel */}
      <div className="border-b border-border bg-card/50">
        <QueryBuilderWithSaved
          value={currentQuery}
          onChange={handleQueryChange}
          loadedQueryId={loadedQueryId}
          onQueryIdChange={setLoadedQueryId}
          showExecute={false}
          showSave={true}
          showSort={true}
          showLinter={true}
          resultCount={totalCount}
          isLoading={isLoading}
          isError={isError}
          errorMessage={error?.message}
          compact={false}
        />
      </div>

      {/* Results List */}
      <div className="flex-1 overflow-y-auto pt-2">
        {!hasFilters ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Funnel className="size-12 mb-3 opacity-30" />
            <p className="text-sm">Add filters to search</p>
            <p className="text-xs mt-1">Build a query to find nodes</p>
          </div>
        ) : isLoading ? (
          <div className="flex items-center justify-center h-32 text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="size-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              Searching...
            </div>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground">
            <Funnel className="size-12 mb-3 opacity-30" />
            <p className="text-sm">No results found</p>
            <p className="text-xs mt-1">Try adjusting your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Array.from(groupedNodes.entries()).map(
              ([supertagName, groupNodes]) => (
                <div key={supertagName} className="space-y-1">
                  {/* Group Header */}
                  <button
                    className="flex items-center gap-2 px-4 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full"
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
                    <div className="ml-5 pt-1 pb-2 space-y-1">
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
          {totalCount} results
        </span>
        {hasFilters && (
          <span className="text-primary">
            {currentQuery.filters?.length ?? 0} filter
            {(currentQuery.filters?.length ?? 0) !== 1 ? 's' : ''}
          </span>
        )}
        <span className="ml-auto text-muted-foreground/60">
          ↑↓ navigate • Enter select
        </span>
      </div>
    </div>
  )
}
