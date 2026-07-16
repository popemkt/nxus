# Persistence

Invalidated by: implementation decisions about storage engines, backend selection, bootstrap/seeding, and migration strategy.

Owns: the physical SQLite materialization, database lifecycle (init → bootstrap → seed), architecture modes and the backend facade, and migration policy. The *logical* node model (what nodes/properties/supertags mean, assembly, invariants) is owned by [../product/data-model.md](../product/data-model.md). The reactive layer is owned by [reactivity.md](./reactivity.md). Editor persistence behavior is owned by [editor-sync.md](./editor-sync.md).

## 1. Storage engines

Two SQLite databases, both opened with better-sqlite3 + Drizzle (`libs/nxus-db/src/client/master-client.ts`):

| DB | Path | Role | Lifecycle |
|---|---|---|---|
| Master (`nxus.db`) | `libs/nxus-db/src/data/nxus.db` (resolved at runtime — see DRIFT below) | The node graph. All product data. | Persistent, WAL |
| Ephemeral (`ephemeral.db`) | `~/.popemkt/.nxus/ephemeral.db` (`master-client.ts:17,21`) | Machine-local state: `local_installations`, `health_cache`, `aliases` (`master-client.ts:386-415`) | Persistent per-machine, gitignored, WAL |

Master DB MUST be opened with WAL mode; current tuning: `synchronous=NORMAL`, 64MB cache, 256MB mmap, `temp_store=MEMORY` (`master-client.ts:71-76`). better-sqlite3 persists automatically — `saveMasterDatabase`/`saveDatabase` are deprecated no-ops kept for callers (`master-client.ts:301-313,478`); new code MUST NOT call them.

Connections are module-level singletons; `getDatabase()` throws if `initDatabase()` has not run (`master-client.ts:318-323`).

DRIFT: DB path resolved via import.meta.url
- canonical: the master DB path is configuration (env var or well-known user-data dir), independent of where the library source lives.
- current: path derived from the source file location via `fileURLToPath(import.meta.url)` → `libs/nxus-db/src/data/nxus.db` (`master-client.ts:12-20`). Mutable user data lives inside the library directory and the resolution breaks under bundling (no `import.meta.url` mapping to source tree).
- impact: production builds and any bundled deployment point at a nonexistent/wrong path; the DB sits in the repo working tree.
- closes: `NXUS_DB_PATH` env var with default under `~/.popemkt/.nxus/`, resolved once in `master-client.ts`.

## 2. Physical schema (node mode)

Exactly **two product tables** materialize the entire node graph. Logical semantics of every column live in [../product/data-model.md](../product/data-model.md); this section is the physical contract only.

Schema is defined twice today: Drizzle table definitions (`libs/nxus-db/src/schemas/node-schema.ts:15-73`) and inline DDL in `initDatabase()` (`master-client.ts:229-284`). The Drizzle definition is canonical; the inline DDL MUST match it.

**`nodes`** (`node-schema.ts:15-36`; DDL `master-client.ts:229-240`)

| column | type | notes |
|---|---|---|
| `id` | TEXT PK | UUIDv7 |
| `content` | TEXT | display text |
| `content_plain` | TEXT | lowercased, for search |
| `system_id` | TEXT UNIQUE | system nodes only (`field:*`, `supertag:*`, …) |
| `owner_id` | TEXT | parent node (outline hierarchy) |
| `created_at`, `updated_at` | INTEGER NOT NULL | timestamps |
| `deleted_at` | INTEGER | soft delete |

Indexes: `idx_nodes_system_id`, `idx_nodes_owner_id`, `idx_nodes_content_plain` (`node-schema.ts:32-35`), plus a partial index `idx_nodes_not_deleted ON nodes(id) WHERE deleted_at IS NULL` that exists only in the inline DDL (`master-client.ts:282-284`), not in the Drizzle schema.

**`node_properties`** (`node-schema.ts:52-73`; DDL `master-client.ts:254-280`)

| column | type | notes |
|---|---|---|
| `id` | INTEGER PK AUTOINCREMENT | |
| `node_id` | TEXT NOT NULL | owning node |
| `field_node_id` | TEXT NOT NULL | field definition node |
| `value` | TEXT | **JSON-encoded** scalar, UUID, or UUID[] |
| `order` | INTEGER DEFAULT 0 | multi-value ordering |
| `created_at`, `updated_at` | INTEGER NOT NULL | |

