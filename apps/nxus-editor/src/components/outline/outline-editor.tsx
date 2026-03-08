import { useCallback, useEffect } from 'react'
import { useOutlineStore } from '@/stores/outline.store'
import { Breadcrumbs } from './breadcrumbs'
import { NodeBlock } from './node-block'
import { seedDemoData } from '@/lib/seed-data'

export function OutlineEditor() {
  const nodes = useOutlineStore((s) => s.nodes)
  const rootNodeId = useOutlineStore((s) => s.rootNodeId)
  const setNodes = useOutlineStore((s) => s.setNodes)
  const deactivateNode = useOutlineStore((s) => s.deactivateNode)
  const activeNodeId = useOutlineStore((s) => s.activeNodeId)
  const selectedNodeId = useOutlineStore((s) => s.selectedNodeId)
  const activateNode = useOutlineStore((s) => s.activateNode)
  const selectNode = useOutlineStore((s) => s.selectNode)
  const toggleCollapse = useOutlineStore((s) => s.toggleCollapse)
  const deleteNode = useOutlineStore((s) => s.deleteNode)
  const createNodeAfter = useOutlineStore((s) => s.createNodeAfter)
  const getNextVisibleNode = useOutlineStore((s) => s.getNextVisibleNode)
  const getPreviousVisibleNode = useOutlineStore(
    (s) => s.getPreviousVisibleNode,
  )

  useEffect(() => {
    if (nodes.size === 0) {
      setNodes(seedDemoData())
    }
  }, [nodes.size, setNodes])

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
        case 'Tab': {
          e.preventDefault()
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

  const rootNode = nodes.get(rootNodeId)
  if (!rootNode) return null

  const sortedChildren = [...rootNode.children].sort((a, b) => {
    const na = nodes.get(a)
    const nb = nodes.get(b)
    return (na?.order ?? '').localeCompare(nb?.order ?? '')
  })

  return (
    <div
      className="outline-editor flex h-full flex-col"
      onClick={handleBackgroundClick}
    >
      <Breadcrumbs />

      {/* Root node title */}
      {rootNodeId !== 'root' && (
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
