import { create } from 'zustand'
import type {
  NodeMap,
  OutlineDropPosition,
  OutlineNode,
} from '@/types/outline'
import { WORKSPACE_ROOT_ID } from '@/types/outline'

const MAX_UNDO_STACK = 100

export interface UndoSnapshot {
  nodes: NodeMap
  activeNodeId: string | null
  selectedNodeId: string | null
  cursorPosition: number
}

interface OutlineState {
  nodes: NodeMap
  rootNodeId: string
  activeNodeId: string | null
  selectedNodeId: string | null
  cursorPosition: number
  draggedNodeId: string | null
  dropTargetId: string | null
  dropPosition: OutlineDropPosition | null
  undoStack: UndoSnapshot[]
  redoStack: UndoSnapshot[]

  setNodes: (nodes: NodeMap) => void
  mergeNodes: (nodes: OutlineNode[]) => void
  setRootNodeId: (id: string) => void
  activateNode: (id: string, cursorPos?: number) => void
  deactivateNode: () => void
  selectNode: (id: string | null) => void
  toggleCollapse: (id: string) => void
  updateNodeContent: (id: string, content: string) => void
  updateFieldValue: (nodeId: string, fieldIdentifier: string, value: unknown) => void
  createNodeAfter: (afterId: string) => string
  deleteNode: (id: string) => void
  indentNode: (id: string) => void
  outdentNode: (id: string) => void
  moveNodeUp: (id: string) => void
  moveNodeDown: (id: string) => void
  moveNode: (id: string, targetId: string, position: OutlineDropPosition) => boolean
  setDragState: (
    draggedNodeId: string | null,
    dropTargetId: string | null,
    dropPosition: OutlineDropPosition | null,
  ) => void
  clearDragState: () => void
  getVisibleNodes: () => string[]
  getPreviousVisibleNode: (id: string) => string | null
  getNextVisibleNode: (id: string) => string | null

  /** Capture current state to undo stack, clear redo stack. */
  pushUndo: () => void
  /** Restore previous state from undo stack. Returns pre-undo snapshot for server sync diffing. */
  undo: () => UndoSnapshot | null
  /** Re-apply from redo stack. Returns pre-redo snapshot for server sync diffing. */
  redo: () => UndoSnapshot | null
  /** Clear undo/redo history (e.g., on navigation). */
  clearUndoHistory: () => void
}

let nextId = 1
function generateId(): string {
  return `node-${Date.now()}-${nextId++}`
}

function generateOrder(index: number): string {
  return String(index).padStart(8, '0')
}

function generateOrderBetween(a: string | null, b: string | null): string {
  if (!a && !b) return generateOrder(500_000)
  if (!a) return generateOrder(Math.floor(parseInt(b!, 10) / 2))
  if (!b) return generateOrder(parseInt(a, 10) + 1000)
  const aNum = parseInt(a, 10)
  const bNum = parseInt(b, 10)
  const gap = bNum - aNum
  if (gap > 1) {
    return generateOrder(aNum + Math.floor(gap / 2))
  }
  // Gap exhausted — extend by appending fractional digits
  return a + '5'.padStart(4, '0')
}

function sortNodeIds(ids: string[], nodes: NodeMap): string[] {
  return [...ids].sort((a, b) => {
    const na = nodes.get(a)
    const nb = nodes.get(b)
    return (na?.order ?? '').localeCompare(nb?.order ?? '')
  })
}

function isDescendant(nodeId: string, ancestorId: string, nodes: NodeMap): boolean {
  let currentId: string | null = nodeId

  while (currentId) {
    if (currentId === ancestorId) return true
    currentId = nodes.get(currentId)?.parentId ?? null
  }

  return false
}

function getVisibleNodesRecursive(
  nodeId: string,
  nodes: NodeMap,
  result: string[],
): void {
  const node = nodes.get(nodeId)
  if (!node) return
  result.push(nodeId)
  if (!node.collapsed) {
    const sortedChildren = sortNodeIds(node.children, nodes)
    for (const childId of sortedChildren) {
      getVisibleNodesRecursive(childId, nodes, result)
    }
  }
}

