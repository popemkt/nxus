import { create } from 'zustand'
import type { NodeMap, OutlineNode } from '@/types/outline'
import { WORKSPACE_ROOT_ID } from '@/types/outline'

interface OutlineState {
  nodes: NodeMap
  rootNodeId: string
  activeNodeId: string | null
  selectedNodeId: string | null
  cursorPosition: number

  setNodes: (nodes: NodeMap) => void
  setRootNodeId: (id: string) => void
  activateNode: (id: string, cursorPos?: number) => void
  deactivateNode: () => void
  selectNode: (id: string | null) => void
  toggleCollapse: (id: string) => void
  updateNodeContent: (id: string, content: string) => void
  updateFieldValue: (nodeId: string, fieldSystemId: string, value: unknown) => void
  createNodeAfter: (afterId: string) => string
  deleteNode: (id: string) => void
  indentNode: (id: string) => void
  outdentNode: (id: string) => void
  moveNodeUp: (id: string) => void
  moveNodeDown: (id: string) => void
  getVisibleNodes: () => string[]
  getPreviousVisibleNode: (id: string) => string | null
  getNextVisibleNode: (id: string) => string | null
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

function getVisibleNodesRecursive(
  nodeId: string,
  nodes: NodeMap,
  result: string[],
): void {
  const node = nodes.get(nodeId)
  if (!node) return
  result.push(nodeId)
  if (!node.collapsed) {
    const sortedChildren = [...node.children].sort((a, b) => {
      const na = nodes.get(a)
      const nb = nodes.get(b)
      return (na?.order ?? '').localeCompare(nb?.order ?? '')
    })
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

  setNodes: (nodes) => set({ nodes }),
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
    if (!node || node.children.length === 0) return
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

  updateFieldValue: (nodeId, fieldSystemId, value) => {
    const { nodes } = get()
    const node = nodes.get(nodeId)
    if (!node) return
    const next = new Map(nodes)
    next.set(nodeId, {
      ...node,
      fields: node.fields.map((f) =>
        f.fieldSystemId === fieldSystemId
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

  getVisibleNodes: () => {
    const { nodes, rootNodeId } = get()
    const root = nodes.get(rootNodeId)
    if (!root) return []
    const result: string[] = []
    const sortedChildren = [...root.children].sort((a, b) => {
      const na = nodes.get(a)
      const nb = nodes.get(b)
      return (na?.order ?? '').localeCompare(nb?.order ?? '')
    })
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
}))