Indexes: `idx_node_properties_node`, `idx_node_properties_field`, `idx_node_properties_value` (backlink lookups), compound `idx_node_properties_node_field` (`node-schema.ts:68-72`).

Consequence of JSON-in-TEXT: the value index only serves **exact `JSON.stringify` matches** (backlink UUID lookups); range/partial comparisons require full JSON parse per row. This is accepted for now; see query-evaluator notes in [../product/data-model.md](../product/data-model.md).

### Legacy tables still materialized

`initDatabase()` also creates the removed table-mode tables — `inbox`, `tags`, `item_tags`, `items`, `item_commands`, `tag_schemas`, `item_tag_configs`, `item_types` (`master-client.ts:81-222`). They are dead weight from removed `table` mode (see §4) and are folded into the migrations DRIFT below.

## 3. Lifecycle: init → bootstrap → seed

1. **`initDatabase()`** (`master-client.ts:62-295`, sync): open/reuse singleton connection → PRAGMAs → run all `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` DDL inline → run `bootstrapSystemNodesSync` once per process (guarded by `bootstrapAttempted`, `:289-292`).
2. **`initDatabaseWithBootstrap()`** (`master-client.ts:333-360`, async) — the recommended entrypoint. Calls `initDatabase()`, then **auto-seeds**: if a seed callback was registered via `registerSeedCallback` (`:52-54`) and the DB has zero non-system nodes (`SELECT COUNT(*) FROM nodes WHERE system_id IS NULL`, `:349-352`), the callback runs once per process. nxus-core registers a manifest-based seeder here.
3. **`bootstrapSystemNodesSync`** (`libs/nxus-db/src/services/bootstrap.ts:170+`): idempotent upsert of the meta-model. Order matters — chicken-and-egg: `field:supertag`, `field:extends`, `field:field_type` first (`bootstrap.ts:196-213`), then meta-supertags (`#Supertag` tagged with itself, `:239-247`), entity supertags with `extends` chains, ~80 common fields, Bloom-level nodes, system queries. Runs even when already bootstrapped to incrementally add new fields (`:176-182`).

Bootstrap invariants:
- MUST be idempotent (re-run on every process start).
- `upsertSystemNode` (`bootstrap.ts:42-73`) matches by `systemId` and **never updates content of an existing node** — renaming a system node in code silently does nothing to existing DBs, so any seed-content rename requires a data migration. This behavior is what let the (now-fixed, commit 60d0741) FIELD_NAMES/bootstrap content mismatch persist across re-bootstraps; the parity invariant (I5) and its test are owned by [../product/data-model.md](../product/data-model.md).

Behavior clauses (bootstrap idempotency/parity; guarding tests in `libs/nxus-db/src/services/bootstrap-parity.test.ts` unless marked unguarded):

- **BOOT-B1** — Given a DB where `bootstrapSystemNodesSync` has already run, when it runs again, then it MUST NOT duplicate or alter existing system nodes/properties (idempotent, systemId-matched upsert). (unguarded — no test re-runs bootstrap against an already-bootstrapped DB and asserts no duplication/no content change)
- **BOOT-B2** — Given a freshly bootstrapped database, when a system field is read through `FIELD_NAMES[K]` for any `SYSTEM_FIELDS` key `K`, then the assembled content MUST equal `FIELD_NAMES[K]` (FIELD_NAMES ↔ bootstrap parity, I5).

Seed input invariants (2026-07-11):
- Seed inputs (app `manifest.json` files, `tags.json`, `inbox.json`) are checked-in repo data; an invalid one is a repo defect, not a runtime condition. Both seeders (`apps/nxus-core/scripts/seed-nodes.ts`, `seed-graph.ts`) MUST fail the whole seed (throw, non-zero exit) on any manifest/JSON validation failure, listing every failing input — never skip-and-continue. Historical behavior (skip with a console line, exit 0) shipped seeded DBs silently missing apps (the `evidence` manifest was invisible for months) and kept CI green through data loss.

Behavior clauses:

