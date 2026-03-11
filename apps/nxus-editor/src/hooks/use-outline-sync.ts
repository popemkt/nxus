import { useCallback, useRef } from 'react'
import {
  addFieldToNodeServerFn,
  applySupertagToNodeServerFn,
  createNodeServerFn,
  createSupertagServerFn,
  updateNodeContentServerFn,
  deleteNodeServerFn,
  undeleteNodeServerFn,
  reparentNodeServerFn,
  reorderNodeServerFn,
} from '@/services/outline.server'
import { useOutlineStore } from '@/stores/outline.store'
import type { NodeMap } from '@/types/outline'
import type {
  OutlineDropPosition,
  OutlineNode,
  OutlineSupertagDefinition,
} from '@/types/outline'
import { WORKSPACE_ROOT_ID } from '@/types/outline'

/**
 * Sync the diff between two NodeMaps to the server.
 * Compares `before` (pre-change) and `after` (post-change) to determine
 * which server calls are needed: delete, undelete, reparent, reorder, or content update.
 */
function syncNodeDiff(before: NodeMap, after: NodeMap): void {
  // Nodes removed (in before but not after) → delete on server
  for (const [id] of before) {
    if (id === WORKSPACE_ROOT_ID) continue
    if (!after.has(id)) {
      deleteNodeServerFn({ data: { nodeId: id } }).catch((err) => {
        console.error('[undo-sync] Failed to delete node:', err)
      })
    }
  }

  // Nodes added (in after but not before) → undelete on server
  for (const [id] of after) {
    if (id === WORKSPACE_ROOT_ID) continue
    if (!before.has(id)) {
      undeleteNodeServerFn({ data: { nodeId: id } }).catch((err) => {
        console.error('[undo-sync] Failed to restore node:', err)
      })
    }
  }

  // Nodes that exist in both — check for changes
  for (const [id, afterNode] of after) {
    if (id === WORKSPACE_ROOT_ID) continue
    const beforeNode = before.get(id)
    if (!beforeNode) continue

    if (beforeNode.content !== afterNode.content) {
      updateNodeContentServerFn({ data: { nodeId: id, content: afterNode.content } }).catch((err) => {
        console.error('[undo-sync] Failed to update content:', err)
      })
    }

    if (beforeNode.parentId !== afterNode.parentId) {
      reparentNodeServerFn({
        data: {
          nodeId: id,
          newParentId: toServerParentId(afterNode.parentId),
          order: parseInt(afterNode.order, 10),
        },
      }).catch((err) => {
        console.error('[undo-sync] Failed to reparent node:', err)
      })
    } else if (beforeNode.order !== afterNode.order) {
      reorderNodeServerFn({
        data: { nodeId: id, order: parseInt(afterNode.order, 10) },
      }).catch((err) => {
        console.error('[undo-sync] Failed to reorder node:', err)
      })
    }
  }
}

type MergeNodesResult = {
  success: true
  nodes: OutlineNode[]
}

type CreateSupertagResult = MergeNodesResult & {
  supertag: OutlineSupertagDefinition
}

/**
 * Map store parentId to server parentId.
 * The workspace root is a local-only virtual node — in the DB,
 * top-level nodes have ownerId = null.
 */
function toServerParentId(parentId: string | null): string | null {
  if (parentId === WORKSPACE_ROOT_ID) return null
  return parentId
}

/**
 * Hook that wraps outline store mutations with server persistence.
 *
 * Pattern: optimistic update in Zustand store (instant UI), then
 * fire-and-forget server call to persist. If the server call fails,
 * we log but don't roll back — the local state is the source of truth
 * during the session, and data will be re-fetched on next load.
 *
 * Uses getState() instead of subscribing to avoid re-renders.
 */
