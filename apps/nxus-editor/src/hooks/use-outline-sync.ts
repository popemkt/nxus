import { useCallback, useRef } from 'react'
import {
  createNodeServerFn,
  updateNodeContentServerFn,
  deleteNodeServerFn,
  reparentNodeServerFn,
  reorderNodeServerFn,
} from '@/services/outline.server'
import { useOutlineStore } from '@/stores/outline.store'
import { WORKSPACE_ROOT_ID } from '@/types/outline'

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

              const persistedNode = useOutlineStore.getState().nodes.get(result.nodeId)
              if (persistedNode?.content) {
                syncContent(result.nodeId, persistedNode.content)
              }
            }
          })
          .catch((err) => {
            console.error('[sync] Failed to create node:', err)
          })
      }
      return newId
    },
    [syncContent],
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
    useOutlineStore.getState().deleteNode(nodeId)
    deleteNodeServerFn({ data: { nodeId } }).catch((err) => {
      console.error('[sync] Failed to delete node:', err)
    })
  }, [])

  /**
   * Indent node — optimistic + persist reparent.
   */
  const indentNode = useCallback((nodeId: string) => {
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

  return {
    createNodeAfter,
    updateNodeContent,
    deleteNode,
    indentNode,
    outdentNode,
    moveNodeUp,
    moveNodeDown,
    syncContent,
  }
}
