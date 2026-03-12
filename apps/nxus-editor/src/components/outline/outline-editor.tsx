import { useCallback, useEffect, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Hash } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { useOutlineStore } from '@/stores/outline.store'
import { useOutlineSync } from '@/hooks/use-outline-sync'
import { Breadcrumbs } from './breadcrumbs'
import { NodeBlock } from './node-block'
import { FieldsSection } from './fields-section'
import {
  getWorkspaceRootServerFn,
  getNodeTreeServerFn,
} from '@/services/outline.server'
import type { OutlineNode } from '@/types/outline'
import { WORKSPACE_ROOT_ID } from '@/types/outline'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'

export function OutlineEditor() {
  const { node: urlNodeId } = useSearch({ from: '/' })
  const nodes = useOutlineStore((s) => s.nodes)
  const rootNodeId = useOutlineStore((s) => s.rootNodeId)
  const setNodes = useOutlineStore((s) => s.setNodes)
  const setRootNodeId = useOutlineStore((s) => s.setRootNodeId)
  const deactivateNode = useOutlineStore((s) => s.deactivateNode)
  const activeNodeId = useOutlineStore((s) => s.activeNodeId)
  const selectedNodeId = useOutlineStore((s) => s.selectedNodeId)
  const activateNode = useOutlineStore((s) => s.activateNode)
  const selectNode = useOutlineStore((s) => s.selectNode)
  const toggleCollapse = useOutlineStore((s) => s.toggleCollapse)
  const getNextVisibleNode = useOutlineStore((s) => s.getNextVisibleNode)
  const getPreviousVisibleNode = useOutlineStore(
    (s) => s.getPreviousVisibleNode,
  )

  const { createNodeAfter, deleteNode } = useOutlineSync()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Sync URL search param → store rootNodeId (handles back/forward + bookmarks)
  useEffect(() => {
    const targetId = urlNodeId ?? WORKSPACE_ROOT_ID
    if (targetId !== useOutlineStore.getState().rootNodeId) {
      setRootNodeId(targetId)
    }
  }, [urlNodeId, setRootNodeId])

  // Load real data from DB on mount
  useEffect(() => {
    let cancelled = false

    async function loadData() {
      try {
        const rootResult = await getWorkspaceRootServerFn()
        if (cancelled) return

        if (!rootResult.success || rootResult.rootIds.length === 0) {
          setLoading(false)
          return
        }

        const nodeMap = new Map<string, OutlineNode>()
        const topLevelIds: string[] = []

        // Fetch tree for each root in parallel
        const rootIds: string[] = rootResult.rootIds
        const treeResults = await Promise.all(
          rootIds.map((rootId: string) =>
            getNodeTreeServerFn({ data: { nodeId: rootId } }),
          ),
        )
        if (cancelled) return

        for (let i = 0; i < rootIds.length; i++) {
          const treeResult = treeResults[i]!
          const rootId = rootIds[i]!

          if ('success' in treeResult && treeResult.success) {
            for (const n of (treeResult as { success: true; nodes: OutlineNode[]; rootId: string }).nodes) {
              nodeMap.set(n.id, {
                id: n.id,
                content: n.content,
                parentId: n.parentId,
                children: n.children,
                order: n.order,
                collapsed: n.collapsed,
                supertags: n.supertags,
                fields: n.fields ?? [],
                special: n.special ?? null,
              })
            }
            topLevelIds.push(rootId)
          }
        }

        // Create virtual workspace root to hold top-level nodes
        const workspaceRoot: OutlineNode = {
          id: WORKSPACE_ROOT_ID,
          content: 'Workspace',
          parentId: null,
          children: topLevelIds,
          order: '00000000',
          collapsed: false,
          supertags: [],
          fields: [],
          special: null,
        }
        nodeMap.set(WORKSPACE_ROOT_ID, workspaceRoot)

        // Remap top-level nodes to point to workspace root
        for (const id of topLevelIds) {
          const node = nodeMap.get(id)
          if (node && !node.parentId) {
            nodeMap.set(id, { ...node, parentId: WORKSPACE_ROOT_ID })
          }
        }

        setNodes(nodeMap)
        // Set initial root from URL param (or workspace root if no param)
        setRootNodeId(urlNodeId ?? WORKSPACE_ROOT_ID)
        setLoading(false)
      } catch (err) {
        if (!cancelled) {
          console.error('[outline] Failed to load data:', err)
          setError('Failed to load outline data')
          setLoading(false)
        }
      }
    }

    loadData()
    return () => {
      cancelled = true
    }
  }, [setNodes, setRootNodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleBackgroundClick = useCallback(() => {
    deactivateNode()
  }, [deactivateNode])

  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (activeNodeId) return

      if (!selectedNodeId) return

      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault()
          const prevId = getPreviousVisibleNode(selectedNodeId)
          if (prevId) selectNode(prevId)
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          const nextId = getNextVisibleNode(selectedNodeId)
          if (nextId) selectNode(nextId)
          break
        }
        case 'Enter': {
          e.preventDefault()
          const node = nodes.get(selectedNodeId)
          activateNode(selectedNodeId, node?.content.length ?? 0)
          break
        }
        case ' ': {
          e.preventDefault()
          toggleCollapse(selectedNodeId)
          break
        }
        case 'Backspace':
        case 'Delete': {
          e.preventDefault()
          const prevId = getPreviousVisibleNode(selectedNodeId)
          const nextId = getNextVisibleNode(selectedNodeId)
          deleteNode(selectedNodeId)
          selectNode(nextId ?? prevId ?? null)
          break
        }
        case 'Tab':
          // Don't prevent default — allow native focus movement
          break
        case 'o': {
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault()
            createNodeAfter(selectedNodeId)
          }
          break
        }
        case 'Escape': {
          selectNode(null)
          break
        }
      }
    },
    [
      activeNodeId,
      selectedNodeId,
      nodes,
      activateNode,
      selectNode,
      toggleCollapse,
      deleteNode,
      createNodeAfter,
      getPreviousVisibleNode,
      getNextVisibleNode,
    ],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-foreground/30">Loading…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-red-400">{error}</span>
      </div>
    )
  }

  const rootNode = nodes.get(rootNodeId)
  if (!rootNode) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-foreground/30">
          No nodes found. Import data to get started.
        </span>
      </div>
    )
  }

  const sortedChildren = [...rootNode.children].sort((a, b) => {
    const na = nodes.get(a)
    const nb = nodes.get(b)
    return (na?.order ?? '').localeCompare(nb?.order ?? '')
  })

  return (
    <div
      className="outline-editor flex h-full flex-col"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleBackgroundClick()
      }}
    >
      <Breadcrumbs />

      {/* Root node title + fields (only when zoomed into a specific node) */}
      {rootNodeId !== WORKSPACE_ROOT_ID && (
        <RootNodeHeader rootNode={rootNode} rootNodeId={rootNodeId} />
      )}

      {/* Outline body */}
      <div
        className="outline-body flex-1 overflow-y-auto px-2 pb-40"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleBackgroundClick()
          }
        }}
      >
        {sortedChildren.map((childId) => (
          <NodeBlock key={childId} nodeId={childId} depth={0} />
        ))}

        {sortedChildren.length === 0 && (
          <div className="px-8 py-4 text-sm text-foreground/25">
            Empty. Press Enter to start writing.
          </div>
        )}
      </div>
    </div>
  )
}

