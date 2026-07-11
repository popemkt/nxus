import { useCallback } from 'react'
import { getNodeTreeServerFn } from '@/services/outline.server'
import { useOutlineStore } from '@/stores/outline.store'
import { SUBTREE_FETCH_DEPTH } from '@/lib/tree-loading'

const pendingSubtreeLoads = new Map<string, Promise<void>>()

export function ensureSubtreeLoaded(
  nodeId: string,
  depth = SUBTREE_FETCH_DEPTH,
): Promise<void> {
  const existing = pendingSubtreeLoads.get(nodeId)
  if (existing) return existing

  const pending = getNodeTreeServerFn({ data: { nodeId, depth } })
    .then((result) => {
      if (result.success) {
        useOutlineStore.getState().mergeServerNodes(result.nodes)
      }
    })
    .catch((err) => {
      console.error('[outline] Failed to load subtree:', err)
    })
    .finally(() => {
      pendingSubtreeLoads.delete(nodeId)
    })

  pendingSubtreeLoads.set(nodeId, pending)
  return pending
}

export function useEnsureSubtreeLoaded() {
  return useCallback(
    (nodeId: string, depth = SUBTREE_FETCH_DEPTH) =>
      ensureSubtreeLoaded(nodeId, depth),
    [],
  )
}
