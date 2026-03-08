import { useCallback, useRef } from 'react'
import {
  createNodeServerFn,
  updateNodeContentServerFn,
  deleteNodeServerFn,
  reparentNodeServerFn,
  reorderNodeServerFn,
} from '@/services/outline.server'
import { useOutlineStore } from '@/stores/outline.store'

/**
 * Hook that wraps outline store mutations with server persistence.
 *
 * Pattern: optimistic update in Zustand store (instant UI), then
 * fire-and-forget server call to persist. If the server call fails,
 * we log but don't roll back — the local state is the source of truth
 * during the session, and data will be re-fetched on next load.
 */
export function useOutlineSync() {
  const store = useOutlineStore()
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
      const newId = store.createNodeAfter(afterId)
      const node = store.nodes.get(newId)
      if (node && node.parentId) {
        createNodeServerFn({
          data: {
            content: '',
            parentId: node.parentId,
            order: parseInt(node.order, 10),
          },
        })
          .then((result) => {
            if (result.success && result.nodeId !== newId) {
              // Replace temp ID with server ID in the store
              const { nodes } = useOutlineStore.getState()
              const tempNode = nodes.get(newId)
              if (!tempNode) return

              const next = new Map(nodes)
              next.delete(newId)
              next.set(result.nodeId, { ...tempNode, id: result.nodeId })

              // Update parent's children array
              const parent = next.get(tempNode.parentId!)
              if (parent) {
                next.set(tempNode.parentId!, {
                  ...parent,
                  children: parent.children.map((c) =>
                    c === newId ? result.nodeId : c,
                  ),
                })
              }

              const state = useOutlineStore.getState()
              useOutlineStore.setState({
                nodes: next,
                activeNodeId:
                  state.activeNodeId === newId ? result.nodeId : state.activeNodeId,
                selectedNodeId:
                  state.selectedNodeId === newId
                    ? result.nodeId
                    : state.selectedNodeId,
              })
            }
          })
          .catch((err) => {
            console.error('[sync] Failed to create node:', err)
          })
      }
      return newId
    },
    [store],
  )

  /**
   * Update content — optimistic + debounced persist.
   */
  const updateNodeContent = useCallback(
    (nodeId: string, content: string) => {
      store.updateNodeContent(nodeId, content)
      syncContent(nodeId, content)
    },
    [store, syncContent],
  )

  /**
   * Delete node — optimistic + persist.
   */
  const deleteNode = useCallback(
    (nodeId: string) => {
      store.deleteNode(nodeId)
      deleteNodeServerFn({ data: { nodeId } }).catch((err) => {
        console.error('[sync] Failed to delete node:', err)
      })
    },
    [store],
  )

  /**
   * Indent node — optimistic + persist reparent.
   */
  const indentNode = useCallback(
    (nodeId: string) => {
      store.indentNode(nodeId)
      const node = store.nodes.get(nodeId)
      if (node && node.parentId) {
        reparentNodeServerFn({
          data: {
            nodeId,
            newParentId: node.parentId,
            order: parseInt(node.order, 10),
          },
        }).catch((err) => {
          console.error('[sync] Failed to indent node:', err)
        })
      }
    },
    [store],
  )

  /**
   * Outdent node — optimistic + persist reparent.
   */
  const outdentNode = useCallback(
    (nodeId: string) => {
      store.outdentNode(nodeId)
      const node = store.nodes.get(nodeId)
      if (node && node.parentId) {
        reparentNodeServerFn({
          data: {
            nodeId,
            newParentId: node.parentId,
            order: parseInt(node.order, 10),
          },
        }).catch((err) => {
          console.error('[sync] Failed to outdent node:', err)
        })
      }
    },
    [store],
  )

  /**
   * Move up/down — optimistic + persist reorder for both swapped nodes.
   */
  const moveNodeUp = useCallback(
    (nodeId: string) => {
      store.moveNodeUp(nodeId)
      const node = store.nodes.get(nodeId)
      if (node) {
        reorderNodeServerFn({
          data: { nodeId, order: parseInt(node.order, 10) },
        }).catch((err) => {
          console.error('[sync] Failed to reorder node:', err)
        })
      }
    },
    [store],
  )

  const moveNodeDown = useCallback(
    (nodeId: string) => {
      store.moveNodeDown(nodeId)
      const node = store.nodes.get(nodeId)
      if (node) {
        reorderNodeServerFn({
          data: { nodeId, order: parseInt(node.order, 10) },
        }).catch((err) => {
          console.error('[sync] Failed to reorder node:', err)
        })
      }
    },
    [store],
  )

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
