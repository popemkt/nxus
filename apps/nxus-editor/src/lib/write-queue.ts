/**
 * Per-node server-write queue (spec/tech/editor-sync.md INV-7, ordering
 * clause). Optimistic sync resolves temp ids before dispatch, but two
 * resolved requests for the same node can still overtake each other on the
 * network — last-issued must win on the server, so writes touching a node
 * are chained in issue order. Keys are node ids; a multi-key write (sibling
 * order swap) barriers on every touched node's tail and becomes the new
 * tail for all of them.
 *
 * Failure isolation: a failed write logs at the call site and must not
 * block later writes to the same node — the stored tail is always the
 * settled (never-rejecting) form; the caller gets the raw promise.
 */

export type WriteQueueRegistry = {
  /**
   * Chain `task` behind all in-flight writes for `ids` (deduped). Returns
   * the task's own promise (rejects on task failure); the queue itself
   * absorbs the rejection.
   */
  enqueue: <T>(ids: string | readonly string[], task: () => Promise<T>) => Promise<T>
  /**
   * Re-key a chain when an optimistic create's temp id is replaced by the
   * server id: writes already queued under the temp id keep their slot and
   * later writes under the server id chain behind them.
   */
  migrate: (fromKey: string, toKey: string) => void
  /** Number of keys with an unsettled tail (introspection/tests). */
  size: () => number
}

export function createWriteQueueRegistry(): WriteQueueRegistry {
  const tails = new Map<string, Promise<unknown>>()

  const clearWhenCurrent = (key: string, settled: Promise<unknown>) => {
    void settled.finally(() => {
      if (tails.get(key) === settled) tails.delete(key)
    })
  }

  return {
    enqueue<T>(ids: string | readonly string[], task: () => Promise<T>): Promise<T> {
      const keys = [...new Set(typeof ids === 'string' ? [ids] : ids)]
      const barrier = Promise.all(keys.map((k) => tails.get(k) ?? Promise.resolve()))
      const run = barrier.then(task)
      const settled = run.catch(() => undefined)
      for (const key of keys) {
        tails.set(key, settled)
        clearWhenCurrent(key, settled)
      }
      return run
    },

    migrate(fromKey: string, toKey: string): void {
      const fromTail = tails.get(fromKey)
      if (!fromTail) return
      tails.delete(fromKey)
      const toTail = tails.get(toKey)
      // Both chains exist only if a write raced the remap under each key;
      // the merged tail preserves "everything issued so far, then new work".
      const merged = toTail
        ? Promise.all([fromTail, toTail]).then(() => undefined)
        : fromTail
      tails.set(toKey, merged)
      clearWhenCurrent(toKey, merged)
    },

    size(): number {
      return tails.size
    },
  }
}
