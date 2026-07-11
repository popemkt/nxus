# A direct-DB test seed can silently starve the e2e demo data

- **Date**: recorded 2026-07-07 (discovered while adding a 4th direct-DB-seeding e2e spec)
- **Substrate**: nxus e2e infra — Playwright parallel workers + `initDatabaseWithBootstrap` auto-seed
- **Symptom**: adding one more spec file that seeds nodes directly into the e2e DB made unrelated, previously-green specs fail — they found an outline with no demo data.

## The discovery

`initDatabaseWithBootstrap` auto-seeds demo data only while the DB contains **zero non-system nodes** (`libs/nxus-db/src/client/master-client.ts:351-362` — `SELECT COUNT(*) FROM nodes WHERE system_id IS NULL`, seed only when 0).

Playwright workers run test files in parallel against one shared e2e DB (`NXUS_DB_PATH`, fresh per run). A spec that seeds via direct DB import (the `seedFormulaStory` / `seedMovePair` pattern) can execute **before the dev server handles its first request**. Its seeded nodes make the count non-zero, so the server's auto-seed is silently skipped — and every spec that assumes the demo outline (items, commands, seeded root nodes) starves.

This is deterministic once worker scheduling puts a direct-DB spec first, which is exactly what adding a 4th seeding spec file did.

## The rule

A direct-DB e2e seed helper MUST NOT touch the database until the demo seed has happened. Current pattern (see `e2e/editor/inline-mentions.spec.ts`): navigate to the app first (forces the server to init + auto-seed), then poll for `item:%` nodes before inserting your own.

Real fix candidates (not implemented): seed the demo data once in Playwright's `globalSetup` instead of lazily on first server request, or key auto-seed on a marker other than "any non-system node exists".

**Takeaway**: an e2e helper that writes directly to the shared e2e DB must first navigate to the app and poll for `item:%` nodes — otherwise it races the lazy demo auto-seed and starves every demo-dependent spec.

## Follow-up discovery: the bootstrap itself races across processes

- **Date**: recorded 2026-07-07 (while stabilizing `e2e/workbench/query-builder-authoring.spec.ts`)

**Update 2026-07-11:** closed in two layers — `upsertSystemNode` gained `onConflictDoNothing({ target: nodes.systemId })` (commit 9657c43), and the whole `bootstrapSystemNodesSync` body now runs inside one `BEGIN IMMEDIATE` transaction, so concurrent cross-process bootstraps serialize instead of racing row-by-row (the loser's check-then-insert helpers see the winner's committed rows and skip). Additionally `e2e/global-setup.cjs` now warms `/core` as well as `/editor` (each app is its own process with its own bootstrap state), and core's `ensureDatabaseReady` no longer caches a rejected promise (one transient failure used to poison the process for life → "Error loading apps" → C4/C1 flakes).

`bootstrapSystemNodesSync` upserts system nodes with an unlocked check-then-insert (`libs/nxus-db/src/services/bootstrap.ts:45-70` — SELECT by `system_id`, INSERT if missing). When a test worker calls `initDatabaseWithBootstrap` while the dev server is still mid-bootstrap of the same fresh DB file, whichever process loses the race throws `SqliteError: UNIQUE constraint failed: nodes.system_id`. Observed in **both directions**: the worker's seed helper crashing the test, and the server's `getSupertags` server fn 500ing (which then feeds UI pickers a failed/retrying options query mid-interaction).

The "navigate first, then poll `item:%`" pattern above does NOT protect against this — the poll happens *after* the worker's own `initDatabaseWithBootstrap` call, which is itself the racer. The workbench app answers its first request fast enough to expose the window; the editor's slower warm-up (`gotoEditorWithRetry`) has masked it for the editor specs so far, so `inline-mentions.spec.ts` / `formula-fields.spec.ts` are exposed-but-lucky.

**Working pattern** (`e2e/workbench/query-builder-authoring.spec.ts`, `waitForServerBootstrap` + `openSeededDb`): before the worker touches the DB, wait for a UI signal that only renders after the server's bootstrap completed (the supertag sidebar's `#Item` button), and additionally wrap the worker's `initDatabaseWithBootstrap` in a retry loop — bootstrap is idempotent once the other process finishes.

Real fix candidate (not implemented): make `upsertSystemNode` race-safe (`INSERT ... ON CONFLICT(system_id) DO NOTHING`), which would let any number of processes bootstrap concurrently.