- **SEED-B1** — Given a manifest/JSON seed input that fails validation, when either seeder (`seed-nodes.ts`, `seed-graph.ts`) runs, then it MUST throw (non-zero exit) listing every failing input — never skip-and-continue. (unguarded — `apps/nxus-core/scripts/seed-nodes.test.ts` covers supertag-assignment and type-normalization logic extracted from `seed-nodes.ts`, not the fail-fast/list-all-failures path; there is no `seed-graph.test.ts`)

DRIFT: bootstrap check-then-insert races across processes

- canonical: bootstrapping the same DB file from two processes is safe — the upsert is atomic.
- current: `upsertSystemNode` (`bootstrap.ts:42-73`) is an unlocked SELECT-then-INSERT on `nodes.system_id`; two processes bootstrapping one fresh DB (dev server + an e2e worker seeding directly) race, and the loser throws `SQLITE_CONSTRAINT_UNIQUE` — observed crashing both a test seed and a `getSupertags` server fn (500) mid-run.
- impact: any multi-process scenario against one DB file can crash at init; e2e specs must gate on the server's bootstrap finishing first (`learnings/e2e-autoseed-suppression.md`).
- closes: closed 2026-07-07 — `upsertSystemNode` now issues `INSERT ... ON CONFLICT(system_id) DO NOTHING`, then reads back the row before returning (`libs/nxus-db/src/services/bootstrap.ts:42`).

## 4. Architecture modes

`ArchitectureType = 'node' | 'graph'` (`apps/nxus-core/src/config/feature-flags.ts:11`), selected by `process.env.ARCHITECTURE_TYPE`, defaulting to `'node'`.

