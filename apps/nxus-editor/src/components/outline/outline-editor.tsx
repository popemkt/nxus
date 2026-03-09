import { useCallback, useEffect, useState } from 'react'
import { useOutlineStore } from '@/stores/outline.store'
import { useOutlineSync } from '@/hooks/use-outline-sync'
import { Breadcrumbs } from './breadcrumbs'
import { NodeBlock } from './node-block'
import {
  getWorkspaceRootServerFn,
  getNodeTreeServerFn,
} from '@/services/outline.server'
import type { OutlineNode } from '@/types/outline'
import { WORKSPACE_ROOT_ID } from '@/types/outline'

export function OutlineEditor() {
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
        setRootNodeId(WORKSPACE_ROOT_ID)
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
  }, [setNodes, setRootNodeId])

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

      {/* Root node title (only when zoomed into a specific node) */}
      {rootNodeId !== WORKSPACE_ROOT_ID && (
        <div className="px-3 pb-3">
          <h1 className="text-xl font-semibold text-foreground/90">
            {rootNode.content || 'Untitled'}
          </h1>
        </div>
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
