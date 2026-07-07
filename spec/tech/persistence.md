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

## 4. Architecture modes

`ArchitectureType = 'node' | 'graph'` (`apps/nxus-core/src/config/feature-flags.ts:11`), selected by `process.env.ARCHITECTURE_TYPE`, defaulting to `'node'`.

- **`node`** — primary, supported. SQLite 2-table materialization via `SqliteBackend` (thin async wrapper over sync `node.service.ts`; `libs/nxus-db/src/services/backends/sqlite-backend.ts:24-33` inits via `initDatabaseWithBootstrap`).
- **`graph`** — **experimental, retained** (decision record §6). SurrealDB via `SurrealBackend` (`services/backends/surreal-backend.ts`, ~1.7k lines): nodes and fields as records, property values carried on `has_field` edges, `has_supertag`/`extends` edges. One-shot SQLite→Surreal migration in `services/backends/migration.ts` (read-only source, with validation diff).
- **`table` — REMOVED.** There is no table mode. `feature-flags.ts:8` states it explicitly; `isTableArchitecture()` does not exist. **Any document, rule file, or code comment claiming a `table` mode or mandating tri-mode support is wrong.** The only remnants are the dead legacy tables in §2.

DRIFT: mode selection duplicated
- canonical: one source of truth for reading/validating `ARCHITECTURE_TYPE`.
- current: `feature-flags.ts:13-18` (validated Set, app-side) and `NodeFacade.init()` (`libs/nxus-db/src/services/facade.ts:38-39` — `=== 'graph' ? 'graph' : 'node'`, silently defaults anything else) implement it independently; the feature-flags helpers are used almost nowhere in app src.
- impact: two places to update; unrecognized values behave differently only by luck (both default to node).
- closes: move the validated constant into `@nxus/db` and have both facade and apps import it.

## 5. The facade — canonical access path

All node data access MUST go through the singleton `nodeFacade` (`facade.ts:229`), an implementation of the **`NodeBackend`** interface (`libs/nxus-db/src/services/backends/types.ts:24-144`). The interface is the backend contract: `init` (idempotent), node CRUD (`findNodeById`/`findNodeBySystemId`/`createNode`/`updateNodeContent`/`deleteNode`), assembly (`assembleNode`, `assembleNodeWithInheritance`), property ops (`setProperty`/`addPropertyValue`/`clearProperty`/`linkNodes`), supertag ops (`addNodeSupertag`/`removeNodeSupertag`/`getNodeSupertags`/`getNodesBySupertags`), inheritance (`getNodesBySupertagWithInheritance`/`getAncestorSupertags`/`getSupertagFieldDefinitions`), `evaluateQuery`, `save` (no-op for auto-persisting backends). All methods async so sync (SQLite) and async (Surreal) backends present uniformly.

Pure helpers operating on already-assembled nodes (`getProperty`, `getPropertyValues`) are deliberately NOT on the interface (`backends/types.ts:6-9`) and MAY be imported directly.

`NodeFacade.init()` picks the backend from `ARCHITECTURE_TYPE` with **dynamic imports** (`facade.ts:41-47`) so the unused backend is never bundled. `initWithBackend()` exists for tests (`facade.ts:58-61`). Apps additionally MUST wrap `@nxus/db/server` behind `createServerFn` handlers with dynamic imports (client-bundle rule — owned by [architecture.md](./architecture.md) / `.claude/rules/codebase-rules.md`).