- **`node`** — **working default**, fully supported. SQLite 2-table materialization via `SqliteBackend` (thin async wrapper over sync `node.service.ts`; `libs/nxus-db/src/services/backends/sqlite-backend.ts:24-33` inits via `initDatabaseWithBootstrap`).
- **`graph`** — **canonical target** (decision record §6). SurrealDB via `SurrealBackend` (`services/backends/surreal-backend.ts`): nodes and fields as records, property values carried on `has_field` edges, `has_supertag`/`extends` edges. Currently behind node mode on features (see §6 provenance note); one-shot SQLite→Surreal migration in `services/backends/migration.ts` (read-only source, with validation diff).

  **Node identity (graph mode, 2026-07-11).** Public node ids are `node:<uuidv7>`; `createNode` pre-generates the UUIDv7 key client-side (`CREATE $nodeId`, typed `RecordId` — `StringRecordId` truncates unquoted hyphenated keys) rather than trusting engine-generated keys, which also sidesteps the v3 HTTP bare-id RETURN quirk ([learnings/surreal-v3-http-bare-record-ids.md](../../learnings/surreal-v3-http-bare-record-ids.md)). Every id crossing the backend boundary is normalized: bare uuid → `node:`-prefixed, `⟨⟩`-escaped display forms unescaped (`rid()`/`normalizeSurrealRecordId`, surreal-backend.ts). Content mention tokens stay `[[node:<uuid>]]` — the product grammar is id-form-agnostic and clients canonicalize bare tokens against prefixed store keys.

  **Supertag catalog (graph mode, 2026-07-12).** SurrealQL RELATION typing forces a dual representation: a lean `supertag` catalog table (targets of `has_supertag` edges) beside the supertag's ordinary `node:` record (which carries `base_type`, `color`, `extends` like any node). The catalog is a derived index, never hand-maintained: `resolveSupertagId` self-heals it on miss by looking up the definition node by `system_id` and mirroring a catalog row (same pattern as `resolveFieldId` for fields), so user-created supertags work without bootstrap enumeration. Graph bootstrap seeds the calendar entity supertags (#Task/#Event/#Day with `base_type`) for parity with `bootstrap.ts` `entitySupertags`.

  Resolved note: graph-formula-evaluation (closed 2026-07-15)
  - previous: formula evaluation lived only in the sync SQLite assembly path; `SurrealBackend` assembly returned formula fields unevaluated, so formula fields rendered empty in graph mode.
  - fixed: the pure evaluation step is hoisted into `services/formula-application.ts` (`applyFormulaFieldsToAssembled`) — backend-agnostic math over an assembled node's property values. Both backends consume it: SQLite's `applyFormulaFields` delegates to it; `SurrealBackend.assembleNode`/`assembleNodeWithInheritance` discover formula field defs (walk supertag field defs → resolve each field's definition node by system_id → read its `field:field_type`/`field:formula`) and apply. Guarded by FORMULA-B1 in the backend-equivalence suite (both backends compute `{Price} * {Quantity}` = 30).
  - inherited field-DEFINITION visibility (closed 2026-07-15): the editor surfaces inherited empty fields via `getSupertagFieldDefinitions` + `getAncestorSupertags`; `getAncestorSupertags` returns catalog RECORD ids, but `resolveSupertagId` treated any `supertag:`-prefixed arg as a system_id and missed them. It now tries record-id resolution first. Multi-parent inherited fields render in graph mode; both `formula-fields.spec.ts` tests pass in graph.

  Behavior clauses (guarded by same-code test titles in `backends/surreal-backend.test.ts` unless noted):

  - **FORMULA-B1** — Given a supertag with a `formula`-typed field over sibling number fields, when a tagged node is assembled, then the formula value MUST be computed identically by both backends (guarded in `backend-equivalence.test.ts`).

  - **EXT-B1** — Given supertag inheritance expressed as a `field:extends` property between definition nodes, when the property is written, then the write path MUST mirror it into the `extends` catalog edge the inheritance walk reads (derived index, like the supertag catalog).
  - **EXT-B2** — Given a supertag extending multiple parents, when ancestors are walked, then ALL parents MUST be visited (multi-parent inheritance is canonical, [../product/editor.md](../product/editor.md) §6).
  - **STAG-B1** — Given a supertag that exists only as a definition node (no catalog row), when a node is created with or tagged by it, then resolution MUST mirror a catalog row and the tag MUST be applied — never a silent no-op.
  - **STAG-B2** — Given a `supertagId` that resolves to nothing even after self-heal, when `createNode` runs, then it MUST throw `Supertag not found: <id>` — a node is never silently created untagged.
  - **BULK-B1** — Given a `createNodesBulk` batch whose specs cross-reference each other (child `ownerId`, in-batch `#Supertag` definition, `[[node:<id>]]` mention), when it runs, then the result MUST equal issuing the equivalent per-op writes: nodes, supertags, properties, mentions, and the in-batch tag becomes a real queryable supertag (guarded in `backend-equivalence.test.ts`).
  - **BULK-B2** — Given a bulk spec carrying `createdAt`/`updatedAt`, when assembled back, then those timestamps MUST be preserved (import fidelity), not overwritten with write time.
  - **BULK-B3** — Given live ownerless nodes, a child, and a soft-deleted root, when `getRootNodes` runs, then it MUST return the live roots and exclude the child and the deleted root.
- **`table` — REMOVED.** There is no table mode. `feature-flags.ts:8` states it explicitly; `isTableArchitecture()` does not exist. **Any document, rule file, or code comment claiming a `table` mode or mandating tri-mode support is wrong.** The only remnants are the dead legacy tables in §2.

DRIFT: mode selection duplicated
- canonical: one source of truth for reading/validating `ARCHITECTURE_TYPE`.
- current: `feature-flags.ts:13-18` (validated Set, app-side) and `NodeFacade.init()` (`libs/nxus-db/src/services/facade.ts:38-39` — `=== 'graph' ? 'graph' : 'node'`, silently defaults anything else) implement it independently; the feature-flags helpers are used almost nowhere in app src.
- impact: two places to update; unrecognized values behave differently only by luck (both default to node).
- closes: move the validated constant into `@nxus/db` and have both facade and apps import it.

## 5. The facade — canonical access path

All node data access MUST go through the singleton `nodeFacade` (`facade.ts:229`), an implementation of the **`NodeBackend`** interface (`libs/nxus-db/src/services/backends/types.ts:24-144`). The interface is the backend contract: `init` (idempotent), node CRUD (`findNodeById`/`findNodeBySystemId`/`createNode`/`createNodesBulk`/`updateNodeContent`/`deleteNode`), assembly (`assembleNode`, `assembleNodeWithInheritance`), tree reads (`getChildrenByParents`, `hasChildren`, `getWorkspaceRoots`, `getRootNodes`), property ops (`setProperty`/`addPropertyValue`/`clearProperty`/`linkNodes`), supertag ops (`addNodeSupertag`/`removeNodeSupertag`/`getNodeSupertags`/`getNodesBySupertags`), inheritance (`getNodesBySupertagWithInheritance`/`getAncestorSupertags`/`getSupertagFieldDefinitions`), `evaluateQuery`, `save` (no-op for auto-persisting backends). All methods async so sync (SQLite) and async (Surreal) backends present uniformly.

`createNodesBulk(specs: BulkNodeSpec[])` is the bulk-write primitive: because `BulkNodeSpec.id` is caller-allocated (`generateNodeId()`), specs may reference one another (`ownerId`, in-batch supertag/field systemIds, `[[node:<id>]]` mention tokens) regardless of order, and an in-batch `#Supertag`/`#Field` definition spec becomes real before the specs that consume its systemId. It is atomic on SQLite (one transaction) and chunk-atomic on SurrealDB (200-spec `BEGIN/COMMIT` chunks). Seeds (`seed-graph.ts`) and TIF import use it; it is what collapses graph seed throughput from ~9× to ~1.3× SQLite (see the write-throughput resolved note). `getRootNodes` returns every live ownerless node assembled (whole-graph export entry, distinct from `getWorkspaceRoots` which returns bare non-system root ids).

Pure helpers operating on already-assembled nodes (`getProperty`, `getPropertyValues`) are deliberately NOT on the interface (`backends/types.ts:6-9`) and MAY be imported directly.

`NodeFacade.init()` picks the backend from `ARCHITECTURE_TYPE` with **dynamic imports** (`facade.ts:41-47`) so the unused backend is never bundled. `initWithBackend()` exists for tests (`facade.ts:58-61`). Apps additionally MUST wrap `@nxus/db/server` behind `createServerFn` handlers with dynamic imports (client-bundle rule — owned by [architecture.md](./architecture.md) / `.claude/rules/codebase-rules.md`).

DRIFT: some consumers still bypass the facade
- canonical: features call `nodeFacade` only; sync SQLite functions are backend-internal.
- current: DR-1 closed the named node CRUD/search/query stacks through `@nxus/node-api` + `nodeFacade`, and the 2026-07-11 S1 rewire closed the mechanical remainder: editor field/supertag/property server-fn handlers (`apps/nxus-editor/src/services/field.server.ts`, `supertag.server.ts`, and `outline.server.ts` reorder/query-definition/field-value handlers) now call `nodeFacade`; core's sync re-export barrel `apps/nxus-core/src/services/nodes/index.ts` is deleted; core `tag-config.server.ts` and `node-items.server.ts` raw drizzle lookups route through the facade. S3 seed dispatch is closed: core/editor lazy bootstrap handlers branch on `ARCHITECTURE_TYPE=graph` and initialize graph bootstrap instead of registering the SQLite seed path (`apps/nxus-core/src/services/db/ensure-seeded.server.ts:24`, `apps/nxus-editor/src/services/ensure-seeded.server.ts:20`). The composite tree read is closed 2026-07-11: `getNodeTreeServerFn` walks the tree through `nodeFacade.assembleNode`/`getChildrenByParents`/`hasChildren` (`NodeBackend` tree-read methods, implemented on both backends with equivalence tests) — no raw drizzle remains in the editor's server functions. Core's duplicate hand-rolled Surreal layer (`apps/nxus-core/src/services/graph/`) is deleted 2026-07-11 — it had zero product consumers; its traversal primitives (`componentsRec`, `ancestorsRec`, `backlinks`) can be re-added as `NodeBackend` methods when a real caller needs them. Remaining bypass (mapped exhaustively in the 2026-07-10 facade-convergence recon): the reactive layer is SQLite-hard-wired (`reactive/query-subscription.service.ts` takes `type Database = any`) and is explicitly scoped to node mode — since 2026-07-11 enforced fail-fast (`reactive/reactive-support.ts` throws under graph mode instead of silently evaluating a disconnected SQLite copy; see [reactivity.md](./reactivity.md) REACT-B1/B2).
- impact: the editor's node data paths now honor `ARCHITECTURE_TYPE=graph`; the CI graph e2e matrix leg (`.github/workflows/ci.yml:74-78`) is unproven end-to-end until the graph leg is run and verified against Surreal-backed reads ([toolchain.md](./toolchain.md) DRIFT).
- closes: S2 closed 2026-07-11 — the 8 missing facade methods (`getWorkspaceRoots`, `restoreNode`, `reparentNode`, `reorderNodes`, `getDistinctPropertyValues`, `removePropertyRow`, `getFieldUsageStats`, `getNodesBySupertagBaseType`) now exist on `NodeBackend` + both backends. S3 closed 2026-07-11 — lazy seed dispatch is architecture-aware; composite tree read routed through new facade tree-read methods (`getChildrenByParents`, `hasChildren`). S4 closed 2026-07-11 — core's duplicate Surreal layer deleted (zero consumers). Remaining: reactive layer mode scoping.

Resolved note: graph seed write-model drift
- previous: `apps/nxus-core/scripts/seed-graph.ts` hand-wrote SurQL using `node.props` for properties and `part_of` edges for hierarchy, while `SurrealBackend` assembles properties only from `has_field` edges and hierarchy from `owner_id`.
- fixed: `seed-graph.ts` now seeds through `nodeFacade`/`NodeBackend` public methods (`createNode`, `setProperty`, `linkNodes`, `addNodeSupertag`, `reparentNode`), so graph seed writes use the same model the facade reads (`apps/nxus-core/scripts/seed-graph.ts:1`).
- impact: fresh graph seed data is visible through facade assembly and workspace hierarchy instead of being structurally invisible.

Resolved note: editor create-path facade routing (closed 2026-07-15)
- previous: `createOutlineNode` (`libs/nxus-node-api/src/server/operations.ts`) — the editor's only create path — used the sync SQLite `withNodeMutationTransaction`/`createDbNode` stack while reads/deletes went through `nodeFacade`. Under graph mode, editor-created nodes landed in SQLite and vanished from Surreal reads/deletes (the swallowed `Node not found` on undo, and disappear-on-reload).
- fixed: `createOutlineNode` routes every step through `nodeFacade` (single-tx atomicity relaxed to per-call auto-persist, matching every other facade server fn).

Resolved note: graph write throughput — bulk-write primitive (closed 2026-07-17)
- previous: every seed/import node cost one SurrealDB transaction (`createNode` per node), making a fresh graph seed ~9× SQLite at scale (backend-parity benchmark residue).
- fixed: `createNodesBulk` batches node CREATEs + supertag/field RELATEs + mention edges into 200-spec transactions (see the §5 facade contract). `seed-graph.ts` and TIF import consume it. Measured on `backend-parity-budget.test.ts` (NXUS_PERF=1, N=1500, local M-series): bulk seed ratio surreal/sqlite **9× → 1.3×** (155ms vs 115ms). The per-op `createNode` path is unchanged (~5× at 100 sampled writes) — that is the interactive path, one node per user action, so batching does not apply; the benchmark now samples it separately (`writeSampleMs`) so a regression there still trips.

Resolved note: TIF import/export ported to the facade (closed 2026-07-17)
- previous: `importTanaIntermediateFile`/`exportSubtreeToTif` were multi-pass sync tree-walks over raw drizzle — SQLite only; `operations.ts` failed fast under graph mode (`assertTifSupported`) to avoid silent data loss.
- fixed: both are now `async (backend: NodeBackend, …)` and run in both modes. Import builds the complete `uid → new id` map up front (ids are caller-allocated via `generateNodeId`), rewrites inline `[[uid]]`/`refs[]` and materializes deferred `type:'field'` carriers as properties, then issues ONE `createNodesBulk` write; export walks `assembleNode`/`getChildrenByParents`/`getRootNodes` and inverts field values back into `type:'field'` carriers. `operations.ts` `importTif`/`exportSubtree` route through `getFacade()`; the `assertTifSupported` guard is deleted. Proven on both backends by the parameterized TIF-B1–B9 clauses (`services/tif/tif.test.ts`, `tif-edge-cases.test.ts`).
- note: TIF `uid`s are the node's DB id in bare form (Surreal's `node:` prefix stripped); content tokens carry the bare uuid on both backends, so a round trip is stable modulo the necessarily-fresh ids.

