import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { orderKeyToNumber } from '@nxus/db'
import {
  createNodeServerFn,
  updateNodeContentServerFn,
  deleteNodeServerFn,
  restoreNodeServerFn,
  reparentNodeServerFn,
  reorderNodeServerFn,
  swapOrderServerFn,
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
import { diffOutlineSnapshots } from '@/lib/outline-diff'
import type { NodeMap, OutlineField, SupertagBadge } from '@/types/outline'

/** Result type from createNodeServerFn */
interface CreateNodeResult {
  success: true
  nodeId: string
  appliedSupertag: { id: string; name: string; systemId: string; color: string | null } | null
  appliedFields: OutlineField[]
}
import { WORKSPACE_ROOT_ID } from '@/types/outline'

type CachedOutlineNode = { id: string; content: string }
type CachedOutlineQueryData = {
  success: true
  nodes: CachedOutlineNode[]
  rootId?: string
  totalCount?: number
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

function toPersistedOrder(order: string): number {
  return orderKeyToNumber(order)
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
  const contentConvergenceTimer = useRef<NodeJS.Timeout | null>(null)
  const queryClient = useQueryClient()

  // Clear pending content debounce timers on unmount
  useEffect(() => {
    const timers = contentTimers.current
    return () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
      if (contentConvergenceTimer.current) {
        clearTimeout(contentConvergenceTimer.current)
        contentConvergenceTimer.current = null
      }
    }
  }, [])

  /** Invalidate all outline query evaluations so results refresh after data changes */
  const invalidateQueries = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: outlineQueryKeys.all })
  }, [queryClient])

  const patchCachedNodeContent = useCallback((nodeId: string, content: string) => {
    queryClient.setQueriesData<CachedOutlineQueryData>(
      { queryKey: outlineQueryKeys.all },
      (oldData) => {
        if (!oldData?.success || !Array.isArray(oldData.nodes)) return oldData

        let changed = false
        const nodes = oldData.nodes.map((node) => {
          if (node.id !== nodeId || node.content === content) return node
          changed = true
          return { ...node, content }
        })

        return changed ? { ...oldData, nodes } : oldData
      },
    )
  }, [queryClient])

  const scheduleContentConvergenceInvalidation = useCallback(() => {
    if (contentConvergenceTimer.current) {
      clearTimeout(contentConvergenceTimer.current)
    }

    contentConvergenceTimer.current = setTimeout(() => {
      contentConvergenceTimer.current = null
      invalidateQueries()
    }, 2_000)
  }, [invalidateQueries])

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
          .then(() => {
            patchCachedNodeContent(nodeId, content)
            scheduleContentConvergenceInvalidation()
          })
          .catch((err) => {
            console.error('[sync] Failed to update content:', err)
          })
      }, 500),
    )
  }, [patchCachedNodeContent, scheduleContentConvergenceInvalidation])

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
            order: toPersistedOrder(node.order),
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
            order: toPersistedOrder(node.order),
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
          order: toPersistedOrder(node.order),
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
          order: toPersistedOrder(node.order),
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
    // Snapshot all sibling orders: a tied-order move rebalances the whole
    // sibling list (see outline.store rebalanceIfTied), so any sibling may
    // change — diff pre/post and persist every change.
    const { nodes: preNodes } = useOutlineStore.getState()
    const preNode = preNodes.get(nodeId)
    const parentId = preNode?.parentId
    const preOrders = new Map<string, string>()
    if (parentId) {
      const parent = preNodes.get(parentId)
      for (const sibId of parent?.children ?? []) {
        const sib = preNodes.get(sibId)
        if (sib) preOrders.set(sibId, sib.order)
      }
    }

    useOutlineStore.getState().moveNodeUp(nodeId)

    const { nodes } = useOutlineStore.getState()
    const changed = [...preOrders].filter(
      ([id, order]) => nodes.get(id) && nodes.get(id)!.order !== order,
    )
    if (changed.length === 0) return // no-op (already at boundary)

    swapOrderServerFn({
      data: {
        updates: changed.map(([id]) => ({
          nodeId: id,
          order: toPersistedOrder(nodes.get(id)!.order),
        })),
      },
    })
      .then(() => invalidateQueries())
      .catch((err) => {
        console.error('[sync] Failed to reorder nodes:', err)
      })
  }, [invalidateQueries, captureUndoSnapshot])

  const moveNodeDown = useCallback((nodeId: string) => {
    captureUndoSnapshot()
    // Snapshot all sibling orders: a tied-order move rebalances the whole
    // sibling list (see outline.store rebalanceIfTied), so any sibling may
    // change — diff pre/post and persist every change.
    const { nodes: preNodes } = useOutlineStore.getState()
    const preNode = preNodes.get(nodeId)
    const parentId = preNode?.parentId
    const preOrders = new Map<string, string>()
    if (parentId) {
      const parent = preNodes.get(parentId)
      for (const sibId of parent?.children ?? []) {
        const sib = preNodes.get(sibId)
        if (sib) preOrders.set(sibId, sib.order)
      }
    }

    useOutlineStore.getState().moveNodeDown(nodeId)

    const { nodes } = useOutlineStore.getState()
    const changed = [...preOrders].filter(
      ([id, order]) => nodes.get(id) && nodes.get(id)!.order !== order,
    )
    if (changed.length === 0) return // no-op (already at boundary)

    swapOrderServerFn({
      data: {
        updates: changed.map(([id]) => ({
          nodeId: id,
          order: toPersistedOrder(nodes.get(id)!.order),
        })),
      },
    })
      .then(() => invalidateQueries())
      .catch((err) => {
        console.error('[sync] Failed to reorder nodes:', err)
      })
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
          order: toPersistedOrder(node.order),
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
   * Persist the compensating server mutations for an undo/redo snapshot
   * restore. `before` is the store state just before the restore, `after`
   * is the snapshot that replaced it. Structural ops (delete/restore/
   * content/order/parent) hit the server; field/supertag differences are
   * flagged but not yet persisted (spec/tech/editor-sync.md, DRIFT:
   * cosmetic-undo — closes structural ops, leaves fields/supertags local-only).
   */
  const persistSnapshotDiff = useCallback(
    (before: NodeMap, after: NodeMap) => {
      const ops = diffOutlineSnapshots(before, after)
      const calls = ops.flatMap((op): Promise<unknown>[] => {
        switch (op.type) {
          case 'delete':
            return [deleteNodeServerFn({ data: { nodeId: op.nodeId } })]
          case 'restore':
            return [restoreNodeServerFn({ data: { nodeId: op.nodeId } })]
          case 'content':
            return [
              updateNodeContentServerFn({
                data: { nodeId: op.nodeId, content: op.content },
              }),
            ]
          case 'reorder':
            return [
              reorderNodeServerFn({
                data: { nodeId: op.nodeId, order: toPersistedOrder(op.order) },
              }),
            ]
          case 'reparent':
            return [
              reparentNodeServerFn({
                data: {
                  nodeId: op.nodeId,
                  newParentId: toServerParentId(op.parentId),
                  order: toPersistedOrder(op.order),
                },
              }),
            ]
          case 'fieldsOrSupertagsChanged':
            console.warn('[sync] undo: field/supertag changes not yet persisted', op.nodeId)
            return []
        }
      })

      if (calls.length === 0) return
      Promise.all(calls)
        .then(() => invalidateQueries())
        .catch((err) => {
          console.error('[sync] Failed to persist undo/redo diff:', err)
        })
    },
    [invalidateQueries],
  )

  /**
   * Undo — restore the previous node map snapshot, then persist the diff
   * between the pre-restore and post-restore maps to the server.
   */
  const undo = useCallback(() => {
    const { nodes: currentNodes } = useOutlineStore.getState()
    const snapshot = useUndoStore.getState().undo(currentNodes)
    if (!snapshot) return
    useOutlineStore.setState({ nodes: snapshot, activeNodeId: null, selectedNodeId: null, selectedNodeIds: new Set() })
    persistSnapshotDiff(currentNodes, snapshot)
  }, [persistSnapshotDiff])

  /**
   * Redo — restore the next node map snapshot, then persist the diff
   * between the pre-restore and post-restore maps to the server.
   */
  const redo = useCallback(() => {
    const { nodes: currentNodes } = useOutlineStore.getState()
    const snapshot = useUndoStore.getState().redo(currentNodes)
    if (!snapshot) return
    useOutlineStore.setState({ nodes: snapshot, activeNodeId: null, selectedNodeId: null, selectedNodeIds: new Set() })
    persistSnapshotDiff(currentNodes, snapshot)
  }, [persistSnapshotDiff])

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
