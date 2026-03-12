import { create } from 'zustand'
import type { NodeMap, OutlineField, OutlineNode, SupertagBadge } from '@/types/outline'
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
  updateFieldValue: (nodeId: string, fieldId: string, value: unknown) => void
  addSupertag: (nodeId: string, supertag: SupertagBadge, newFields: OutlineField[]) => void
  removeSupertag: (nodeId: string, supertagId: string) => void
  addField: (nodeId: string, field: OutlineField) => void
  removeField: (nodeId: string, fieldId: string) => void
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
const ORDER_STEP = 1000

function generateId(): string {
  return `node-${Date.now()}-${nextId++}`
}

function generateOrder(index: number): string {
  return String(index).padStart(8, '0')
}

function parseOrder(order: string | null): number | null {
  if (!order) return null
  const parsed = Number.parseInt(order, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function generateOrderBetween(a: string | null, b: string | null): string | null {
  const aNum = parseOrder(a)
  const bNum = parseOrder(b)
  if (aNum === null && bNum === null) return generateOrder(500_000)
  if (aNum === null && bNum !== null) {
    return generateOrder(Math.max(0, Math.floor(bNum / 2)))
  }
  if (aNum !== null && bNum === null) return generateOrder(aNum + ORDER_STEP)
  if (aNum === null || bNum === null) return null
  const gap = bNum - aNum
  if (gap > 1) {
    return generateOrder(aNum + Math.floor(gap / 2))
  }
  return null
}

function sortNodeIds(nodeIds: string[], nodes: NodeMap): string[] {
  return [...nodeIds].sort((a, b) => {
    const na = nodes.get(a)
    const nb = nodes.get(b)
    const orderCmp = (na?.order ?? '').localeCompare(nb?.order ?? '')
    if (orderCmp !== 0) return orderCmp
    return (na?.createdAt ?? 0) - (nb?.createdAt ?? 0)
  })
}

function rebalanceChildren(nodes: NodeMap, parentId: string): NodeMap {
  const parent = nodes.get(parentId)
  if (!parent) return nodes

  const sortedChildren = sortNodeIds(parent.children, nodes)
  if (sortedChildren.length === 0) return nodes

  const next = new Map(nodes)
  for (const [index, childId] of sortedChildren.entries()) {
    const child = next.get(childId)
    if (!child) continue
    next.set(childId, {
      ...child,
      order: generateOrder((index + 1) * ORDER_STEP),
    })
  }

  next.set(parentId, {
    ...parent,
    children: sortedChildren,
  })

  return next
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

  updateFieldValue: (nodeId, fieldId, value) => {
    const { nodes } = get()
    const node = nodes.get(nodeId)
    if (!node) return
    const next = new Map(nodes)
    next.set(nodeId, {
      ...node,
      fields: node.fields.map((f) =>
        f.fieldId === fieldId
          ? { ...f, values: [{ value, order: f.values[0]?.order ?? 0 }] }
          : f,
      ),
    })
    set({ nodes: next })
  },

  addSupertag: (nodeId, supertag, newFields) => {
    const { nodes } = get()
    const node = nodes.get(nodeId)
    if (!node) return
    // Skip if already has this supertag
    if (node.supertags.some((t) => t.id === supertag.id)) return
    const next = new Map(nodes)
    // Merge new fields, skipping duplicates by fieldId
    const existingFieldIds = new Set(node.fields.map((f) => f.fieldId))
    const fieldsToAdd = newFields.filter((f) => !existingFieldIds.has(f.fieldId))
    next.set(nodeId, {
      ...node,
      supertags: [...node.supertags, supertag],
      fields: [...node.fields, ...fieldsToAdd],
    })
    set({ nodes: next })
  },

  removeSupertag: (nodeId, supertagId) => {
    const { nodes } = get()
    const node = nodes.get(nodeId)
    if (!node) return
    const next = new Map(nodes)
    next.set(nodeId, {
      ...node,
      supertags: node.supertags.filter((t) => t.id !== supertagId),
      // Fields are kept (Tana behavior — no data loss on tag removal)
    })
    set({ nodes: next })
  },

  addField: (nodeId, field) => {
    const { nodes } = get()
    const node = nodes.get(nodeId)
    if (!node) return
    if (node.fields.some((f) => f.fieldId === field.fieldId)) return
    const next = new Map(nodes)
    next.set(nodeId, {
      ...node,
      fields: [...node.fields, field],
    })
    set({ nodes: next })
  },

  removeField: (nodeId, fieldId) => {
    const { nodes } = get()
    const node = nodes.get(nodeId)
    if (!node) return
    const next = new Map(nodes)
    next.set(nodeId, {
      ...node,
      fields: node.fields.filter((f) => f.fieldId !== fieldId),
    })
    set({ nodes: next })
  },

  createNodeAfter: (afterId) => {
    const { nodes } = get()
    let workingNodes = nodes
    const afterNode = workingNodes.get(afterId)
    if (!afterNode) return afterId

    const parentId = afterNode.parentId
    if (!parentId) return afterId

    let parent = workingNodes.get(parentId)
    if (!parent) return afterId

    const newId = generateId()
    let sortedSiblings = sortNodeIds(parent.children, workingNodes)
    let afterIndex = sortedSiblings.indexOf(afterId)
    let nextSiblingId = sortedSiblings[afterIndex + 1]
    let newOrder = generateOrderBetween(
      afterNode.order,
      nextSiblingId ? workingNodes.get(nextSiblingId)?.order ?? null : null,
    )

    if (!newOrder) {
      workingNodes = rebalanceChildren(workingNodes, parentId)
      parent = workingNodes.get(parentId)
      if (!parent) return afterId
      sortedSiblings = sortNodeIds(parent.children, workingNodes)
      afterIndex = sortedSiblings.indexOf(afterId)
      nextSiblingId = sortedSiblings[afterIndex + 1]
      const rebalancedAfterNode = workingNodes.get(afterId)
      newOrder = generateOrderBetween(
        rebalancedAfterNode?.order ?? null,
        nextSiblingId ? workingNodes.get(nextSiblingId)?.order ?? null : null,
      )
    }

    if (!newOrder) return afterId

    const newNode: OutlineNode = {
      id: newId,
      content: '',
      parentId,
      children: [],
      order: newOrder,
      collapsed: false,
      supertags: [],
      fields: [],
    }

    const next = new Map(workingNodes)
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

    const sortedSiblings = sortNodeIds(parent.children, nodes)
    const myIndex = sortedSiblings.indexOf(id)
    if (myIndex <= 0) return

    const newParentId = sortedSiblings[myIndex - 1]!
    const newParent = nodes.get(newParentId)
    if (!newParent) return

    const lastChildOrder =
      newParent.children.length > 0
        ? sortNodeIds(newParent.children, nodes)
            .map((c) => nodes.get(c)?.order ?? '0')
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
      order: generateOrderBetween(lastChildOrder, null) ?? generateOrder(ORDER_STEP),
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

    let workingNodes = next
    let gpSortedChildren = sortNodeIds(grandparent.children, workingNodes)
    let parentIndex = gpSortedChildren.indexOf(node.parentId)
    let nextUncleId = gpSortedChildren[parentIndex + 1]
    let newOrder = generateOrderBetween(
      parent.order,
      nextUncleId ? workingNodes.get(nextUncleId)?.order ?? null : null,
    )

    if (!newOrder) {
      workingNodes = rebalanceChildren(workingNodes, parent.parentId)
      gpSortedChildren = sortNodeIds(grandparent.children, workingNodes)
      parentIndex = gpSortedChildren.indexOf(node.parentId)
      nextUncleId = gpSortedChildren[parentIndex + 1]
      const rebalancedParent = workingNodes.get(node.parentId)
      newOrder = generateOrderBetween(
        rebalancedParent?.order ?? null,
        nextUncleId ? workingNodes.get(nextUncleId)?.order ?? null : null,
      )
    }

    if (!newOrder) return

    const updatedGrandparent = workingNodes.get(parent.parentId)
    if (!updatedGrandparent) return

    workingNodes.set(parent.parentId, {
      ...updatedGrandparent,
      children: [...updatedGrandparent.children, id],
    })
    workingNodes.set(id, {
      ...node,
      parentId: parent.parentId,
      order: newOrder,
    })
    set({ nodes: workingNodes })
  },

  moveNodeUp: (id) => {
    const { nodes } = get()
    const node = nodes.get(id)
    if (!node || !node.parentId) return

    const parent = nodes.get(node.parentId)
    if (!parent) return

    const sortedSiblings = sortNodeIds(parent.children, nodes)
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

    const sortedSiblings = sortNodeIds(parent.children, nodes)
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
}))
