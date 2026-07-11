# Editor Sync & Persistence Contract

Invalidated by: implementation decisions about editor persistence, undo, ordering, and client↔server reconciliation.

This is the persistence contract for `apps/nxus-editor`. It defines what MUST be true about how outline mutations reach the database and how failures reconcile. Functional editor behavior (what keystrokes do) lives in [../product/editor.md](../product/editor.md); the SQLite substrate and `setProperty` semantics live in [./persistence.md](./persistence.md); live-query invalidation semantics live in [./reactivity.md](./reactivity.md).

The current implementation diverges from this contract in known ways; every divergence is recorded as a `DRIFT:` block inline. **The canonical claims, not the code, are normative** — this document drives the sync-layer fix.

## 1. Architecture (actors)

| Actor | File | Role |
|---|---|---|
| Outline store | `apps/nxus-editor/src/stores/outline.store.ts` | Zustand `Map<string, OutlineNode>`; synchronous optimistic mutations; source of truth for the session |
| Undo store | `apps/nxus-editor/src/stores/undo.store.ts` | Snapshot stacks of the whole NodeMap (`MAX_HISTORY = 50`, `undo.store.ts:4`); shallow `new Map(nodes)` copies are safe because the outline store never mutates node objects in place (`undo.store.ts:19-20`) |
| Sync hook | `apps/nxus-editor/src/hooks/use-outline-sync.ts` | The ONLY sanctioned mutation entry point for components. Wraps every store mutation with a server persistence call. Components MUST NOT call store mutations or server fns directly for user-visible edits. |
| Server fns | `apps/nxus-editor/src/services/outline.server.ts`, `supertag.server.ts`, `field.server.ts` | TanStack `createServerFn` wrappers with dynamic `import('@nxus/db/server')` per the codebase rule |

Client↔server ID mapping: the workspace root is a client-only virtual node `WORKSPACE_ROOT_ID`; in the DB, top-level nodes have `ownerId = null`. Every outbound parent ID passes through `toServerParentId` (`use-outline-sync.ts:35-38`). Reimplementations MUST preserve this mapping in both directions (load remaps `null` → workspace root).

## 2. Canonical invariants (testable)

Each invariant is a claim a test can assert. "Quiescence" = all in-flight requests settled and all debounce timers elapsed or flushed.