DRIFT: some consumers still bypass the facade
- canonical: features call `nodeFacade` only; sync SQLite functions are backend-internal.
- current: DR-1 closed the named node CRUD/search/query stacks by routing them through `@nxus/node-api` and `nodeFacade`: core operations initialize `nodeFacade` in `libs/nxus-node-api/src/server/operations.ts:171-175` and implement CRUD/search/query/backlink operations through it (`:193-240`, `:263-329`, `:384-507`, `:510-629`); editor create/update/delete/query/backlink/search wrappers now dynamically import that API inside handlers (`apps/nxus-editor/src/services/outline.server.ts:305-357`, `:424-455`; `apps/nxus-editor/src/services/search.server.ts:9-35`); core graph search delegates to the same API (`apps/nxus-core/src/services/graph/graph.server.ts:567-589`). Remaining bypasses are outside the DR-1 CRUD/search/query consolidation: editor tree/root/restore/reparent/reorder/query-definition/field-value helpers still import the sync SQLite API directly (`apps/nxus-editor/src/services/outline.server.ts:16-27`, `:246-296`, `:364-417`, `:461-500`); `apps/nxus-core/src/services/nodes/index.ts:16-35` re-exports the whole sync API "for backward compatibility"; the reactive layer is SQLite-hard-wired (`reactive/query-subscription.service.ts` takes `type Database = any`).
- impact: the consolidated node API is backend-portable, but the editor as a whole and most of core can still break under `ARCHITECTURE_TYPE=graph`; the CI graph e2e matrix leg (`.github/workflows/ci.yml:74-78`) still cannot actually exercise those remaining app paths.
- closes: converge the remaining editor helpers and core node-service compatibility exports onto `nodeFacade`; abstract or explicitly scope the reactive layer to node mode.

## 6. Decision record: modes and the facade

Decided (do not relitigate without a new decision):

1. **`node` mode is primary.** All features MUST work in node mode.
2. **`graph` mode is retained as experimental — do not delete.** It is the pressure that keeps `NodeBackend` honest. It is not required to be feature-complete; the CI graph matrix leg is aspirational until the facade DRIFT closes.
3. **The facade is the goal state.** New data-access code MUST go through `nodeFacade`. Existing direct sync imports are recorded drift, not precedent.
4. **The editor must converge onto the facade** rather than the facade being abandoned. Priority order: editor server fns → core `services/nodes` → reactive layer.
5. **`table` mode stays removed**; its DDL and any doc references are cleanup targets, not compatibility surface.

## 7. Migrations

There is no migration system. Canonically there SHOULD be one.

DRIFT: no versioned migrations
- canonical: schema changes ship as ordered, versioned migrations with a recorded schema version; destructive/additive changes are explicit and testable.
- current: all DDL is inline `CREATE TABLE/INDEX IF NOT EXISTS` in `initDatabase()` (`master-client.ts:81-284`), including the dead table-mode tables (§2). "Migration" = try/catch `ALTER TABLE ADD COLUMN` with the error swallowed (`master-client.ts:162-166`) and one **entirely empty try/catch** (`:167-170`). No schema-version table, no down path, no drift check between inline DDL and the Drizzle schema.
- impact: schema evolution is append-only and silent; a failed/partial ALTER is indistinguishable from success; removing the legacy tables is currently impossible to sequence safely.
- closes: adopt drizzle-kit migrations (schema already in Drizzle), generate an initial baseline, drop the inline DDL, and delete legacy table-mode DDL in the first real migration.

## 8. Transactions

DRIFT: no transaction boundaries on multi-step writes
- canonical: each logical mutation (createNode + supertag assignment + default fields; setNodeSupertags; multi-row reorders) is atomic; reactive events fire only after commit.
- current: no writes are wrapped in transactions (`node.service.ts:607-655` createNode+tag; editor moveUp/moveDown issues two separate reorder calls). Events are emitted synchronously mid-mutation, so automation listeners can observe half-applied state.
- impact: crash or error mid-mutation leaves orphaned/partial rows; automations act on inconsistent snapshots; editor reorder failure leaves duplicate orders.
- closes: better-sqlite3 transactions around each `node.service` mutation + emit-after-commit; the atomicity *invariant* itself is owned by [../product/data-model.md](../product/data-model.md), the editor-side ordering contract by [editor-sync.md](./editor-sync.md).