export function useOutlineSync() {
  const contentTimers = useRef(new Map<string, NodeJS.Timeout>())

  const mergeNodes = useCallback((nodes: OutlineNode[]) => {
    useOutlineStore.getState().mergeNodes(nodes)
  }, [])

  /**
   * Debounced content save — waits 500ms after last keystroke before persisting.
   */
  const syncContent = useCallback((nodeId: string, content: string) => {
    const timers = contentTimers.current
    const existing = timers.get(nodeId)
    if (existing) clearTimeout(existing)

    timers.set(
      nodeId,
      setTimeout(() => {
        timers.delete(nodeId)
        updateNodeContentServerFn({ data: { nodeId, content } }).catch((err) => {
          console.error('[sync] Failed to update content:', err)
        })
      }, 500),
    )
  }, [])

  /**
   * Create node — optimistic in store, then persist.
   */
  const createNodeAfter = useCallback(
    (afterId: string) => {
      useOutlineStore.getState().pushUndo()
      const { createNodeAfter: storeCreate } = useOutlineStore.getState()
      const newId = storeCreate(afterId)

      // Read fresh state after mutation
      const { nodes } = useOutlineStore.getState()
      const node = nodes.get(newId)
      if (node && node.parentId) {
        const serverParentId = toServerParentId(node.parentId)
        createNodeServerFn({
          data: {
            content: '',
            parentId: serverParentId,
            order: parseInt(node.order, 10),
          },
        })
          .then((result) => {
            if (result.success && result.nodeId !== newId) {
              // Cancel any pending content debounce for the temp ID
              const pendingTimer = contentTimers.current.get(newId)
              if (pendingTimer) {
                clearTimeout(pendingTimer)
                contentTimers.current.delete(newId)
              }

              // Atomic state update to replace temp ID with server ID
              useOutlineStore.setState((state) => {
                const tempNode = state.nodes.get(newId)
                if (!tempNode) return state

                const next = new Map(state.nodes)
                next.delete(newId)
                next.set(result.nodeId, { ...tempNode, id: result.nodeId })

                // Update parent's children array
                const parent = tempNode.parentId ? next.get(tempNode.parentId) : null
                if (parent && tempNode.parentId) {
                  next.set(tempNode.parentId, {
                    ...parent,
                    children: parent.children.map((c) =>
                      c === newId ? result.nodeId : c,
                    ),
                  })
                }

                return {
                  nodes: next,
                  activeNodeId:
                    state.activeNodeId === newId ? result.nodeId : state.activeNodeId,
                  selectedNodeId:
                    state.selectedNodeId === newId
                      ? result.nodeId
                      : state.selectedNodeId,
                }
              })
            }
          })
          .catch((err) => {
            console.error('[sync] Failed to create node:', err)
          })
      }
      return newId
    },
    [],
  )

  /**
   * Update content — optimistic + debounced persist.
   */
  const updateNodeContent = useCallback(
    (nodeId: string, content: string) => {
      useOutlineStore.getState().updateNodeContent(nodeId, content)
      syncContent(nodeId, content)
    },
    [syncContent],
  )

  /**
   * Delete node — optimistic + persist.
   */
  const deleteNode = useCallback((nodeId: string) => {
    useOutlineStore.getState().pushUndo()
    useOutlineStore.getState().deleteNode(nodeId)
    deleteNodeServerFn({ data: { nodeId } }).catch((err) => {
      console.error('[sync] Failed to delete node:', err)
    })
  }, [])

  /**
   * Indent node — optimistic + persist reparent.
   */
  const indentNode = useCallback((nodeId: string) => {
    useOutlineStore.getState().pushUndo()
    useOutlineStore.getState().indentNode(nodeId)
    const { nodes } = useOutlineStore.getState()
    const node = nodes.get(nodeId)
    if (node && node.parentId) {
      reparentNodeServerFn({
        data: {
          nodeId,
          newParentId: toServerParentId(node.parentId),
          order: parseInt(node.order, 10),
        },
      }).catch((err) => {
        console.error('[sync] Failed to indent node:', err)
      })
    }
  }, [])

  /**
   * Outdent node — optimistic + persist reparent.
   */
  const outdentNode = useCallback((nodeId: string) => {
    useOutlineStore.getState().pushUndo()
    useOutlineStore.getState().outdentNode(nodeId)
    const { nodes } = useOutlineStore.getState()
    const node = nodes.get(nodeId)
    if (node && node.parentId) {
      reparentNodeServerFn({
        data: {
          nodeId,
          newParentId: toServerParentId(node.parentId),
          order: parseInt(node.order, 10),
        },
      }).catch((err) => {
        console.error('[sync] Failed to outdent node:', err)
      })
    }
  }, [])

  /**
   * Move up/down — optimistic + persist both sides of order swap.
   */
  const moveNodeUp = useCallback((nodeId: string) => {
    useOutlineStore.getState().pushUndo()
    // Snapshot the pre-swap siblings to identify the swapped one
    const { nodes: preNodes } = useOutlineStore.getState()
    const preNode = preNodes.get(nodeId)
    const preOrder = preNode?.order

    useOutlineStore.getState().moveNodeUp(nodeId)

    const { nodes } = useOutlineStore.getState()
    const node = nodes.get(nodeId)
    if (!node || node.order === preOrder) return // no-op

    // Persist both the moved node and the swapped sibling
    reorderNodeServerFn({
      data: { nodeId, order: parseInt(node.order, 10) },
    }).catch((err) => {
      console.error('[sync] Failed to reorder node:', err)
    })

    // The sibling that was swapped now has our old order
    if (node.parentId) {
      const parent = nodes.get(node.parentId)
      if (parent) {
        for (const sibId of parent.children) {
          if (sibId === nodeId) continue
          const sib = nodes.get(sibId)
          if (sib && sib.order === preOrder) {
            reorderNodeServerFn({
              data: { nodeId: sibId, order: parseInt(sib.order, 10) },
            }).catch((err) => {
              console.error('[sync] Failed to reorder swapped sibling:', err)
            })
            break
          }
        }
      }
    }
  }, [])

  const moveNodeDown = useCallback((nodeId: string) => {
    useOutlineStore.getState().pushUndo()
    const { nodes: preNodes } = useOutlineStore.getState()
    const preNode = preNodes.get(nodeId)
    const preOrder = preNode?.order

    useOutlineStore.getState().moveNodeDown(nodeId)

    const { nodes } = useOutlineStore.getState()
    const node = nodes.get(nodeId)
    if (!node || node.order === preOrder) return

    reorderNodeServerFn({
      data: { nodeId, order: parseInt(node.order, 10) },
    }).catch((err) => {
      console.error('[sync] Failed to reorder node:', err)
    })

    if (node.parentId) {
      const parent = nodes.get(node.parentId)
      if (parent) {
        for (const sibId of parent.children) {
          if (sibId === nodeId) continue
          const sib = nodes.get(sibId)
          if (sib && sib.order === preOrder) {
            reorderNodeServerFn({
              data: { nodeId: sibId, order: parseInt(sib.order, 10) },
            }).catch((err) => {
              console.error('[sync] Failed to reorder swapped sibling:', err)
            })
            break
          }
        }
      }
    }
  }, [])

  const moveNode = useCallback(
    (nodeId: string, targetId: string, position: OutlineDropPosition) => {
      useOutlineStore.getState().pushUndo()
      const { nodes: previousNodes, moveNode: storeMoveNode } = useOutlineStore.getState()
      const previousNode = previousNodes.get(nodeId)
      const previousParentId = previousNode?.parentId ?? null
      const previousOrder = previousNode?.order ?? null

      const moved = storeMoveNode(nodeId, targetId, position)
      if (!moved) return false

      const { nodes } = useOutlineStore.getState()
      const node = nodes.get(nodeId)
      if (!node) return false

      const orderChanged = node.order !== previousOrder
      const parentChanged = node.parentId !== previousParentId

      if (!orderChanged && !parentChanged) return false

      const payload = {
        nodeId,
        order: parseInt(node.order, 10),
      }

      if (parentChanged) {
        reparentNodeServerFn({
          data: {
            ...payload,
            newParentId: toServerParentId(node.parentId),
          },
        }).catch((err) => {
          console.error('[sync] Failed to move node:', err)
        })

        return true
      }

      reorderNodeServerFn({ data: payload }).catch((err) => {
        console.error('[sync] Failed to reorder node:', err)
      })

      return true
    },
    [],
  )

  const addFieldToNode = useCallback(
    async (nodeId: string, fieldId: string, value: unknown) => {
      const result = (await addFieldToNodeServerFn({
        data: { nodeId, fieldId, value },
      })) as MergeNodesResult

      if (result.success) {
        mergeNodes(result.nodes)
      }
    },
    [mergeNodes],
  )

  const applySupertagToNode = useCallback(
    async (nodeId: string, supertagId: string) => {
      const result = (await applySupertagToNodeServerFn({
        data: { nodeId, supertagId },
      })) as MergeNodesResult

      if (result.success) {
        mergeNodes(result.nodes)
      }
    },
    [mergeNodes],
  )

  const createSupertag = useCallback(
    async (
      nodeId: string,
      name: string,
    ): Promise<OutlineSupertagDefinition | null> => {
      const result = (await createSupertagServerFn({
        data: { nodeId, name },
      })) as CreateSupertagResult

      if (!result.success) return null

      mergeNodes(result.nodes)
      return result.supertag
    },
    [mergeNodes],
  )

  /**
   * Undo last structural operation — restore store state and sync diff to server.
   */
  const undo = useCallback(() => {
    const beforeNodes = useOutlineStore.getState().nodes
    const prevSnapshot = useOutlineStore.getState().undo()
    if (!prevSnapshot) return
    const afterNodes = useOutlineStore.getState().nodes
    syncNodeDiff(beforeNodes, afterNodes)
  }, [])

  /**
   * Redo last undone operation — restore store state and sync diff to server.
   */
  const redo = useCallback(() => {
    const beforeNodes = useOutlineStore.getState().nodes
    const prevSnapshot = useOutlineStore.getState().redo()
    if (!prevSnapshot) return
    const afterNodes = useOutlineStore.getState().nodes
    syncNodeDiff(beforeNodes, afterNodes)
  }, [])

  return {
    addFieldToNode,
    applySupertagToNode,
    createSupertag,
    createNodeAfter,
    updateNodeContent,
    deleteNode,
    indentNode,
    outdentNode,
    moveNode,
    moveNodeUp,
    moveNodeDown,
    syncContent,
    undo,
    redo,
  }
}
