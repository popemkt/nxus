import { useCallback, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
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

/** Parse-layer schema for createNodeServerFn results (INV-12): a server
 * shape change must fail loudly at the boundary, not corrupt the store. */
const OutlineFieldSchema: z.ZodType<OutlineField> = z.object({
  fieldId: z.string(),
  fieldName: z.string(),
  fieldNodeId: z.string(),
  fieldSystemId: z.string().nullable(),
  fieldType: z.enum([
    'text', 'number', 'boolean', 'date', 'select', 'instance',
    'url', 'email', 'node', 'nodes', 'json', 'formula',
  ]),
  values: z.array(z.object({ value: z.unknown(), order: z.number() })),
  required: z.boolean().optional(),
  hideWhen: z.enum(['never', 'when_empty', 'when_not_empty', 'always']).optional(),
  pinned: z.boolean().optional(),
})

const CreateNodeResultSchema = z.discriminatedUnion('success', [
  z.object({
    success: z.literal(true),
    nodeId: z.string().min(1),
    appliedSupertag: z
      .object({
        id: z.string(),
        name: z.string(),
        systemId: z.string(),
        color: z.string().nullable(),
      })
      .nullable(),
    appliedFields: z.array(OutlineFieldSchema),
  }),
  z.object({
    success: z.literal(false),
    error: z.string(),
  }),
])

type CreateNodeResult = z.infer<typeof CreateNodeResultSchema>
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
  // Optimistic creates assign a temp id that the server may replace. Any
  // server call racing the create (content save, delete, reparent, or a
  // child created under the temp parent) must wait for the real id, or the
  // server sees an id that does not exist — worst case a child persisted
  // under a nonexistent parent (wrong tree on reload).
  const pendingCreates = useRef(new Map<string, Promise<string>>())
  const idRemaps = useRef(new Map<string, string>())
  const queryClient = useQueryClient()

  /** Resolve a possibly-temp node id to its server id (awaits in-flight creates). */
  const resolveNodeId = useCallback(async (id: string): Promise<string> => {
    const remapped = idRemaps.current.get(id)
    if (remapped) return remapped
    const pending = pendingCreates.current.get(id)
    if (pending) return pending
    return id
  }, [])

  /** toServerParentId + temp-id resolution for parent references. */
  const resolveServerParentId = useCallback(
    async (parentId: string | null): Promise<string | null> => {
      const serverParentId = toServerParentId(parentId)
      if (serverParentId === null) return null
      return resolveNodeId(serverParentId)
    },
    [resolveNodeId],
  )

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

  /**
   * Trailing convergence: one invalidation 2s after the last mutation in a
   * burst, instead of one full outline refetch PER op. The Zustand store is
   * already optimistic; the query-cache refetch exists only to converge
   * server-computed state (assigned IDs, applied supertags/fields, formula
   * fields, live query results). Structural ops share this scheduler with
   * content saves (spec/tech/editor-sync.md).
   */
  const scheduleConvergenceInvalidation = useCallback(() => {
    if (contentConvergenceTimer.current) {
      clearTimeout(contentConvergenceTimer.current)
    }

    contentConvergenceTimer.current = setTimeout(() => {
      contentConvergenceTimer.current = null
      invalidateQueries()
    }, 2_000)
  }, [invalidateQueries])
  // Back-compat alias for the content path below.
  const scheduleContentConvergenceInvalidation = scheduleConvergenceInvalidation

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
        resolveNodeId(nodeId)
          .then((resolvedId) =>
            updateNodeContentServerFn({
              data: { nodeId: resolvedId, content },
            }).then(() => {
              patchCachedNodeContent(resolvedId, content)
              scheduleContentConvergenceInvalidation()
            }),
          )
          .catch((err) => {
            console.error('[sync] Failed to update content:', err)
          })
      }, 500),
    )
  }, [patchCachedNodeContent, resolveNodeId, scheduleContentConvergenceInvalidation])

  /**
   * Apply a create result: replace the temp id with the server id in the
   * store (nodes map, parent children, selection), record the remap for
   * in-flight resolvers, transfer pending content saves, and merge
   * server-applied supertag/fields. Returns the node's final id.
   */
  const applyServerCreateResult = useCallback(
    (tempId: string, result: CreateNodeResult, createdContent: string): string => {
      if (!result.success) return tempId

      if (result.nodeId !== tempId) {
        idRemaps.current.set(tempId, result.nodeId)

        // Cancel any pending content debounce for the temp ID; current
        // content is re-synced under the server id below.
        const pendingTimer = contentTimers.current.get(tempId)
        if (pendingTimer) {
          clearTimeout(pendingTimer)
          contentTimers.current.delete(tempId)
        }

        // Atomic state update to replace temp ID with server ID
        useOutlineStore.setState((state) => {
          const tempNode = state.nodes.get(tempId)
          if (!tempNode) return state

          const next = new Map(state.nodes)
          next.delete(tempId)

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
                c === tempId ? result.nodeId : c,
              ),
            })
          }

          // Remap selectedNodeIds if it contains the temp ID
          const newSelectedNodeIds = state.selectedNodeIds.has(tempId)
            ? new Set([...state.selectedNodeIds].map((id) => id === tempId ? result.nodeId : id))
            : state.selectedNodeIds

          return {
            nodes: next,
            activeNodeId:
              state.activeNodeId === tempId ? result.nodeId : state.activeNodeId,
            selectedNodeId:
              state.selectedNodeId === tempId
                ? result.nodeId
                : state.selectedNodeId,
            selectedNodeIds: newSelectedNodeIds,
          }
        })

        // Re-sync content under the server id when it moved past what the
        // create persisted (keystrokes that landed while it was in flight).
        const persistedNode = useOutlineStore.getState().nodes.get(result.nodeId)
        if (persistedNode && persistedNode.content !== createdContent) {
          syncContent(result.nodeId, persistedNode.content)
        }
        return result.nodeId
      }

      // Server ID matches temp ID — still merge supertag/fields if present
      if (result.appliedSupertag || (result.appliedFields && result.appliedFields.length > 0)) {
        useOutlineStore.setState((state) => {
          const node = state.nodes.get(tempId)
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
          next.set(tempId, updated)
          return { nodes: next }
        })
      }
      return tempId
    },
    [syncContent],
  )

  /**
   * Persist an optimistic create: resolve the (possibly temp) parent id,
   * call the server, apply the id remap. The settled promise is registered
   * in pendingCreates so racing ops can await the real id.
   */
  const persistCreate = useCallback(
    (tempId: string, parentId: string, order: string, createdContent: string, label: string) => {
      const createPromise = (async (): Promise<string> => {
        const serverParentId = await resolveServerParentId(parentId)
        const result = CreateNodeResultSchema.parse(
          await createNodeServerFn({
            data: {
              content: createdContent,
              parentId: serverParentId,
              order: toPersistedOrder(order),
            },
          }),
        )
        const finalId = applyServerCreateResult(tempId, result, createdContent)
        scheduleConvergenceInvalidation()
        return finalId
      })()

      const settled = createPromise.catch((err) => {
        console.error(`[sync] Failed to ${label}:`, err)
        return tempId
      })
      pendingCreates.current.set(tempId, settled)
      void settled.finally(() => {
        pendingCreates.current.delete(tempId)
      })
    },
    [applyServerCreateResult, resolveServerParentId, scheduleConvergenceInvalidation],
  )

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
        persistCreate(newId, node.parentId, node.order, initialContent ?? '', 'create node')
      }
      return newId
    },
    [captureUndoSnapshot, persistCreate],
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
        persistCreate(newId, node.parentId, node.order, '', 'create first child')
      }
      return newId
    },
    [captureUndoSnapshot, persistCreate],
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
    resolveNodeId(nodeId)
      .then((resolvedId) => deleteNodeServerFn({ data: { nodeId: resolvedId } }))
      .then(() => scheduleConvergenceInvalidation())
      .catch((err) => {
        console.error('[sync] Failed to delete node:', err)
      })
  }, [resolveNodeId, scheduleConvergenceInvalidation, captureUndoSnapshot])

  /**
   * Indent node — optimistic + persist reparent.
   */
  const indentNode = useCallback((nodeId: string) => {
    captureUndoSnapshot()
    useOutlineStore.getState().indentNode(nodeId)
    const { nodes } = useOutlineStore.getState()
    const node = nodes.get(nodeId)
    if (node && node.parentId) {
      Promise.all([resolveNodeId(nodeId), resolveServerParentId(node.parentId)])
        .then(([resolvedId, newParentId]) =>
          reparentNodeServerFn({
            data: {
              nodeId: resolvedId,
              newParentId,
              order: toPersistedOrder(node.order),
            },
          }),
        )
        .then(() => scheduleConvergenceInvalidation())
        .catch((err) => {
          console.error('[sync] Failed to indent node:', err)
        })
    }
  }, [resolveNodeId, resolveServerParentId, scheduleConvergenceInvalidation, captureUndoSnapshot])

  /**
   * Outdent node — optimistic + persist reparent.
   */
  const outdentNode = useCallback((nodeId: string) => {
    captureUndoSnapshot()
    useOutlineStore.getState().outdentNode(nodeId)
    const { nodes } = useOutlineStore.getState()
    const node = nodes.get(nodeId)
    if (node && node.parentId) {
      Promise.all([resolveNodeId(nodeId), resolveServerParentId(node.parentId)])
        .then(([resolvedId, newParentId]) =>
          reparentNodeServerFn({
            data: {
              nodeId: resolvedId,
              newParentId,
              order: toPersistedOrder(node.order),
            },
          }),
        )
        .then(() => scheduleConvergenceInvalidation())
        .catch((err) => {
          console.error('[sync] Failed to outdent node:', err)
        })
    }
  }, [resolveNodeId, resolveServerParentId, scheduleConvergenceInvalidation, captureUndoSnapshot])

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

    Promise.all(
      changed.map(async ([id]) => ({
        nodeId: await resolveNodeId(id),
        order: toPersistedOrder(nodes.get(id)!.order),
      })),
    )
      .then((updates) => swapOrderServerFn({ data: { updates } }))
      .then(() => scheduleConvergenceInvalidation())
      .catch((err) => {
        console.error('[sync] Failed to reorder nodes:', err)
      })
  }, [resolveNodeId, scheduleConvergenceInvalidation, captureUndoSnapshot])

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

    Promise.all(
      changed.map(async ([id]) => ({
        nodeId: await resolveNodeId(id),
        order: toPersistedOrder(nodes.get(id)!.order),
      })),
    )
      .then((updates) => swapOrderServerFn({ data: { updates } }))
      .then(() => scheduleConvergenceInvalidation())
      .catch((err) => {
        console.error('[sync] Failed to reorder nodes:', err)
      })
  }, [resolveNodeId, scheduleConvergenceInvalidation, captureUndoSnapshot])

  /**
   * Add supertag — optimistic add to store, then persist via server.
   * Server returns inherited fields which are merged into store.
   */
  const addSupertag = useCallback(
    (nodeId: string, supertag: SupertagBadge, newFields: OutlineField[]) => {
      useOutlineStore.getState().addSupertag(nodeId, supertag, newFields)

      if (!supertag.systemId) return
      const supertagSystemId = supertag.systemId
      resolveNodeId(nodeId)
        .then((resolvedId) =>
          addSupertagServerFn({ data: { nodeId: resolvedId, supertagSystemId } }),
        )
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
          scheduleConvergenceInvalidation()
        })
        .catch((err) => {
          console.error('[sync] Failed to add supertag:', err)
        })
    },
    [resolveNodeId, scheduleConvergenceInvalidation],
  )

  /**
   * Remove supertag — optimistic remove from store, then persist.
   * Fields are kept (Tana behavior).
   */
  const removeSupertag = useCallback(
    (nodeId: string, supertagId: string, supertagSystemId: string | null) => {
      useOutlineStore.getState().removeSupertag(nodeId, supertagId)
      if (!supertagSystemId) return
      resolveNodeId(nodeId)
        .then((resolvedId) =>
          removeSupertagServerFn({ data: { nodeId: resolvedId, supertagSystemId } }),
        )
        .then(() => scheduleConvergenceInvalidation())
        .catch((err) => {
          console.error('[sync] Failed to remove supertag:', err)
        })
    },
    [resolveNodeId, scheduleConvergenceInvalidation],
  )

  /**
   * Add field — optimistic add to store, persist with empty/default value.
   */
  const addField = useCallback(
    (nodeId: string, field: OutlineField) => {
      useOutlineStore.getState().addField(nodeId, field)
      // Persist with empty value to materialize the field
      resolveNodeId(nodeId)
        .then((resolvedId) =>
          setFieldValueServerFn({
            data: { nodeId: resolvedId, fieldId: field.fieldId, value: '' },
          }),
        )
        .catch((err) => {
          console.error('[sync] Failed to add field:', err)
        })
    },
    [resolveNodeId],
  )

  /**
   * Remove field — optimistic remove from store, clear on server.
   */
  const removeField = useCallback(
    (nodeId: string, fieldId: string) => {
      useOutlineStore.getState().removeField(nodeId, fieldId)
      resolveNodeId(nodeId)
        .then((resolvedId) =>
          clearFieldServerFn({ data: { nodeId: resolvedId, fieldId } }),
        )
        .then(() => scheduleConvergenceInvalidation())
        .catch((err) => {
          console.error('[sync] Failed to remove field:', err)
        })
    },
    [resolveNodeId, scheduleConvergenceInvalidation],
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

      Promise.all([resolveNodeId(nodeId), resolveServerParentId(newParentId)])
        .then(([resolvedId, resolvedParentId]) =>
          reparentNodeServerFn({
            data: {
              nodeId: resolvedId,
              newParentId: resolvedParentId,
              order: toPersistedOrder(node.order),
            },
          }),
        )
        .then(() => scheduleConvergenceInvalidation())
        .catch((err) => {
          console.error('[sync] Failed to move node:', err)
        })
    },
    [resolveNodeId, resolveServerParentId, scheduleConvergenceInvalidation],
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
            return [
              resolveNodeId(op.nodeId).then((nodeId) =>
                deleteNodeServerFn({ data: { nodeId } }),
              ),
            ]
          case 'restore':
            return [
              resolveNodeId(op.nodeId).then((nodeId) =>
                restoreNodeServerFn({ data: { nodeId } }),
              ),
            ]
          case 'content':
            return [
              resolveNodeId(op.nodeId).then((nodeId) =>
                updateNodeContentServerFn({
                  data: { nodeId, content: op.content },
                }),
              ),
            ]
          case 'reorder':
            return [
              resolveNodeId(op.nodeId).then((nodeId) =>
                reorderNodeServerFn({
                  data: { nodeId, order: toPersistedOrder(op.order) },
                }),
              ),
            ]
          case 'reparent':
            return [
              Promise.all([
                resolveNodeId(op.nodeId),
                resolveServerParentId(op.parentId),
              ]).then(([nodeId, newParentId]) =>
                reparentNodeServerFn({
                  data: {
                    nodeId,
                    newParentId,
                    order: toPersistedOrder(op.order),
                  },
                }),
              ),
            ]
          case 'fieldsOrSupertagsChanged':
            console.warn('[sync] undo: field/supertag changes not yet persisted', op.nodeId)
            return []
        }
      })

      if (calls.length === 0) return
      Promise.all(calls)
        .then(() => scheduleConvergenceInvalidation())
        .catch((err) => {
          console.error('[sync] Failed to persist undo/redo diff:', err)
        })
    },
    [resolveNodeId, resolveServerParentId, scheduleConvergenceInvalidation],
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
