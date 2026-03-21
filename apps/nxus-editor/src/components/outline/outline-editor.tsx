import { useCallback, useEffect, useState } from 'react'
import { useSearch } from '@tanstack/react-router'
import { Hash, X } from '@phosphor-icons/react'
import { cn } from '@nxus/ui'
import { useOutlineStore } from '@/stores/outline.store'
import { useOutlineSync } from '@/hooks/use-outline-sync'
import { Breadcrumbs } from './breadcrumbs'
import { NodeBlock } from './node-block'
import { FieldsSection } from './fields-section'
import { BacklinksSection } from './backlinks-section'
import { CommandPalette } from './command-palette'
import { NodeCommandPalette } from './node-command-palette'
import type { CommandPaletteFieldContext } from './node-command-palette'
import {
  getWorkspaceRootServerFn,
  getNodeTreeServerFn,
  setFieldValueServerFn,
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
  const selectedNodeIds = useOutlineStore((s) => s.selectedNodeIds)
  const activateNode = useOutlineStore((s) => s.activateNode)
  const selectNode = useOutlineStore((s) => s.selectNode)
  const extendSelection = useOutlineStore((s) => s.extendSelection)
  const toggleCollapse = useOutlineStore((s) => s.toggleCollapse)
  const getNextVisibleNode = useOutlineStore((s) => s.getNextVisibleNode)
  const getPreviousVisibleNode = useOutlineStore(
    (s) => s.getPreviousVisibleNode,
  )

  const { createNodeAfter, createFirstChild, deleteNode, indentNode, outdentNode, moveNodeUp, moveNodeDown, undo, redo } = useOutlineSync()
  const navigateToNode = useNavigateToNode()

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false)
  const [commandFieldContext, setCommandFieldContext] =
    useState<CommandPaletteFieldContext | null>(null)

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
                createdAt: n.createdAt,
                collapsed: n.collapsed,
                supertags: n.supertags,
                fields: n.fields ?? [],
              })
            }
            topLevelIds.push(rootId)
          }
        }

        // Sort top-level nodes by order then createdAt
        topLevelIds.sort((a, b) => {
          const na = nodeMap.get(a)
          const nb = nodeMap.get(b)
          const orderCmp = (na?.order ?? '').localeCompare(nb?.order ?? '')
          if (orderCmp !== 0) return orderCmp
          return (na?.createdAt ?? 0) - (nb?.createdAt ?? 0)
        })

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
      // Don't handle outline shortcuts while a palette is open
      if (paletteOpen || cmdPaletteOpen) return

      // Empty outline — Enter creates the first node
      if (!selectedNodeId) {
        if (e.key === 'Enter') {
          e.preventDefault()
          const root = nodes.get(rootNodeId)
          if (root && root.children.length === 0) {
            createFirstChild(rootNodeId)
          }
        }
        return
      }

      const hasMultiSelect = selectedNodeIds.size > 1

      switch (e.key) {
        case 'ArrowUp': {
          e.preventDefault()
          if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
            // Cmd+Shift+Up moves selected nodes up
            if (hasMultiSelect) {
              for (const id of selectedNodeIds) moveNodeUp(id)
            } else {
              moveNodeUp(selectedNodeId)
            }
            break
          } else if (e.shiftKey) {
            // Shift+Arrow extends multi-selection
            const prevId = getPreviousVisibleNode(selectedNodeId)
            if (prevId) extendSelection(prevId)
          } else {
            const prevId = getPreviousVisibleNode(selectedNodeId)
            if (prevId) selectNode(prevId)
          }
          break
        }
        case 'ArrowDown': {
          e.preventDefault()
          if ((e.metaKey || e.ctrlKey) && e.shiftKey) {
            // Cmd+Shift+Down moves selected nodes down
            if (hasMultiSelect) {
              const ids = [...selectedNodeIds]
              // Move in reverse order to avoid order collisions
              for (let i = ids.length - 1; i >= 0; i--) moveNodeDown(ids[i]!)
            } else {
              moveNodeDown(selectedNodeId)
            }
          } else if (e.shiftKey) {
            const nextId = getNextVisibleNode(selectedNodeId)
            if (nextId) extendSelection(nextId)
          } else {
            const nextId = getNextVisibleNode(selectedNodeId)
            if (nextId) selectNode(nextId)
          }
          break
        }
        case 'Enter': {
          e.preventDefault()
          if (e.metaKey || e.ctrlKey) {
            // Cmd+Enter — toggle checkbox/boolean fields on selected node
            const node = nodes.get(selectedNodeId)
            if (node) {
              const boolField = node.fields.find((f) => f.fieldType === 'boolean')
              if (boolField) {
                const currentVal = Boolean(boolField.values[0]?.value)
                useOutlineStore.getState().updateFieldValue(selectedNodeId, boolField.fieldId, !currentVal)
                setFieldValueServerFn({ data: { nodeId: selectedNodeId, fieldId: boolField.fieldId, value: !currentVal } })
                  .catch((err) => console.error('[sync] Failed to toggle checkbox:', err))
              }
            }
          } else {
            // Plain Enter — activate node for editing
            const node = nodes.get(selectedNodeId)
            activateNode(selectedNodeId, node?.content.length ?? 0)
          }
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
          if (hasMultiSelect) {
            // Bulk delete all selected nodes
            const ids = [...selectedNodeIds]
            // Find a node to select after deletion
            const firstId = ids[0]!
            const prevId = getPreviousVisibleNode(firstId)
            const lastId = ids[ids.length - 1]!
            const nextId = getNextVisibleNode(lastId)
            for (const id of ids) {
              deleteNode(id)
            }
            selectNode(nextId ?? prevId ?? null)
          } else {
            const prevId = getPreviousVisibleNode(selectedNodeId)
            const nextId = getNextVisibleNode(selectedNodeId)
            deleteNode(selectedNodeId)
            selectNode(nextId ?? prevId ?? null)
          }
          break
        }
        case 'Tab': {
          if (hasMultiSelect) {
            e.preventDefault()
            const ids = [...selectedNodeIds]
            if (e.shiftKey) {
              for (const id of ids) outdentNode(id)
            } else {
              for (const id of ids) indentNode(id)
            }
          }
          break
        }
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
        case '.': {
          // Cmd+. — zoom into selected node
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            const node = nodes.get(selectedNodeId)
            if (node && node.children.length > 0) {
              navigateToNode(selectedNodeId)
            }
          }
          break
        }
        case ',': {
          // Cmd+, — zoom out to parent
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault()
            const rootNode = nodes.get(rootNodeId)
            if (rootNode && rootNode.parentId) {
              navigateToNode(rootNode.parentId)
            }
          }
          break
        }
      }
    },
    [
      activeNodeId,
      selectedNodeId,
      selectedNodeIds,
      nodes,
      rootNodeId,
      activateNode,
      selectNode,
      extendSelection,
      toggleCollapse,
      deleteNode,
      createNodeAfter,
      createFirstChild,
      indentNode,
      outdentNode,
      moveNodeUp,
      moveNodeDown,
      getPreviousVisibleNode,
      getNextVisibleNode,
      navigateToNode,
      paletteOpen,
      cmdPaletteOpen,
    ],
  )

  useEffect(() => {
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleGlobalKeyDown])

  // Cmd+S / Ctrl+S — open search palette
  // Cmd+K / Ctrl+K — open inline command palette
  // Cmd+Z / Cmd+Shift+Z — undo/redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        const activeElement =
          document.activeElement instanceof Element ? document.activeElement : null
        const selectionAnchor = window.getSelection()?.anchorNode
        const selectionElement = selectionAnchor instanceof Element
          ? selectionAnchor
          : selectionAnchor?.parentElement ?? null
        const fieldRow =
          activeElement?.closest('[data-field-row="true"]') ??
          selectionElement?.closest('[data-field-row="true"]') ??
          null

        if (fieldRow instanceof HTMLElement) {
          const nodeId = fieldRow.dataset.nodeId
          const fieldId = fieldRow.dataset.fieldId
          const fieldName = fieldRow.dataset.fieldName
          setCommandFieldContext(
            nodeId && fieldId && fieldName
              ? { nodeId, fieldId, fieldName }
              : null,
          )
        } else {
          setCommandFieldContext(null)
          // If a node is being edited, select it (exit edit mode) so focus can shift to palette
          const { activeNodeId: currentActive } = useOutlineStore.getState()
          if (currentActive) {
            useOutlineStore.getState().selectNode(currentActive)
          }
        }
        setCmdPaletteOpen((o) => !o)
      }
    }
    // Capture phase is required so shortcuts still work when focused editors
    // stop keydown propagation in the bubble phase.
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [undo, redo])

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
    const orderCmp = (na?.order ?? '').localeCompare(nb?.order ?? '')
    if (orderCmp !== 0) return orderCmp
    return (na?.createdAt ?? 0) - (nb?.createdAt ?? 0)
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

        {/* Backlinks — after children, only in zoomed-in view */}
        {rootNodeId !== WORKSPACE_ROOT_ID && (
          <BacklinksSection nodeId={rootNodeId} />
        )}
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <NodeCommandPalette
        open={cmdPaletteOpen}
        fieldContext={commandFieldContext}
        onClose={() => {
          setCmdPaletteOpen(false)
          setCommandFieldContext(null)
        }}
      />
    </div>
  )
}

function RootNodeHeader({ rootNode, rootNodeId }: { rootNode: OutlineNode; rootNodeId: string }) {
  const navigateToNode = useNavigateToNode()
  const { removeSupertag } = useOutlineSync()

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
                  'group/tag inline-flex items-center gap-0.5 rounded-sm px-1.5 py-px',
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
                {/* Icon area — fixed size, X overlays # on hover */}
                <span className="relative shrink-0 h-[10px] w-[10px]">
                  <Hash size={10} weight="bold" className="opacity-60 group-hover/tag:opacity-0 transition-opacity" />
                  <span
                    className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/tag:opacity-60 hover:!opacity-100 transition-opacity cursor-pointer"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeSupertag(rootNodeId, tag.id, tag.systemId)
                    }}
                    title={`Remove #${tag.name}`}
                  >
                    <X size={10} weight="bold" />
                  </span>
                </span>
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
