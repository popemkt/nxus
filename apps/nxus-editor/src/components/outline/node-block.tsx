import { memo, useCallback } from 'react'
import { cn } from '@nxus/ui'
import { useShallow } from 'zustand/react/shallow'
import { useOutlineStore } from '@/stores/outline.store'
import { useOutlineSync } from '@/hooks/use-outline-sync'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import { SUPERTAG_DEFINITION_SYSTEM_ID } from '@/types/outline'
import { Bullet } from './bullet'
import { NodeContent } from './node-content'
import { FieldsSection } from './fields-section'

interface NodeBlockProps {
  nodeId: string
  depth: number
}

export const NodeBlock = memo(function NodeBlock({
  nodeId,
  depth,
}: NodeBlockProps) {
  const node = useOutlineStore((s) => s.nodes.get(nodeId))
  const activeNodeId = useOutlineStore((s) => s.activeNodeId)
  const selectedNodeId = useOutlineStore((s) => s.selectedNodeId)
  const cursorPosition = useOutlineStore((s) => s.cursorPosition)

  // UI-only store actions (no server persistence needed)
  const activateNode = useOutlineStore((s) => s.activateNode)
  const toggleCollapse = useOutlineStore((s) => s.toggleCollapse)
  const navigateToNode = useNavigateToNode()
  const getPreviousVisibleNode = useOutlineStore(
    (s) => s.getPreviousVisibleNode,
  )
  const getNextVisibleNode = useOutlineStore((s) => s.getNextVisibleNode)

  // Persisted mutations via sync hook
  const {
    updateNodeContent,
    createNodeAfter,
    deleteNode,
    indentNode,
    outdentNode,
    moveNodeUp,
    moveNodeDown,
  } = useOutlineSync()

  const handleBulletClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey) {
        // Cmd/Ctrl+click → zoom into this node
        navigateToNode(nodeId)
      } else {
        toggleCollapse(nodeId)
      }
    },
    [toggleCollapse, navigateToNode, nodeId],
  )

  const handleActivate = useCallback(
    (cursorPos?: number) => {
      activateNode(nodeId, cursorPos)
    },
    [activateNode, nodeId],
  )

  const handleContentChange = useCallback(
    (content: string) => {
      updateNodeContent(nodeId, content)
    },
    [updateNodeContent, nodeId],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const sel = window.getSelection()

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        createNodeAfter(nodeId)
        return
      }

      if (e.key === 'Tab') {
        e.preventDefault()
        if (e.shiftKey) {
          outdentNode(nodeId)
        } else {
          indentNode(nodeId)
        }
        return
      }

      if (
        e.key === 'Backspace' &&
        node?.content === '' &&
        node?.children.length === 0 &&
        !e.metaKey &&
        !e.ctrlKey
      ) {
        e.preventDefault()
        const prevId = getPreviousVisibleNode(nodeId)
        deleteNode(nodeId)
        if (prevId) {
          const prevNode = useOutlineStore.getState().nodes.get(prevId)
          activateNode(prevId, prevNode?.content.length ?? 0)
        }
        return
      }

      if (
        e.key === 'Backspace' &&
        sel?.focusOffset === 0 &&
        node?.content &&
        node?.children.length === 0
      ) {
        e.preventDefault()
        const prevId = getPreviousVisibleNode(nodeId)
        if (prevId) {
          const prevNode = useOutlineStore.getState().nodes.get(prevId)
          if (prevNode) {
            const mergePos = prevNode.content.length
            updateNodeContent(prevId, prevNode.content + node.content)
            deleteNode(nodeId)
            activateNode(prevId, mergePos)
          }
        }
        return
      }

      if (e.key === 'ArrowUp') {
        if (e.metaKey && e.shiftKey) {
          e.preventDefault()
          moveNodeUp(nodeId)
          return
        }
        if (e.metaKey) {
          e.preventDefault()
          if (node?.children.length && !node.collapsed) {
            toggleCollapse(nodeId)
          }
          return
        }
        const isAtStart = sel?.focusOffset === 0
        if (isAtStart) {
          e.preventDefault()
          const prevId = getPreviousVisibleNode(nodeId)
          if (prevId) {
            const prevNode = useOutlineStore.getState().nodes.get(prevId)
            activateNode(prevId, prevNode?.content.length ?? 0)
          }
        }
        return
      }

      if (e.key === 'ArrowDown') {
        if (e.metaKey && e.shiftKey) {
          e.preventDefault()
          moveNodeDown(nodeId)
          return
        }
        if (e.metaKey) {
          e.preventDefault()
          if (node?.children.length && node.collapsed) {
            toggleCollapse(nodeId)
          }
          return
        }
        const isAtEnd =
          sel?.focusOffset === (node?.content.length ?? 0)
        if (isAtEnd) {
          e.preventDefault()
          const nextId = getNextVisibleNode(nodeId)
          if (nextId) {
            activateNode(nextId, 0)
          }
        }
        return
      }
    },
    [
      nodeId,
      node,
      createNodeAfter,
      indentNode,
      outdentNode,
      deleteNode,
      moveNodeUp,
      moveNodeDown,
      toggleCollapse,
      activateNode,
      getPreviousVisibleNode,
      getNextVisibleNode,
      updateNodeContent,
    ],
  )

  if (!node) return null

  const isActive = activeNodeId === nodeId
  const isSelected = selectedNodeId === nodeId
  const hasChildren = node.children.length > 0
  const hasFields = node.fields.length > 0
  const isExpandable = hasChildren || hasFields
  const primaryTagColor = node.supertags[0]?.color ?? null
  const isSupertag = node.supertags.some((t) => t.systemId === SUPERTAG_DEFINITION_SYSTEM_ID)

  // Shallow-compared selector: only re-renders when the sorted order actually changes.
  // Content-only edits in children don't change order → parent skips re-render.
  const sortedChildren = useOutlineStore(
    useShallow((s) => {
      const n = s.nodes.get(nodeId)
      if (!n) return []
      return [...n.children].sort((a, b) => {
        const na = s.nodes.get(a)
        const nb = s.nodes.get(b)
        return (na?.order ?? '').localeCompare(nb?.order ?? '')
      })
    }),
  )

  return (
    <div className="node-block relative" data-node-id={nodeId}>
      {/* The node row */}
      <div
        className={cn(
          'node-row group/node flex items-start',
          'rounded-sm transition-colors duration-75',
          isSelected && !isActive && 'bg-primary/5',
        )}
        style={{ paddingLeft: `${depth * 24}px` }}
      >
        <Bullet
          hasChildren={isExpandable}
          collapsed={node.collapsed}
          childCount={node.children.length}
          tagColor={primaryTagColor}
          isSupertag={isSupertag}
          onClick={handleBulletClick}
        />
        <NodeContent
          nodeId={nodeId}
          content={node.content}
          isActive={isActive}
          isSelected={isSelected}
          supertags={node.supertags}
          cursorPosition={cursorPosition}
          onActivate={handleActivate}
          onChange={handleContentChange}
          onKeyDown={handleKeyDown}
        />
      </div>

      {/* Fields + Children — wrapped in a single container with tree line */}
      {isExpandable && !node.collapsed && (
        <div className="children-container relative">
          {/* Vertical tree line spanning fields and children */}
          <div
            className="absolute top-0 bottom-2 w-px bg-foreground/[0.06] hover:bg-foreground/15 transition-colors duration-200 cursor-pointer"
            style={{ left: `${depth * 24 + 11}px` }}
            onClick={handleBulletClick}
          />

          {/* Fields (properties) — rendered before children */}
          {node.fields.length > 0 && (
            <FieldsSection nodeId={nodeId} fields={node.fields} depth={depth} />
          )}

          {/* Children */}
          {sortedChildren.map((childId) => (
            <NodeBlock key={childId} nodeId={childId} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
})