## 6. Decision record: modes and the facade

Decided (do not relitigate without a new decision):

1. **`graph` (SurrealDB) is the canonical target backend** — intent holder's decision, 2026-07-10, resuming the human-authored Feb–Mar 2026 migration (PR #45 `node-assembly-to-use-surrealdb`, PR #58 `graph-relations-apps`). `node` mode is the **working default** only until graph reaches feature parity; every app must stay green on node mode throughout the transition.
2. **`node` mode stays fully supported during the transition — do not degrade it.** New engine features land on the shared `NodeBackend` surface (both backends) wherever feasible; node-only landings are recorded DRIFT against graph parity, not precedent.
3. **The facade is the goal state.** New data-access code MUST go through `nodeFacade`. Existing direct sync imports are recorded drift, not precedent.
4. **The editor must converge onto the facade** rather than the facade being abandoned. Priority order: editor server fns → core `services/nodes` → reactive layer.
5. **`table` mode stays removed**; its DDL and any doc references are cleanup targets, not compatibility surface.

Provenance note (honesty record): from 2026-07-07 to 2026-07-10 this section asserted "`node` mode is primary" — a decision **introduced by an overnight agent session**, not by the intent holder, and contradicting the human git trail (the last human-authored work was the Surreal migration; `main` froze 2026-04-12). The 2026-07-07/08 core-mechanism hardening (transactions, post-commit events, assembly cache/frontier loads) therefore landed on the SQLite path only; porting it to `SurrealBackend` is the parity backlog, tracked as DRIFTs here and in [editor.md](../product/editor.md).