function RootNodeHeader({ rootNode, rootNodeId }: { rootNode: OutlineNode; rootNodeId: string }) {
  const navigateToNode = useNavigateToNode()

  // Use last supertag's color for the background gradient
  const gradientColor = rootNode.supertags.length > 0
    ? rootNode.supertags[rootNode.supertags.length - 1]!.color
    : null

  return (
    <div className="px-2 pb-2">
      {/* Title + tags area with radial gradient — oversized so it fades to zero before any edge */}
      <div className="relative pl-7">
        {gradientColor && (
          <div
            className="absolute pointer-events-none"
            style={{
              top: '-40px',
              left: '-60px',
              right: '-60px',
              bottom: '-30px',
              background: `radial-gradient(ellipse 60% 70% at 50% 35%, ${gradientColor}0c 0%, ${gradientColor}05 40%, transparent 80%)`,
            }}
          />
        )}

        {/* Title */}
        <h1 className="relative text-xl font-semibold text-foreground/90 leading-[1.4] min-h-[36px] flex items-center">
          {rootNode.content || 'Untitled'}
        </h1>

        {/* Supertag badges — below title */}
        {rootNode.supertags.length > 0 && (
          <div className="relative flex items-center gap-1 pb-2">
            {rootNode.supertags.map((tag) => (
              <span
                key={tag.id}
                className={cn(
                  'inline-flex items-center gap-0.5 rounded-sm px-1.5 py-px',
                  'text-[11px] font-medium leading-[1.8]',
                  'select-none whitespace-nowrap',
                  'cursor-pointer transition-opacity hover:opacity-70',
                  !tag.color && 'bg-foreground/8 text-foreground/50',
                )}
                style={
                  tag.color
                    ? { backgroundColor: `${tag.color}18`, color: tag.color }
                    : undefined
                }
                onClick={() => navigateToNode(tag.id)}
                title={`Go to: ${tag.name}`}
              >
                <Hash size={10} weight="bold" className="shrink-0 opacity-60" />
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {rootNode.fields.length > 0 && (
        <FieldsSection nodeId={rootNodeId} fields={rootNode.fields} depth={-1} />
      )}
    </div>
  )
}