export const useOutlineStore = create<OutlineState>((set, get) => ({
  nodes: new Map(),
  rootNodeId: WORKSPACE_ROOT_ID,
  activeNodeId: null,
  selectedNodeId: null,
  cursorPosition: 0,
  draggedNodeId: null,
  dropTargetId: null,
  dropPosition: null,
  undoStack: [],
  redoStack: [],

  setNodes: (nodes) => set({ nodes }),
  mergeNodes: (incomingNodes) =>
    set((state) => {
      const next = new Map(state.nodes)
      for (const node of incomingNodes) {
        next.set(node.id, node)
      }
      return { nodes: next }
    }),
  setRootNodeId: (id) => set({ rootNodeId: id }),

  activateNode: (id, cursorPos) =>
    set({
      activeNodeId: id,
      selectedNodeId: id,
      cursorPosition: cursorPos ?? 0,
    }),

  deactivateNode: () => set({ activeNodeId: null }),

  selectNode: (id) => set({ selectedNodeId: id, activeNodeId: null }),

  toggleCollapse: (id) => {
    const { nodes } = get()
    const node = nodes.get(id)
    if (!node || (node.children.length === 0 && node.fields.length === 0)) return
    const next = new Map(nodes)
    next.set(id, { ...node, collapsed: !node.collapsed })
    set({ nodes: next })
  },

  updateNodeContent: (id, content) => {
    const { nodes } = get()
    const node = nodes.get(id)
    if (!node) return
    const next = new Map(nodes)
    next.set(id, { ...node, content })
    set({ nodes: next })
  },

  updateFieldValue: (nodeId, fieldIdentifier, value) => {
    const { nodes } = get()
    const node = nodes.get(nodeId)
    if (!node) return
    const next = new Map(nodes)
    next.set(nodeId, {
      ...node,
      fields: node.fields.map((f) =>
        (f.fieldSystemId ?? f.fieldNodeId) === fieldIdentifier
          ? { ...f, values: [{ value, order: f.values[0]?.order ?? 0 }] }
          : f,
      ),
    })
    set({ nodes: next })
  },

  createNodeAfter: (afterId) => {
    const { nodes } = get()
    const afterNode = nodes.get(afterId)
    if (!afterNode) return afterId

    const parentId = afterNode.parentId
    if (!parentId) return afterId

    const parent = nodes.get(parentId)
    if (!parent) return afterId

    const newId = generateId()
    const sortedSiblings = [...parent.children].sort((a, b) => {
      const na = nodes.get(a)
      const nb = nodes.get(b)
      return (na?.order ?? '').localeCompare(nb?.order ?? '')
    })
    const afterIndex = sortedSiblings.indexOf(afterId)
    const afterOrder = afterNode.order
    const nextSiblingId = sortedSiblings[afterIndex + 1]
    const nextOrder = nextSiblingId
      ? nodes.get(nextSiblingId)?.order ?? null
      : null

    const newNode: OutlineNode = {
      id: newId,
      content: '',
      parentId,
      children: [],
      order: generateOrderBetween(afterOrder, nextOrder),
      collapsed: false,
      supertags: [],
      fields: [],
    }

    const next = new Map(nodes)
    next.set(newId, newNode)
    next.set(parentId, {
      ...parent,
      children: [...parent.children, newId],
    })
    set({ nodes: next, activeNodeId: newId, selectedNodeId: newId })
    return newId
  },

  deleteNode: (id) => {
    const { nodes } = get()
    const node = nodes.get(id)
    if (!node || !node.parentId) return

    const parent = nodes.get(node.parentId)
    if (!parent) return

    const next = new Map(nodes)

    const deleteRecursive = (nodeId: string) => {
      const n = next.get(nodeId)
      if (!n) return
      for (const childId of n.children) {
        deleteRecursive(childId)
      }
      next.delete(nodeId)
    }
    deleteRecursive(id)

    next.set(node.parentId, {
      ...parent,
      children: parent.children.filter((c) => c !== id),
    })

    set({ nodes: next })
  },

  indentNode: (id) => {
    const { nodes } = get()
    const node = nodes.get(id)
    if (!node || !node.parentId) return

    const parent = nodes.get(node.parentId)
    if (!parent) return

    const sortedSiblings = [...parent.children].sort((a, b) => {
      const na = nodes.get(a)
      const nb = nodes.get(b)
      return (na?.order ?? '').localeCompare(nb?.order ?? '')
    })
    const myIndex = sortedSiblings.indexOf(id)
    if (myIndex <= 0) return

    const newParentId = sortedSiblings[myIndex - 1]!
    const newParent = nodes.get(newParentId)
    if (!newParent) return

    const lastChildOrder =
      newParent.children.length > 0
        ? [...newParent.children]
            .map((c) => nodes.get(c)?.order ?? '0')
            .sort()
            .pop() ?? null
        : null

    const next = new Map(nodes)
    next.set(node.parentId, {
      ...parent,
      children: parent.children.filter((c) => c !== id),
    })
    next.set(newParentId, {
      ...newParent,
      children: [...newParent.children, id],
      collapsed: false,
    })
    next.set(id, {
      ...node,
      parentId: newParentId,
      order: generateOrderBetween(lastChildOrder, null),
    })
    set({ nodes: next })
  },

  outdentNode: (id) => {
    const { nodes } = get()
    const node = nodes.get(id)
    if (!node || !node.parentId) return

    const parent = nodes.get(node.parentId)
    if (!parent || !parent.parentId) return

    const grandparent = nodes.get(parent.parentId)
    if (!grandparent) return

    const next = new Map(nodes)
    next.set(node.parentId, {
      ...parent,
      children: parent.children.filter((c) => c !== id),
    })

    const gpSortedChildren = [...grandparent.children].sort((a, b) => {
      const na = nodes.get(a)
      const nb = nodes.get(b)
      return (na?.order ?? '').localeCompare(nb?.order ?? '')
    })
    const parentIndex = gpSortedChildren.indexOf(node.parentId)
    const parentOrder = parent.order
    const nextUncleId = gpSortedChildren[parentIndex + 1]
    const nextUncleOrder = nextUncleId
      ? nodes.get(nextUncleId)?.order ?? null
      : null

    next.set(parent.parentId, {
      ...grandparent,
      children: [...grandparent.children, id],
    })
    next.set(id, {
      ...node,
      parentId: parent.parentId,
      order: generateOrderBetween(parentOrder, nextUncleOrder),
    })
    set({ nodes: next })
  },

  moveNodeUp: (id) => {
    const { nodes } = get()
    const node = nodes.get(id)
    if (!node || !node.parentId) return

    const parent = nodes.get(node.parentId)
    if (!parent) return

    const sortedSiblings = [...parent.children].sort((a, b) => {
      const na = nodes.get(a)
      const nb = nodes.get(b)
      return (na?.order ?? '').localeCompare(nb?.order ?? '')
    })
    const myIndex = sortedSiblings.indexOf(id)
    if (myIndex <= 0) return

    const prevSiblingId = sortedSiblings[myIndex - 1]!
    const prevSibling = nodes.get(prevSiblingId)
    if (!prevSibling) return

    const next = new Map(nodes)
    const tempOrder = node.order
    next.set(id, { ...node, order: prevSibling.order })
    next.set(prevSiblingId, { ...prevSibling, order: tempOrder })
    set({ nodes: next })
  },

  moveNodeDown: (id) => {
    const { nodes } = get()
    const node = nodes.get(id)
    if (!node || !node.parentId) return

    const parent = nodes.get(node.parentId)
    if (!parent) return

    const sortedSiblings = [...parent.children].sort((a, b) => {
      const na = nodes.get(a)
      const nb = nodes.get(b)
      return (na?.order ?? '').localeCompare(nb?.order ?? '')
    })
    const myIndex = sortedSiblings.indexOf(id)
    if (myIndex >= sortedSiblings.length - 1) return

    const nextSiblingId = sortedSiblings[myIndex + 1]!
    const nextSibling = nodes.get(nextSiblingId)
    if (!nextSibling) return

    const next = new Map(nodes)
    const tempOrder = node.order
    next.set(id, { ...node, order: nextSibling.order })
    next.set(nextSiblingId, { ...nextSibling, order: tempOrder })
    set({ nodes: next })
  },

  moveNode: (id, targetId, position) => {
    const { nodes } = get()
    const node = nodes.get(id)
    const target = nodes.get(targetId)

    if (!node || !target || id === targetId || isDescendant(targetId, id, nodes)) {
      return false
    }

    let nextParentId: string | null = null
    let nextOrder: string | null = null

    if (position === 'inside') {
      nextParentId = targetId
      const sortedChildren = sortNodeIds(target.children, nodes).filter(
        (childId) => childId !== id,
      )
      const lastChildId = sortedChildren.at(-1) ?? null
      nextOrder = generateOrderBetween(
        lastChildId ? nodes.get(lastChildId)?.order ?? null : null,
        null,
      )
    } else {
      nextParentId = target.parentId
      if (!nextParentId) return false

      const nextParent = nodes.get(nextParentId)
      if (!nextParent) return false

      const sortedSiblings = sortNodeIds(nextParent.children, nodes).filter(
        (siblingId) => siblingId !== id,
      )
      const targetIndex = sortedSiblings.indexOf(targetId)
      if (targetIndex === -1) return false

      const previousSiblingId =
        position === 'before' ? sortedSiblings[targetIndex - 1] ?? null : targetId
      const nextSiblingId =
        position === 'before' ? targetId : sortedSiblings[targetIndex + 1] ?? null

      nextOrder = generateOrderBetween(
        previousSiblingId ? nodes.get(previousSiblingId)?.order ?? null : null,
        nextSiblingId ? nodes.get(nextSiblingId)?.order ?? null : null,
      )
    }

    if (!nextOrder || (node.parentId === nextParentId && node.order === nextOrder)) {
      return false
    }

    const next = new Map(nodes)
    const previousParentId = node.parentId

    if (previousParentId) {
      const previousParent = next.get(previousParentId)
      if (previousParent) {
        next.set(previousParentId, {
          ...previousParent,
          children: previousParent.children.filter((childId) => childId !== id),
        })
      }
    }

    const nextParent = next.get(nextParentId)
    if (!nextParent) return false

    next.set(nextParentId, {
      ...nextParent,
      children: [...nextParent.children.filter((childId) => childId !== id), id],
      collapsed: position === 'inside' ? false : nextParent.collapsed,
    })

    next.set(id, {
      ...node,
      parentId: nextParentId,
      order: nextOrder,
    })

    set({
      nodes: next,
      activeNodeId: id,
      selectedNodeId: id,
    })

    return true
  },

  setDragState: (draggedNodeId, dropTargetId, dropPosition) =>
    set({ draggedNodeId, dropTargetId, dropPosition }),

  clearDragState: () =>
    set({
      draggedNodeId: null,
      dropTargetId: null,
      dropPosition: null,
    }),

  getVisibleNodes: () => {
    const { nodes, rootNodeId } = get()
    const root = nodes.get(rootNodeId)
    if (!root) return []
    const result: string[] = []
    const sortedChildren = sortNodeIds(root.children, nodes)
    for (const childId of sortedChildren) {
      getVisibleNodesRecursive(childId, nodes, result)
    }
    return result
  },

  getPreviousVisibleNode: (id) => {
    const visible = get().getVisibleNodes()
    const idx = visible.indexOf(id)
    return idx > 0 ? visible[idx - 1]! : null
  },

  getNextVisibleNode: (id) => {
    const visible = get().getVisibleNodes()
    const idx = visible.indexOf(id)
    return idx < visible.length - 1 ? visible[idx + 1]! : null
  },

  pushUndo: () => {
    const { nodes, activeNodeId, selectedNodeId, cursorPosition, undoStack } = get()
    const snapshot: UndoSnapshot = {
      nodes: new Map(nodes),
      activeNodeId,
      selectedNodeId,
      cursorPosition,
    }
    const newStack = [...undoStack, snapshot]
    if (newStack.length > MAX_UNDO_STACK) newStack.shift()
    set({ undoStack: newStack, redoStack: [] })
  },

  undo: () => {
    const { undoStack, redoStack, nodes, activeNodeId, selectedNodeId, cursorPosition } = get()
    if (undoStack.length === 0) return null

    const snapshot = undoStack[undoStack.length - 1]!
    const currentSnapshot: UndoSnapshot = {
      nodes: new Map(nodes),
      activeNodeId,
      selectedNodeId,
      cursorPosition,
    }

    set({
      nodes: snapshot.nodes,
      activeNodeId: snapshot.activeNodeId,
      selectedNodeId: snapshot.selectedNodeId,
      cursorPosition: snapshot.cursorPosition,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, currentSnapshot],
    })

    return currentSnapshot
  },

  redo: () => {
    const { undoStack, redoStack, nodes, activeNodeId, selectedNodeId, cursorPosition } = get()
    if (redoStack.length === 0) return null

    const snapshot = redoStack[redoStack.length - 1]!
    const currentSnapshot: UndoSnapshot = {
      nodes: new Map(nodes),
      activeNodeId,
      selectedNodeId,
      cursorPosition,
    }

    set({
      nodes: snapshot.nodes,
      activeNodeId: snapshot.activeNodeId,
      selectedNodeId: snapshot.selectedNodeId,
      cursorPosition: snapshot.cursorPosition,
      redoStack: redoStack.slice(0, -1),
      undoStack: [...undoStack, currentSnapshot],
    })

    return currentSnapshot
  },

  clearUndoHistory: () => set({ undoStack: [], redoStack: [] }),
}))