## 7. Migrations

There is no migration system. Canonically there SHOULD be one.

DRIFT: no versioned migrations
- canonical: schema changes ship as ordered, versioned migrations with a recorded schema version; destructive/additive changes are explicit and testable.
- current: all DDL is inline `CREATE TABLE/INDEX IF NOT EXISTS` in `initDatabase()` (`master-client.ts:81-284`), including the dead table-mode tables (§2). "Migration" = try/catch `ALTER TABLE ADD COLUMN` with the error swallowed (`master-client.ts:162-166`) and one **entirely empty try/catch** (`:167-170`). No schema-version table, no down path, no drift check between inline DDL and the Drizzle schema.
- impact: schema evolution is append-only and silent; a failed/partial ALTER is indistinguishable from success; removing the legacy tables is currently impossible to sequence safely.
- closes: adopt drizzle-kit migrations (schema already in Drizzle), generate an initial baseline, drop the inline DDL, and delete legacy table-mode DDL in the first real migration.

## 8. Transactions

Logical node writes MUST be atomic at the storage boundary — both backends. Any mutation that issues more than one statement, including node creation with derived properties, mention reconciliation, property upserts, supertag replacement, and order batches, MUST run inside a transaction. Reactive mutation events MUST be collected during the transaction and emitted only after commit; observers MUST NOT see uncommitted state or re-enter the write path inside an open transaction.

