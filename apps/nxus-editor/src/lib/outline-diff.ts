import type { NodeMap, OutlineField, SupertagBadge } from '@/types/outline'

/**
 * Compensating server mutation derived from diffing two NodeMap snapshots.
 * Discriminated on `type` so callers can exhaustively switch without `as`.
 *
 * Produced by `diffOutlineSnapshots` when an undo/redo restores a store
 * snapshot — see spec/tech/editor-sync.md §5 (DRIFT: cosmetic-undo).
 */
export type OutlineDiffOp =
  | { type: 'delete'; nodeId: string }
  | { type: 'restore'; nodeId: string }
  | { type: 'content'; nodeId: string; content: string }
  | { type: 'reorder'; nodeId: string; order: string }
  | { type: 'reparent'; nodeId: string; parentId: string | null; order: string }
  /** Detected but not yet translated into a server op — field/supertag
   *  differencing is out of scope for tonight's structural-ops pass. */
  | { type: 'fieldsOrSupertagsChanged'; nodeId: string }

function fieldsEqual(a: OutlineField[], b: OutlineField[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

function supertagsEqual(a: SupertagBadge[], b: SupertagBadge[]): boolean {
  if (a === b) return true
  if (a.length !== b.length) return false
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * Diff two NodeMap snapshots into a typed list of compensating server
 * mutations: `before` is the store state right before a snapshot restore,
 * `after` is the snapshot being restored (undo target or redo target).
 *
 * - Present in `before`, absent in `after` → `delete` (the restore removed it).
 * - Absent in `before`, present in `after` → `restore` (the restore brought
 *   it back — e.g. undoing a delete; the node is soft-deleted server-side,
 *   never re-created with a new id).
 * - Present in both → compare content/order/parentId; a parent change wins
 *   over a bare order change since reparenting also carries the new order.
 * - Field/supertag differences are flagged via `fieldsOrSupertagsChanged`
 *   but not translated into a persist call (see caller).
 */
export function diffOutlineSnapshots(before: NodeMap, after: NodeMap): OutlineDiffOp[] {
  const ops: OutlineDiffOp[] = []

  for (const id of before.keys()) {
    if (!after.has(id)) ops.push({ type: 'delete', nodeId: id })
  }

  for (const id of after.keys()) {
    if (!before.has(id)) ops.push({ type: 'restore', nodeId: id })
  }

  for (const [id, beforeNode] of before) {
    const afterNode = after.get(id)
    if (!afterNode) continue // handled by the delete pass above

    if (beforeNode.content !== afterNode.content) {
      ops.push({ type: 'content', nodeId: id, content: afterNode.content })
    }

    const parentChanged = beforeNode.parentId !== afterNode.parentId
    const orderChanged = beforeNode.order !== afterNode.order
    if (parentChanged) {
      ops.push({ type: 'reparent', nodeId: id, parentId: afterNode.parentId, order: afterNode.order })
    } else if (orderChanged) {
      ops.push({ type: 'reorder', nodeId: id, order: afterNode.order })
    }

    if (
      !fieldsEqual(beforeNode.fields, afterNode.fields) ||
      !supertagsEqual(beforeNode.supertags, afterNode.supertags)
    ) {
      ops.push({ type: 'fieldsOrSupertagsChanged', nodeId: id })
    }
  }

  return ops
}
