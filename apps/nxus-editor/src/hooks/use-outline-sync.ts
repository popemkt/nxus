import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  createNodeServerFn,
  updateNodeContentServerFn,
  deleteNodeServerFn,
  reparentNodeServerFn,
  reorderNodeServerFn,
  setFieldValueServerFn,
} from '@/services/outline.server'
import {
  addSupertagServerFn,
  removeSupertagServerFn,
} from '@/services/supertag.server'
import { clearFieldServerFn } from '@/services/field.server'
import { outlineQueryKeys } from '@/components/outline/query-helpers'
import { useOutlineStore } from '@/stores/outline.store'
import { useUndoStore } from '@/stores/undo.store'
import type { OutlineField, SupertagBadge } from '@/types/outline'

/** Result type from createNodeServerFn */
interface CreateNodeResult {
  success: true
  nodeId: string
  appliedSupertag: { id: string; name: string; systemId: string; color: string | null } | null
  appliedFields: OutlineField[]
}
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
  const queryClient = useQueryClient()

  // Clear pending content debounce timers on unmount
  useEffect(() => {
    const timers = contentTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    }
  }, [])

  /** Invalidate all outline query evaluations so results refresh after data changes */
  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: outlineQueryKeys.all })
  }, [queryClient])

  /** Capture the current node map state before a mutation for undo support */
  const captureUndoSnapshot = useCallback(() => {
    const { nodes } = useOutlineStore.getState()
    useUndoStore.getState().pushSnapshot(nodes)
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
        updateNodeContentServerFn({ data: { nodeId, content } })
          .then(() => invalidateQueries())
          .catch((err) => {
            console.error('[sync] Failed to update content:', err)
          })
      }, 500),
    )
  }, [invalidateQueries])

  /**
   * Create node — optimistic in store, then persist.
   */
  const createNodeAfter = useCallback(
    (afterId: string, initialContent?: string) => {
      captureUndoSnapshot()
      const { createNodeAfter: storeCreate } = useOutlineStore.getState()
      const newId = storeCreate(afterId, initialContent)

      // Read fresh state after mutation
      const { nodes } = useOutlineStore.getState()
      const node = nodes.get(newId)
      if (node && node.parentId) {
        const serverParentId = toServerParentId(node.parentId)
        createNodeServerFn({
          data: {
            content: initialContent ?? '',
            parentId: serverParentId,
            order: parseInt(node.order, 10) || 0,
          },
        })
          .then((_result: unknown) => {
            const result = _result as CreateNodeResult
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

                // Merge default-child-supertag data from server
                const mergedNode = { ...tempNode, id: result.nodeId }
                if (result.appliedSupertag) {
                  mergedNode.supertags = [...mergedNode.supertags, result.appliedSupertag]
                }
                if (result.appliedFields && result.appliedFields.length > 0) {
                  const existingFieldIds = new Set(mergedNode.fields.map((f: OutlineField) => f.fieldId))
                  const newFields = result.appliedFields.filter((f: OutlineField) => !existingFieldIds.has(f.fieldId))
                  mergedNode.fields = [...mergedNode.fields, ...newFields]
                }
                next.set(result.nodeId, mergedNode)

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

                // Remap selectedNodeIds if it contains the temp ID
                const newSelectedNodeIds = state.selectedNodeIds.has(newId)
                  ? new Set([...state.selectedNodeIds].map((id) => id === newId ? result.nodeId : id))
                  : state.selectedNodeIds

                return {
                  nodes: next,
                  activeNodeId:
                    state.activeNodeId === newId ? result.nodeId : state.activeNodeId,
                  selectedNodeId:
                    state.selectedNodeId === newId
                      ? result.nodeId
                      : state.selectedNodeId,
                  selectedNodeIds: newSelectedNodeIds,
                }
              })

              const persistedNode = useOutlineStore.getState().nodes.get(result.nodeId)
              if (persistedNode?.content) {
                syncContent(result.nodeId, persistedNode.content)
              }
            } else if (result.success) {
              // Server ID matches temp ID — still merge supertag/fields if present
              if (result.appliedSupertag || (result.appliedFields && result.appliedFields.length > 0)) {
                useOutlineStore.setState((state) => {
                  const node = state.nodes.get(newId)
                  if (!node) return state
                  const next = new Map(state.nodes)
                  const updated = { ...node }
                  if (result.appliedSupertag) {
                    updated.supertags = [...updated.supertags, result.appliedSupertag]
                  }
                  if (result.appliedFields && result.appliedFields.length > 0) {
                    const existingFieldIds = new Set(updated.fields.map((f: OutlineField) => f.fieldId))
                    const newFields = result.appliedFields.filter((f: OutlineField) => !existingFieldIds.has(f.fieldId))
                    updated.fields = [...updated.fields, ...newFields]
                  }
                  next.set(newId, updated)
                  return { nodes: next }
                })
              }
            }
            invalidateQueries()
          })
          .catch((err) => {
            console.error('[sync] Failed to create node:', err)
          })
      }
      return newId
    },
    [syncContent, invalidateQueries, captureUndoSnapshot],
  )

  /**
   * Create the first child of a parent node (when outline is empty).
   */
  const createFirstChild = useCallback(
    (parentId: string) => {
      captureUndoSnapshot()
      const { createFirstChild: storeCreate } = useOutlineStore.getState()
      const newId = storeCreate(parentId)

      const { nodes } = useOutlineStore.getState()
      const node = nodes.get(newId)
      if (node && node.parentId) {
        const serverParentId = toServerParentId(node.parentId)
        createNodeServerFn({
          data: {
            content: '',
            parentId: serverParentId,
            order: parseInt(node.order, 10) || 0,
          },
        })
          .then((_result: unknown) => {
            const result = _result as CreateNodeResult
            if (result.success && result.nodeId !== newId) {
              // Cancel any pending content debounce for the temp ID
              const pendingTimer = contentTimers.current.get(newId)
              if (pendingTimer) {
                clearTimeout(pendingTimer)
                contentTimers.current.delete(newId)
              }

              useOutlineStore.setState((state) => {
                const tempNode = state.nodes.get(newId)
                if (!tempNode) return state
                const next = new Map(state.nodes)
                next.delete(newId)

                // Merge default-child-supertag data from server
                const mergedNode = { ...tempNode, id: result.nodeId }
                if (result.appliedSupertag) {
                  mergedNode.supertags = [...mergedNode.supertags, result.appliedSupertag]
                }
                if (result.appliedFields && result.appliedFields.length > 0) {
                  const existingFieldIds = new Set(mergedNode.fields.map((f: OutlineField) => f.fieldId))
                  const newFields = result.appliedFields.filter((f: OutlineField) => !existingFieldIds.has(f.fieldId))
                  mergedNode.fields = [...mergedNode.fields, ...newFields]
                }
                next.set(result.nodeId, mergedNode)

                const parent = tempNode.parentId ? next.get(tempNode.parentId) : null
                if (parent && tempNode.parentId) {
                  next.set(tempNode.parentId, {
                    ...parent,
                    children: parent.children.map((c) => c === newId ? result.nodeId : c),
                  })
                }
                const newSelectedNodeIds = state.selectedNodeIds.has(newId)
                  ? new Set([...state.selectedNodeIds].map((id) => id === newId ? result.nodeId : id))
                  : state.selectedNodeIds

                return {
                  nodes: next,
                  activeNodeId: state.activeNodeId === newId ? result.nodeId : state.activeNodeId,
                  selectedNodeId: state.selectedNodeId === newId ? result.nodeId : state.selectedNodeId,
                  selectedNodeIds: newSelectedNodeIds,
                }
              })

              // Transfer any pending content save to the new server ID
              const persistedNode = useOutlineStore.getState().nodes.get(result.nodeId)
              if (persistedNode?.content) {
                syncContent(result.nodeId, persistedNode.content)
              }
            } else if (result.success) {
              // Server ID matches temp ID — still merge supertag/fields if present
              if (result.appliedSupertag || (result.appliedFields && result.appliedFields.length > 0)) {
                useOutlineStore.setState((state) => {
                  const node = state.nodes.get(newId)
                  if (!node) return state
                  const next = new Map(state.nodes)
                  const updated = { ...node }
                  if (result.appliedSupertag) {
                    updated.supertags = [...updated.supertags, result.appliedSupertag]
                  }
                  if (result.appliedFields && result.appliedFields.length > 0) {
                    const existingFieldIds = new Set(updated.fields.map((f: OutlineField) => f.fieldId))
                    const newFields = result.appliedFields.filter((f: OutlineField) => !existingFieldIds.has(f.fieldId))
                    updated.fields = [...updated.fields, ...newFields]
                  }
                  next.set(newId, updated)
                  return { nodes: next }
                })
              }
            }
            invalidateQueries()
          })
          .catch((err) => {
            console.error('[sync] Failed to create first child:', err)
          })
      }
      return newId
    },
    [syncContent, invalidateQueries, captureUndoSnapshot],
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
    captureUndoSnapshot()
    useOutlineStore.getState().deleteNode(nodeId)
    deleteNodeServerFn({ data: { nodeId } })
      .then(() => invalidateQueries())
      .catch((err) => {
        console.error('[sync] Failed to delete node:', err)
      })
  }, [invalidateQueries, captureUndoSnapshot])

  /**
   * Indent node — optimistic + persist reparent.
   */
  const indentNode = useCallback((nodeId: string) => {
    captureUndoSnapshot()
    useOutlineStore.getState().indentNode(nodeId)
    const { nodes } = useOutlineStore.getState()
    const node = nodes.get(nodeId)
    if (node && node.parentId) {
      reparentNodeServerFn({
        data: {
          nodeId,
          newParentId: toServerParentId(node.parentId),
          order: parseInt(node.order, 10) || 0,
        },
      })
        .then(() => invalidateQueries())
        .catch((err) => {
          console.error('[sync] Failed to indent node:', err)
        })
    }
  }, [invalidateQueries, captureUndoSnapshot])

  /**
   * Outdent node — optimistic + persist reparent.
   */
  const outdentNode = useCallback((nodeId: string) => {
    captureUndoSnapshot()
    useOutlineStore.getState().outdentNode(nodeId)
    const { nodes } = useOutlineStore.getState()
    const node = nodes.get(nodeId)
    if (node && node.parentId) {
      reparentNodeServerFn({
        data: {
          nodeId,
          newParentId: toServerParentId(node.parentId),
          order: parseInt(node.order, 10) || 0,
        },
      })
        .then(() => invalidateQueries())
        .catch((err) => {
          console.error('[sync] Failed to outdent node:', err)
        })
    }
  }, [invalidateQueries, captureUndoSnapshot])

  /**
   * Move up/down — optimistic + persist both sides of order swap.
   */
  const moveNodeUp = useCallback((nodeId: string) => {
    captureUndoSnapshot()
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
      data: { nodeId, order: parseInt(node.order, 10) || 0 },
    })
      .then(() => invalidateQueries())
      .catch((err) => {
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
              data: { nodeId: sibId, order: parseInt(sib.order, 10) || 0 },
            }).catch((err) => {
              console.error('[sync] Failed to reorder swapped sibling:', err)
            })
            break
          }
        }
      }
    }
  }, [invalidateQueries, captureUndoSnapshot])

  const moveNodeDown = useCallback((nodeId: string) => {
    captureUndoSnapshot()
    const { nodes: preNodes } = useOutlineStore.getState()
    const preNode = preNodes.get(nodeId)
    const preOrder = preNode?.order

    useOutlineStore.getState().moveNodeDown(nodeId)

    const { nodes } = useOutlineStore.getState()
    const node = nodes.get(nodeId)
    if (!node || node.order === preOrder) return

    reorderNodeServerFn({
      data: { nodeId, order: parseInt(node.order, 10) || 0 },
    })
      .then(() => invalidateQueries())
      .catch((err) => {
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
              data: { nodeId: sibId, order: parseInt(sib.order, 10) || 0 },
            }).catch((err) => {
              console.error('[sync] Failed to reorder swapped sibling:', err)
            })
            break
          }
        }
      }
    }
  }, [invalidateQueries, captureUndoSnapshot])

  /**
   * Add supertag — optimistic add to store, then persist via server.
   * Server returns inherited fields which are merged into store.
   */
  const addSupertag = useCallback(
    (nodeId: string, supertag: SupertagBadge, newFields: OutlineField[]) => {
      useOutlineStore.getState().addSupertag(nodeId, supertag, newFields)

      if (!supertag.systemId) return
      addSupertagServerFn({ data: { nodeId, supertagSystemId: supertag.systemId } })
        .then((result) => {
          if (result.success && result.newFields) {
            // Merge any additional fields from server that weren't in the optimistic set
            const { nodes } = useOutlineStore.getState()
            const node = nodes.get(nodeId)
            if (node) {
              const existingFieldIds = new Set(node.fields.map((f) => f.fieldId))
              const extraFields = result.newFields.filter(
                (f) => !existingFieldIds.has(f.fieldId),
              ) as OutlineField[]
              if (extraFields.length > 0) {
                for (const f of extraFields) {
                  useOutlineStore.getState().addField(nodeId, f)
                }
              }
            }
          }
          invalidateQueries()
        })
        .catch((err) => {
          console.error('[sync] Failed to add supertag:', err)
        })
    },
    [invalidateQueries],
  )

  /**
   * Remove supertag — optimistic remove from store, then persist.
   * Fields are kept (Tana behavior).
   */
  const removeSupertag = useCallback(
    (nodeId: string, supertagId: string, supertagSystemId: string | null) => {
      useOutlineStore.getState().removeSupertag(nodeId, supertagId)
      if (!supertagSystemId) return
      removeSupertagServerFn({ data: { nodeId, supertagSystemId } })
        .then(() => invalidateQueries())
        .catch((err) => {
          console.error('[sync] Failed to remove supertag:', err)
        })
    },
    [invalidateQueries],
  )

  /**
   * Add field — optimistic add to store, persist with empty/default value.
   */
  const addField = useCallback(
    (nodeId: string, field: OutlineField) => {
      useOutlineStore.getState().addField(nodeId, field)
      // Persist with empty value to materialize the field
      setFieldValueServerFn({
        data: { nodeId, fieldId: field.fieldId, value: '' },
      }).catch((err) => {
        console.error('[sync] Failed to add field:', err)
      })
    },
    [],
  )

  /**
   * Remove field — optimistic remove from store, clear on server.
   */
  const removeField = useCallback(
    (nodeId: string, fieldId: string) => {
      useOutlineStore.getState().removeField(nodeId, fieldId)
      clearFieldServerFn({ data: { nodeId, fieldId } })
        .then(() => invalidateQueries())
        .catch((err) => {
          console.error('[sync] Failed to remove field:', err)
        })
    },
    [invalidateQueries],
  )

  /**
   * Move a node under another node.
   */
  const moveNodeTo = useCallback(
    (nodeId: string, newParentId: string) => {
      useOutlineStore.getState().moveNodeTo(nodeId, newParentId)
      const { nodes } = useOutlineStore.getState()
      const node = nodes.get(nodeId)
      if (!node) return

      reparentNodeServerFn({
        data: {
          nodeId,
          newParentId: toServerParentId(newParentId),
          order: parseInt(node.order, 10) || 0,
        },
      })
        .then(() => invalidateQueries())
        .catch((err) => {
          console.error('[sync] Failed to move node:', err)
        })
    },
    [invalidateQueries],
  )

  /**
   * Undo — restore the previous node map snapshot.
   */
  const undo = useCallback(() => {
    const { nodes: currentNodes } = useOutlineStore.getState()
    const snapshot = useUndoStore.getState().undo(currentNodes)
    if (!snapshot) return
    useOutlineStore.setState({ nodes: snapshot })
  }, [])

  /**
   * Redo — restore the next node map snapshot.
   */
  const redo = useCallback(() => {
    const { nodes: currentNodes } = useOutlineStore.getState()
    const snapshot = useUndoStore.getState().redo(currentNodes)
    if (!snapshot) return
    useOutlineStore.setState({ nodes: snapshot })
  }, [])

  return {
    createNodeAfter,
    createFirstChild,
    updateNodeContent,
    deleteNode,
    indentNode,
    outdentNode,
    moveNodeUp,
    moveNodeDown,
    syncContent,
    addSupertag,
    removeSupertag,
    addField,
    removeField,
    moveNodeTo,
    undo,
    redo,
  }
}