- **node mode**: `withNodeMutationTransaction` / `runMutationTransaction` in `libs/nxus-db/src/services/node.service.ts` (Drizzle/better-sqlite3). Nested node-service helpers participate in the outer transaction and append to its post-commit event queue.
- **graph mode**: `runMutationTransaction` + `runSurrealTransaction` in `services/backends/surreal-backend.ts` (closed 2026-07-11). The embedded driver's `db.beginTransaction()` API throws under `@surrealdb/node` (verified empirically), so each logical mutation batches its statements into a single `BEGIN TRANSACTION; …; COMMIT TRANSACTION;` SurrealQL query — atomic server-side, rolled back as a unit on error. Events buffer on a `transactionEventStack` and flush only after the batched query returns; a throwing mutation emits nothing. Atomicity and event-once semantics are proven by tests in `surreal-backend.test.ts`.

DRIFT: no transaction boundaries on multi-step writes
- canonical: each logical mutation (createNode + supertag assignment + default fields; setNodeSupertags; multi-row reorders) is atomic; reactive events fire only after commit.
- current: no writes are wrapped in transactions (`node.service.ts:607-655` createNode+tag; editor moveUp/moveDown issues two separate reorder calls). Events are emitted synchronously mid-mutation, so automation listeners can observe half-applied state.
- impact: crash or error mid-mutation leaves orphaned/partial rows; automations act on inconsistent snapshots; editor reorder failure leaves duplicate orders.
- closes: closed 2026-07-07 — `node.service.ts` multi-statement mutations now use a transaction with post-commit event replay, editor outline creation uses the same transaction helper for node/order/default-child writes, and move order batches use one transactional `setNodeOrderProperties` call.

