import { memo, useCallback, useMemo } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@nxus/ui'
import { useShallow } from 'zustand/react/shallow'
import { useOutlineStore } from '@/stores/outline.store'
import { useOutlineSync } from '@/hooks/use-outline-sync'
import { useNavigateToNode } from '@/hooks/use-navigate-to-node'
import type { OutlineCommandCatalog } from '@/types/outline'
import { SUPERTAG_DEFINITION_SYSTEM_ID } from '@/types/outline'
import type { OutlineKeyboardCallbacks } from './tiptap-node-editor'
import { Bullet } from './bullet'
import { NodeContent } from './node-content'
import { FieldsSection } from './fields-section'

interface NodeBlockProps {
  nodeId: string
  depth: number
  commandCatalog: OutlineCommandCatalog
}

export const NodeBlock = memo(function NodeBlock({
  nodeId,
  depth,
  commandCatalog,
}: NodeBlockProps) {
  const node = useOutlineStore((s) => s.nodes.get(nodeId))
  const activeNodeId = useOutlineStore((s) => s.activeNodeId)
  const selectedNodeId = useOutlineStore((s) => s.selectedNodeId)
  const cursorPosition = useOutlineStore((s) => s.cursorPosition)
  const dropPosition = useOutlineStore((s) =>
    s.dropTargetId === nodeId ? s.dropPosition : null,
  )

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
    addFieldToNode,
    applySupertagToNode,
    createSupertag,
    updateNodeContent,
    createNodeAfter,
    deleteNode,
    indentNode,
    outdentNode,
    moveNodeUp,
    moveNodeDown,
    undo,
    redo,
  } = useOutlineSync()

  const {
    attributes,
    listeners,
    setNodeRef: setDragNodeRef,
    transform,
    isDragging,
  } = useDraggable({ id: nodeId })
  const { setNodeRef: setDropNodeRef } = useDroppable({ id: nodeId })

  const dragStyle = isDragging
    ? {
        transform: CSS.Translate.toString(transform),
        opacity: 0.58,
        zIndex: 30,
      }
    : undefined

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

  /**
   * Outline keyboard callbacks for the Tiptap editor.
   * These map Tiptap keymap events to outline store actions.
   */
  const outlineCallbacks: OutlineKeyboardCallbacks = useMemo(
    () => ({
      onEnter: (contentBefore: string, contentAfter: string) => {
        // Split node at cursor: keep content before, create new node with content after
        updateNodeContent(nodeId, contentBefore)
        const newId = createNodeAfter(nodeId)
        if (contentAfter) {
          updateNodeContent(newId, contentAfter)
        }
      },

      onBackspaceAtStart: (currentContent: string) => {
        const prevId = getPreviousVisibleNode(nodeId)
        if (prevId) {
          const prevNode = useOutlineStore.getState().nodes.get(prevId)
          if (prevNode) {
            const mergePos = prevNode.content.length
            updateNodeContent(prevId, prevNode.content + currentContent)
            deleteNode(nodeId)
            activateNode(prevId, mergePos)
          }
        }
      },

      onBackspaceEmpty: () => {
        const prevId = getPreviousVisibleNode(nodeId)
        deleteNode(nodeId)
        if (prevId) {
          const prevNode = useOutlineStore.getState().nodes.get(prevId)
          activateNode(prevId, prevNode?.content.length ?? 0)
        }
      },

      onTab: () => {
        indentNode(nodeId)
      },

      onShiftTab: () => {
        outdentNode(nodeId)
      },

      onArrowUpAtStart: () => {
        const prevId = getPreviousVisibleNode(nodeId)
        if (prevId) {
          const prevNode = useOutlineStore.getState().nodes.get(prevId)
          activateNode(prevId, prevNode?.content.length ?? 0)
        }
      },

      onArrowDownAtEnd: () => {
        const nextId = getNextVisibleNode(nodeId)
        if (nextId) {
          activateNode(nextId, 0)
        }
      },

      onMoveUp: () => {
        moveNodeUp(nodeId)
      },

      onMoveDown: () => {
        moveNodeDown(nodeId)
      },

      onCollapseToggle: (direction: 'up' | 'down') => {
        const n = useOutlineStore.getState().nodes.get(nodeId)
        if (!n) return
        if (direction === 'up' && n.children.length > 0 && !n.collapsed) {
          toggleCollapse(nodeId)
        }
        if (direction === 'down' && n.children.length > 0 && n.collapsed) {
          toggleCollapse(nodeId)
        }
      },

      onUndo: () => {
        undo()
      },

      onRedo: () => {
        redo()
      },
    }),
    [
      nodeId,
      createNodeAfter,
      updateNodeContent,
      deleteNode,
      indentNode,
      outdentNode,
      moveNodeUp,
      moveNodeDown,
      toggleCollapse,
      activateNode,
      getPreviousVisibleNode,
      getNextVisibleNode,
      undo,
      redo,
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
    <div
      ref={setDragNodeRef}
      className="node-block relative transition-[transform,opacity] duration-150"
      style={dragStyle}
      data-node-id={nodeId}
    >
      {dropPosition === 'before' && (
        <div
          className="absolute -top-1 right-0 h-1 rounded-full bg-primary z-20"
          style={{ left: `${depth * 24 + 10}px` }}
        />
      )}

      {/* The node row */}
      <div
        ref={setDropNodeRef}
        className={cn(
          'node-row group/node flex items-start',
          'rounded-sm transition-colors duration-75',
          isSelected && !isActive && 'bg-primary/5',
          dropPosition === 'inside' &&
            'bg-primary/8 ring-1 ring-primary/35 ring-inset',
          isDragging && 'cursor-grabbing',
        )}
        style={{ paddingLeft: `${depth * 24}px` }}
      >
        <Bullet
          hasChildren={isExpandable}
          collapsed={node.collapsed}
          childCount={node.children.length}
          tagColor={primaryTagColor}
          isSupertag={isSupertag}
          dragHandleProps={{ ...attributes, ...listeners }}
          onClick={handleBulletClick}
        />
        <NodeContent
          nodeId={nodeId}
          content={node.content}
          isActive={isActive}
          isSelected={isSelected}
          supertags={node.supertags}
          commandCatalog={commandCatalog}
          cursorPosition={cursorPosition}
          onActivate={handleActivate}
          onAddField={addFieldToNode}
          onApplySupertag={applySupertagToNode}
          onChange={handleContentChange}
          onCreateSupertag={createSupertag}
          outlineCallbacks={outlineCallbacks}
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
            <NodeBlock
              key={childId}
              nodeId={childId}
              depth={depth + 1}
              commandCatalog={commandCatalog}
            />
          ))}
        </div>
      )}

      {dropPosition === 'after' && (
        <div
          className="absolute -bottom-1 right-0 h-1 rounded-full bg-primary z-20"
          style={{ left: `${depth * 24 + 10}px` }}
        />
      )}
    </div>
  )
})