- **INV-1 (durability or visible failure).** After any user-visible mutation and quiescence, a full reload MUST render the same outline state the mutation produced — or the UI MUST have surfaced the failure and restored the pre-mutation state. Silent client/DB divergence is never a legal outcome.
- **INV-2 (undo is a mutation).** Undo and redo are first-class mutations: they MUST persist to the server and MUST satisfy INV-1. Undoing a delete and reloading MUST show the node.
- **INV-3 (rollback on terminal failure).** If a persistence call fails terminally (after any retry policy), the optimistic store change MUST be rolled back and the user notified.
- **INV-4 (deterministic sibling order).** Sibling order keys are unique per parent. The comparator — lexicographic on `order`, tie-broken by `createdAt` ascending — MUST produce identical order on client and server-loaded state. (The tie-break exists only to make transient duplicate keys deterministic; INV-4's uniqueness clause makes it unreachable at quiescence.)
- **INV-5 (rebalance is persisted atomically).** When key exhaustion triggers a rebalance, ALL reassigned sibling keys MUST persist, atomically with the mutation that triggered them.
- **INV-6 (atomic swap).** A moveUp/moveDown order swap MUST persist as one atomic server operation. No failure mode may leave two siblings sharing an order key at quiescence.
- **INV-7 (temp-ID barrier).** No server request may carry a client temp ID (as `nodeId`, `parentId`, or field value). Mutations referencing a node whose create is unresolved MUST be deferred and replayed with the server ID after the swap, preserving issue order.
- **INV-8 (per-node write ordering).** Writes targeting the same node MUST reach the server in issue order (no overtaking). Writes to different nodes MAY be concurrent.
- **INV-9 (debounce flush).** Pending debounced content MUST be flushed (not discarded) on: node blur, component unmount, navigation, undo-snapshot capture, and any structural mutation of the same node (delete/reparent).
- **INV-10 (undo granularity).** Each user action pushes exactly one undo entry. A continuous typing burst in one node coalesces into one entry. Every mutation exposed by the sync hook participates in undo — none are exempt.
- **INV-11 (scoped invalidation).** A persisted change MUST NOT force re-evaluation of live queries whose results it cannot affect (dependency-driven invalidation per [./reactivity.md](./reactivity.md)).
- **INV-12 (validated boundary).** Server fn results consumed by the client MUST be validated (Zod parse), not asserted (`as`), per `.claude/rules/typescript-rules.md`.

## 3. Mutation catalog (current materialization)

Every row: optimistic store mutation first (instant UI), then server call. `hook:` lines cite `use-outline-sync.ts`.

| User action | Hook fn | Server fn (evidence) | Timing | Undo snapshot? |
|---|---|---|---|---|
| Type in node | `updateNodeContent` (hook:317) | `updateNodeContentServerFn` (outline.server.ts:431) | debounced 500ms per node | **no** (drift, §6) |
| Enter → new sibling | `createNodeAfter` (hook:98) | `createNodeServerFn` (outline.server.ts:298) | immediate | yes (hook:100) |
| First child of empty parent | `createFirstChild` (hook:213) | `createNodeServerFn` | immediate | yes |
| Delete node/subtree | `deleteNode` (hook:328) | `deleteNodeServerFn` (outline.server.ts:443, soft delete) | immediate | yes |
| Tab indent | `indentNode` (hook:341) | `reparentNodeServerFn` (outline.server.ts:455) | immediate | yes |
| Shift+Tab outdent | `outdentNode` (hook:364) | `reparentNodeServerFn` | immediate | yes |
| Move up/down | `moveNodeUp`/`moveNodeDown` (hook:387/429) | `swapOrderServerFn` (outline.server.ts) | immediate, one transactional order batch | yes |
| Drag/move under node | `moveNodeTo` (hook:555) | `reparentNodeServerFn` | immediate | **no** (drift, §6) |
| Add supertag | `addSupertag` (hook:472) | `addSupertagServerFn` (supertag.server.ts:46); server-returned inherited fields merged back (hook:479-494) | immediate | **no** |
| Remove supertag | `removeSupertag` (hook:508) | `removeSupertagServerFn` (supertag.server.ts:150); fields kept — Tana behavior (outline.store.ts:263) | immediate | **no** |
| Add field | `addField` (hook:524) | `setFieldValueServerFn` with `value: ''` to materialize (hook:528-530, outline.server.ts:668) | immediate | **no** |
| Remove field | `removeField` (hook:540) | `clearFieldServerFn` (field.server.ts:211) | immediate | **no** |
| Undo / redo | `undo`/`redo` (hook) | `diffOutlineSnapshots` → `deleteNodeServerFn`/`restoreNodeServerFn`/`updateNodeContentServerFn`/`reorderNodeServerFn`/`reparentNodeServerFn`, batched (structural only — field/supertag diffs still local-only, drift, §5) | immediate | consumes stack |

Load path: `getWorkspaceRootServerFn` (outline.server.ts:263) → `getNodeTreeServerFn` (outline.server.ts:13, default `maxDepth = Number.MAX_SAFE_INTEGER` at :29). Assembly cost and N+1 concerns are owned by [./persistence.md](./persistence.md).

## 3a. Lazy Tree Loading

The outline editor MUST NOT load the full workspace tree at boot. Workspace mount passes `INITIAL_TREE_DEPTH = 3` to `getNodeTreeServerFn`; subtree fetches use `SUBTREE_FETCH_DEPTH = 3` (`apps/nxus-editor/src/lib/tree-loading.ts`). The server function keeps its unbounded default for backwards-compatible callers, but finite-depth callers receive an explicit boundary marker.

`OutlineNode.hasUnloadedChildren` is the client/server contract for a depth boundary. When `getNodeTreeServerFn` stops at `maxDepth`, it MUST run one grouped child-count query over the final loaded frontier and mark only boundary nodes with at least one non-deleted DB child (`apps/nxus-editor/src/services/outline.server.ts`). Boundary nodes MAY have `children: []`; the bullet/expand affordance is driven by `children.length > 0 || hasUnloadedChildren === true`, not loaded child IDs alone.

Server-loaded node batches merge into the Zustand map through `mergeServerNodes` (`apps/nxus-editor/src/stores/outline.store.ts`). Merge semantics:

- Existing nodes keep local `collapsed`; server `collapsed` is not persistent state.
- If the existing node is `activeNodeId`, local `content` wins so an in-flight edit is not clobbered by a lazy read.
- Fresh server `children` and `hasUnloadedChildren` always replace the old loaded-child boundary state.
- `attachToWorkspaceRoot` attaches a server-created top-level node under the client-only `WORKSPACE_ROOT_ID` virtual root without inventing a DB parent.

There are three required fetch triggers:

- Mount: fetch every workspace root with `INITIAL_TREE_DEPTH`.
- Expand: expanding, or clicking an open-but-empty unloaded boundary, calls `ensureSubtreeLoaded(nodeId)`; in-flight subtree fetches are deduped per node ID.
- Zoom: URL→store sync calls `ensureSubtreeLoaded(urlNodeId)` when the zoom target is absent from the store or is itself an unloaded boundary. Direct `?node=` links must render server-created nodes that were not present at mount.

`createNodeServerFn` is not a plain insert: it sets the order property, may auto-apply the parent's `default_child_supertag` (with inherited field definitions) and instantiate a content template's children (outline.server.ts:326-416), and returns `{ success, nodeId, appliedSupertag, appliedFields }` which the client merges into the optimistic node (hook:135-143). This multi-write runs without a transaction — transaction boundaries are a [./persistence.md](./persistence.md) concern, but INV-1 holds this contract accountable for the user-visible result.

## 3b. Virtualized Child Lists

Direct child-list breadth is bounded independently from lazy tree depth. A root-level or nested outline child list MUST render with the existing direct `NodeBlock` map while `sortedChildren.length <= VIRTUALIZE_CHILDREN_THRESHOLD`; above that threshold (`150`, defined in `apps/nxus-editor/src/lib/tree-loading.ts`) the shared child-list renderer MAY window rows with `@tanstack/react-virtual`.

The virtualizer's scroll element MUST be the outline's actual vertical scroller (`.outline-body`, `overflow-y-auto`), not `window` and not a per-list overflow container. Row heights are dynamic: rendered row wrappers are measured with the virtualizer so wrapped content, fields, query controls, and expanded descendants contribute their real height.

Virtualization MUST NOT unmount a live editor. If `activeNodeId` is outside the current virtual range, the direct child containing that active node remains pinned in the DOM, including any ancestor chain needed to keep the active contenteditable mounted. Selection-mode keyboard navigation still walks the store-visible tree (`getNextVisibleNode`/`getPreviousVisibleNode`); when `selectedNodeId` or `activeNodeId` moves to a child outside the mounted range, the child-list virtualizer MUST `scrollToIndex` so the target row mounts before interaction continues.

DRIFT: unvalidated-server-results
- canonical: INV-12 — client parses `CreateNodeResult` with a Zod schema.
- current: `_result as CreateNodeResult` on `unknown` (use-outline-sync.ts:116-117, 230-231); the ~100-line create/merge/swap block is also duplicated verbatim between `createNodeAfter` and `createFirstChild`.
- impact: a server shape change fails silently at runtime; duplicated logic drifts independently.
- closes: shared `resolveCreatedNode()` helper with `CreateNodeResultSchema.parse`.

## 4. Ordering model — fractional keys

**Canonical.** Sibling order is a fractional-key scheme: keys are strings ordered lexicographically; inserting between two siblings computes a key strictly between theirs; when no key exists in the gap, the parent's children are rebalanced to evenly spaced keys and the insert retried. `between()` MUST return either a key strictly between its arguments or a rebalance signal — never a duplicate of an existing key.

**Current materialization** (`outline.store.ts:41-107`) — decimal integers rendered as zero-padded 8-char strings:

- `KEY(i) = String(i).padStart(8, '0')`; `ORDER_STEP = 1000` (:42, :48-50).
- `generateOrderBetween(a, b)` (:58-72): both null → `KEY(500000)`; only `b` → `KEY(max(0, floor(b/2)))`; only `a` → `KEY(a + 1000)`; gap `b − a > 1` → `KEY(a + floor(gap/2))`; else `null` (caller must rebalance).
- `rebalanceChildren` (:84-107): sort children by the §2 comparator, reassign `KEY((index+1) * 1000)`.
- Rebalance-and-retry callers: `createNodeAfter` (:351-363), `outdentNode` (:510-520). `moveNodeTo` appends after the last child (:305-321). `moveNodeUp/Down` swap the two keys (:555-559, :578-582).
- Bound: keys ≥ 10^8 exceed the 8-char pad and break lexicographic comparison (`'100000000' < '99999999'` as strings). Rebalance keeps keys at `n·1000`; a reimplementation MUST either guarantee rebalance before overflow or use a variable-width scheme (e.g. base-62 fractional indexing).

DRIFT: order-model-string-number-mismatch
- canonical: one order representation end-to-end; the persisted value round-trips to the client key bit-for-bit.
- current: store uses padded strings; server still stores a **number** in the `field:order` property. The ad hoc parse/pad sites were centralized into `@nxus/db` helpers (`parseOrderKey`, `orderKeyToNumber`, `formatOrderKey`, `compareOrderKeys`), and write paths now fail fast on invalid order keys instead of `|| 0` coercion (`libs/nxus-db/src/types/order.ts`; `apps/nxus-editor/src/hooks/use-outline-sync.ts`).
- impact: any future non-integer fractional key still requires a persistence migration; old numeric rows are tolerated but do not bit-for-bit round-trip as the canonical string representation.
- closes: persist the order key as an opaque string and delete numeric order normalization.

DRIFT: rebalance-not-persisted
- canonical: INV-5 — rebalanced sibling keys persist atomically with the triggering mutation.
- current: store-side `rebalanceChildren` rewrites sibling orders locally, but the sync hook persists only the new/moved node's order (`createNodeAfter` sends one order, use-outline-sync.ts:109-114; `outdentNode` one, :369-376; `moveNodeTo` one, :562-568). Rebalanced siblings are never written to the DB.
- impact: after any rebalance, reload restores stale sibling orders — visible reordering; combined with `|| 0` coercion this is silent data corruption of user-arranged order.
- closes: a batch reorder server fn (`reorderChildrenServerFn(parentId, [{nodeId, order}])`) invoked whenever a store mutation changed more than one order key; wrapped in one transaction.

DRIFT: move-swap-two-calls-non-atomic
- canonical: INV-6 — one atomic swap operation.
- current: `moveNodeUp/Down` issue two independent `reorderNodeServerFn` calls — moved node (use-outline-sync.ts:401-407) then a linear sibling scan to find and persist the swapped sibling (:410-426; mirror at :441-466). Each call has its own `.catch`.
- impact: failure (or process exit) between the calls leaves two siblings with the same order in DB; reload order then depends on the `createdAt` tie-break, not the user's intent.
- closes: closed 2026-07-07 — `moveNodeUp/Down` now compute changed sibling order keys and call one `swapOrderServerFn` request; the node API persists the batch with `setNodeOrderProperties` in one node-service transaction.

## 5. Undo / redo

**Canonical.** Undo/redo restore both client AND server state (INV-2). The stack model: bounded LIFO snapshot stacks (depth 50); a new mutation clears the redo stack; `undo(current)` pops the undo stack and pushes `current` onto redo, `redo` mirrors (current mechanics: `undo.store.ts:25-53` — these mechanics are canonical). What is NOT canonical is the restore path: applying a snapshot MUST diff it against the current map and emit the compensating server mutations (creates/deletes/reparents/reorders/content/field writes) — or call a server-side revert op — then invalidate queries. Snapshot application MUST respect INV-7 (a snapshot may contain since-swapped temp IDs; the diff must translate them through the ID map).

**Current materialization.** Snapshot capture: `captureUndoSnapshot` copies the whole NodeMap before a mutation (use-outline-sync.ts:69-72).

DRIFT: cosmetic-undo
- canonical: INV-2 — undo/redo hit the server.
- status: **partially closed.** `undo()`/`redo()` now diff the pre-restore node map against the restored snapshot (`diffOutlineSnapshots`, `apps/nxus-editor/src/lib/outline-diff.ts`) and persist the structural result via `Promise.all(...).then(invalidateQueries).catch(console.error)` in `persistSnapshotDiff` (use-outline-sync.ts). Covered: node deletion (`deleteNodeServerFn`), node resurrection (new `restoreNodeServerFn` / `restoreNode`, which clears `deletedAt` in place — undo cannot reuse `createNode` since that mints a new id), content reverts (`updateNodeContentServerFn`), order reverts (`reorderNodeServerFn`), and parent reverts (`reparentNodeServerFn`, which carries the restored order so a parent change never double-persists via a separate reorder call).
- current: field and supertag differences between the two snapshots are detected (`fieldsOrSupertagsChanged` op) but NOT persisted — the differ only `console.warn('[sync] undo: field/supertag changes not yet persisted')`s and leaves the store-only value in place, same as before this change. The batch is also non-transactional (`Promise.all` of independent server fns, not one DB transaction), so a partial failure can leave the diff half-applied.
- impact: undoing a delete/create/content-edit/move/indent-outdent now survives reload (the historically bad cases in INV-2's example). Undoing an add/remove-supertag or add/remove/edit-field still reverts the store but not the DB — reload re-diverges for those ops specifically, and a partial-batch failure mid-diff is silent (falls back to §6's existing `fire-and-forget-sync-no-rollback` behavior).
- closes: extend `diffOutlineSnapshots` (and `persistSnapshotDiff`) with a field/supertag branch — diff `OutlineField[]`/`SupertagBadge[]` per node into `setFieldValueServerFn`/`clearFieldServerFn`/`addSupertagServerFn`/`removeSupertagServerFn` calls; wrap the whole batch in one transaction once a transactional server fn exists (see §6 for the broader non-atomicity this shares); e2e test: create → delete → undo → reload → node visible (structural case, now provable) and add-field → undo → reload → field gone (field case, still open).

DRIFT: inconsistent-undo-snapshot-coverage
- canonical: INV-10 — every sync-hook mutation participates in undo; typing coalesces to one entry.
- current: `updateNodeContent` (use-outline-sync.ts:317-323), `moveNodeTo` (:555-575), `addSupertag`, `removeSupertag`, `addField`, `removeField` never capture snapshots, while create/delete/indent/outdent/move do (§3 table).
- impact: Cmd+Z after typing or dragging skips those changes and reverts an older structural edit instead — user-visible wrong undo.
- closes: snapshot capture in every hook mutation; for content, one snapshot at typing-burst start (first keystroke after quiescence), not per keystroke.

## 6. Optimistic updates, failure handling, write ordering

**Canonical.** Every mutation applies optimistically to the store, then persists. Persistence MUST be reconciling, not fire-and-forget: transient failures retry with backoff; terminal failures roll back the optimistic change and notify (INV-3). Writes are ordered per node (INV-8) — a per-node (or single) FIFO queue is the simplest conforming design and also provides the INV-7 deferral point and the INV-9 flush point.

DRIFT: fire-and-forget-sync-no-rollback
- canonical: INV-1, INV-3, INV-8.
- current: the hook's own doc comment declares the policy — "If the server call fails, we log but don't roll back" (use-outline-sync.ts:41-48). Most mutation paths still end in `.catch(console.error)` with no retry, no queue, no ordering between overlapping calls, and no user-visible error. Move up/down is narrower than before because it is one transactional `swapOrderServerFn` request, but it is still dispatched fire-and-forget from the client's perspective.
- impact: any failed write can still silently diverge client from DB until reload discards the user's work; concurrent calls can be applied out of order server-side. Move up/down no longer has the specific two-call partial-swap failure mode.
- closes: per-node FIFO write queue with retry/backoff, rollback-on-terminal-failure using the captured pre-mutation state, and an error toast/status surface. This is the core of the sync-layer fix; INV-1/3/7/8/9 are its acceptance tests.

## 7. Temp-ID lifecycle

**Canonical.** Create is optimistic: the store inserts under a client temp ID (`node-<timestamp>-<seq>`, outline.store.ts:44-46) so the UI never waits. When the server returns the durable ID (UUIDv7, see [./persistence.md](./persistence.md)), the client atomically swaps: node key, parent's `children` entry, `activeNodeId`/`selectedNodeId`/`selectedNodeIds`, and any pending debounced content transfers to the new ID. Until the swap resolves, INV-7 defers every mutation that references the temp ID (including creates whose *parent* is the temp node, and undo-snapshot diffs).

**Current materialization** (the swap itself is correct and canonical): cancel pending content timer for the temp ID (use-outline-sync.ts:120-124), atomic `setState` remapping node/parent/selection (:127-172), re-issue content save under the server ID (:174-177); when server ID happens to equal temp ID, still merge `appliedSupertag`/`appliedFields` (:178-198). Duplicated in `createFirstChild` (:232-302).

DRIFT: temp-id-race-window
- canonical: INV-7 — no request carries a temp ID.
- current: nothing defers mutations during the create round-trip. Indent/outdent/reorder/delete/setFieldValue on the just-created node, or Enter creating a *child* of it, send the temp ID (`node-…`) as `nodeId`/`parentId` straight to the server (e.g. `indentNode` reads the store and fires immediately, use-outline-sync.ts:341-359; `createNodeServerFn` accepts any string `parentId`, outline.server.ts:302).
- impact: server writes target a nonexistent node ID or create orphaned rows whose `ownerId` never resolves; fast typists hitting Enter-Tab lose the indent; fire-and-forget (§6) hides the failure.
- closes: the write queue keys requests by node and holds any request referencing an unresolved temp ID until the create's response installs the `tempId → serverId` mapping; queued payloads are rewritten through the map before dispatch.

## 8. Debounce semantics

**Canonical (invalidation).** Client query-cache invalidation is TRAILING, not per-op: content saves patch the cache (`patchCachedNodeContent`) and every mutation — content and structural (create/delete/indent/outdent/move/supertag/field/undo-redo) — schedules ONE convergence invalidation ~2s after the last mutation in a burst (`scheduleConvergenceInvalidation`, use-outline-sync.ts). The Zustand store is the optimistic source of truth during a burst; the trailing refetch exists only to converge server-computed state (assigned IDs, applied default supertags/fields, formula fields, live-query membership). No mutation path may call an immediate full `invalidateQueries()` in the hot path (closed 2026-07-11; INV-11's server-side half — dependency-narrowed `node:created`/`node:deleted` — is still open, see reactivity.md DRIFT: membership-affects-all).

**Canonical.** Content saves are debounced 500ms per node — one timer per `nodeId`, keystroke resets it (current: `contentTimers` map, use-outline-sync.ts:51, 77-93). All other mutations dispatch immediately. Debounce is a delay, never a discard: INV-9 flush points (blur, unmount, navigation, undo capture, structural mutation of the same node) MUST fire the pending save synchronously with the triggering event.

DRIFT: debounce-discarded-on-unmount
- canonical: INV-9.
- current: the unmount cleanup `clearTimeout`s every pending timer and clears the map without dispatching (use-outline-sync.ts:55-61). No blur/navigation flush exists either.
- impact: the last ≤500ms of typing before navigating away (zoom-in/out is a route change) is silently lost.
- closes: `flush(nodeId)` on the timer registry; call it from cleanup, blur handlers, `captureUndoSnapshot`, and delete/reparent of the same node.

## 9. Query invalidation

**Canonical.** After a persisted mutation, live query results visible in the outline refresh. Invalidation is scoped (INV-11): the reactive layer ([./reactivity.md](./reactivity.md)) owns dependency tracking; this contract only requires the editor to notify it of the changed node/field, not to nuke the cache.

Content saves (`updateNodeContentServerFn`) MUST NOT invalidate all outline query caches on the success path. The client already has the confirmed content value, so it MUST patch every cached outline-query result containing the saved node in place (`queryClient.setQueriesData` over `outlineQueryKeys.all`) and then schedule one trailing convergence invalidation after 2 seconds without another confirmed content save. That trailing invalidation is the bounded convergence point for derived views whose output may change from content (mentions/backlinks, formula fields reading content, query blocks whose predicates or sorts depend on content). Repeated typing bursts therefore produce immediate row-content convergence and at most one namespace invalidation after the burst.

Structural mutations — create, delete, restore, reparent, reorder/swap, supertag changes, and field changes — MAY keep immediate `outlineQueryKeys.all` invalidation. They change tree shape or membership and are lower-frequency than debounced content writes; narrowing them is owned by the broader INV-11 reactive dependency fix.

DRIFT: query-invalidation-storm-structural-and-derived
- canonical: INV-11 — persisted changes invalidate only live queries whose dependencies can change.
- current: content saves patch cached query rows and schedule one 2s trailing invalidation (`use-outline-sync.ts`); structural mutations and query-definition saves still invalidate `outlineQueryKeys.all` immediately.
- impact: high-frequency typing no longer refetches/re-evaluates every query on every 500ms save, but lower-frequency structural edits and the trailing content convergence pass still fan out to all mounted outline queries.
- closes: pass the mutated nodeId/field to a scoped invalidation API (per-query keys + reactive dependency check); content-only convergence skips queries that do not depend on content/mentions/formulas.

## 10. Acceptance checklist for the sync-layer fix

The fix is done when each maps to a passing test (e2e where user-visible):

1. INV-2/INV-10: create → type → delete → undo ×2 → reload — content and node restored exactly (kills cosmetic-undo, inconsistent-undo-snapshot-coverage).
2. INV-3: server fn forced to 500 → UI shows error, store rolls back, reload matches pre-mutation state (kills fire-and-forget-sync-no-rollback).
3. INV-6/INV-5: moveUp with second call failing → reload order still correct; insert into gapless siblings → reload preserves rebalanced order (kills move-swap-two-calls-non-atomic, rebalance-not-persisted).
4. INV-7: Enter, then Tab within the create round-trip (network throttled) → reload shows the indent; no request body ever contains `node-` prefixed IDs (kills temp-id-race-window).
5. INV-9: type, navigate within 500ms → reload shows the typed content (kills debounce-discarded-on-unmount).
6. INV-11: typing in a plain node does not re-fire evaluation of an unrelated query node (kills query-invalidation-storm-on-save).
7. INV-4/order round-trip: persisted key equals store key as a string (kills order-model-string-number-mismatch).