DRIFT: order keys still persisted as numeric field values
- canonical: the editor's sibling order key is an opaque string that round-trips bit-for-bit through persistence.
- current: persisted `field:order` values remain JSON numbers for compatibility with existing rows and the `field:order` bootstrap type. New editor writes normalize through the shared `@nxus/db` order helper instead of ad hoc `parseInt(... ) || 0`, and reads format numeric values back to padded keys (`libs/nxus-db/src/types/order.ts:1`; `apps/nxus-editor/src/hooks/use-outline-sync.ts:41`; `apps/nxus-editor/src/services/outline.server.ts:213`).
- impact: true future fractional/string keys still require a migration or a field-type change; old numeric rows are tolerated, but the persisted value is not yet the exact client key.
- closes: migrate `field:order` to an opaque string value (or introduce a new string order field), backfill existing numeric rows, and remove numeric normalization from the write boundary.

## 9. Assembly cost

Node assembly (`assembleNode`/`assembleNodes` and every definition lookup they trigger) MUST scale with tree depth and distinct-definition count, not node count. The mechanism is the **request-scoped assembly cache**: `createAssemblyCache()` (`libs/nxus-db/src/services/node.service.ts`) returns an explicit cache object that callers thread through `assembleNode`/`assembleNodes`/`getSupertagFieldDefinitions`/`getAncestorSupertags`/`assembleNodeWithInheritance` as an optional trailing parameter. Rules:

- The cache is **caller-owned and request-scoped** — created per server-fn invocation, dropped when it returns. Module-level definition caching is forbidden: the reactive layer mutates definitions at runtime, and a process-lifetime cache would serve stale supertag/field/formula definitions.
- Omitting the parameter is always correct (uncached per-call behavior); passing it is a pure read-path optimization and MUST NOT change results. The equivalence + statement-count contract is enforced by `libs/nxus-db/src/services/assembly-cache.performance.test.ts`, which asserts the frontier+cache path beats per-node uncached assembly by ≥10× in SQL statement count.
- Tree loads iterate a **depth frontier** (one children query per level via `inArray`, batch assembly per level) instead of per-node recursion — see `getNodeTreeServerFn` (`apps/nxus-editor/src/services/outline.server.ts`).

Measured on the seeded benchmark shape (1011 nodes, depth 4, 3 supertags × 4 fields incl. one formula field, 2026-07-08, local M-series): per-node uncached assembly 39,507 SQL statements / ~1040ms; frontier + cache 52 statements / ~21ms.

## 10. Query evaluator seeding

`evaluateQuery` (`libs/nxus-db/src/services/query-evaluator.service.ts`) MUST choose an initial candidate set that is sound before applying filters:

- If the top-level filter list contains a required `supertag` filter, seed from nodes with that supertag instead of all non-deleted nodes.
- Because top-level `QueryDefinition.filters` are ANDed, a top-level `supertag` filter is required. A `supertag` nested under a top-level `and` branch is also required, including nested `and` branches.
- A `supertag` under `or` or `not` is NOT required and MUST NOT narrow the seed; those cases fall back to all non-deleted nodes.
- `includeInherited: false` seeds from the exact `field:supertag` property assignment (`node_properties.field_node_id = field:supertag` and `value = JSON.stringify(targetSupertag.id)`).
- `includeInherited: true` seeds from direct assignments to the target supertag and descendants in the `field:extends` inheritance graph. If a backend cannot answer inherited membership from its index/materialization, it MUST fall back to all non-deleted nodes rather than risk false negatives.
- The seed is only an optimization: the evaluator still applies the original filter tree after seeding, and the seeded IDs MUST be intersected with existing non-deleted nodes before assembly.

This changes the dominant query-evaluation cost for common query blocks from O(all nodes) seed + filter to O(nodes with required supertag) seed + filter. The remaining scaling cliff is live-query invalidation breadth: `node:created` and `node:deleted` still map to `NODE_MEMBERSHIP`/affects-all in the dependency tracker, so membership-changing writes can still re-evaluate many subscriptions even though each supertag-constrained evaluation now starts narrower.
