# Full SDD workflow

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Workflow Steps

### [x] Step: Requirements
<!-- chat-id: fec51099-cb93-4c05-8fda-4182b1704d69 -->

Create a Product Requirements Document (PRD) based on the feature description.

1. Review existing codebase to understand current architecture and patterns
2. Analyze the feature definition and identify unclear aspects
3. Ask the user for clarifications on aspects that significantly impact scope or user experience
4. Make reasonable decisions for minor details based on context and conventions
5. If user can't clarify, make a decision, state the assumption, and continue

Save the PRD to `{@artifacts_path}/requirements.md`.

### [x] Step: Technical Specification
<!-- chat-id: 934d8c29-e5dc-4b20-baef-bd66737fdd2e -->

Create a technical specification based on the PRD in `{@artifacts_path}/requirements.md`.

1. Review existing codebase architecture and identify reusable components
2. Define the implementation approach

Save to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach referencing existing code patterns
- Source code structure changes
- Data model / API / interface changes
- Delivery phases (incremental, testable milestones)
- Verification approach using project lint/test commands

### [x] Step: Planning
<!-- chat-id: bff5631f-1f58-4a92-90ed-88b17bdfb04f -->

Detailed implementation plan created below. The generic "Implementation" step has been replaced with 7 concrete steps.

### [x] Step: NodeBackend interface and SQLite backend
<!-- chat-id: 8babdb45-7f1d-4d38-94b6-d70ebee6e6bd -->

**Goal:** Define the `NodeBackend` interface, implement the `SqliteBackend` that wraps existing `node.service.ts` functions, and write tests proving the wrapper delegates correctly.

**Files to create:**
- `libs/nxus-db/src/services/backends/types.ts` — `NodeBackend` interface
- `libs/nxus-db/src/services/backends/sqlite-backend.ts` — `SqliteBackend` class
- `libs/nxus-db/src/services/backends/sqlite-backend.test.ts` — Tests

**Details:**

1. Define `NodeBackend` interface in `types.ts`:
   - All methods are `async` (returns `Promise<T>`) — this is the async facade contract
   - Method signatures match spec.md §4.1: `init()`, `findNodeById(nodeId)`, `findNodeBySystemId(systemId)`, `createNode(options)`, `updateNodeContent(nodeId, content)`, `deleteNode(nodeId)`, `assembleNode(nodeId)`, `assembleNodeWithInheritance(nodeId)`, `setProperty(nodeId, fieldId, value, order?)`, `addPropertyValue(nodeId, fieldId, value)`, `clearProperty(nodeId, fieldId)`, `linkNodes(fromId, fieldId, toId, append?)`, `addNodeSupertag(nodeId, supertagSystemId)`, `removeNodeSupertag(nodeId, supertagSystemId)`, `getNodeSupertags(nodeId)`, `getNodesBySupertags(supertagSystemIds, matchAll?)`, `getNodesBySupertagWithInheritance(supertagId)`, `getAncestorSupertags(supertagId, maxDepth?)`, `getSupertagFieldDefinitions(supertagId)`, `evaluateQuery(definition)`, `save()`
   - Import types from existing modules: `AssembledNode`, `CreateNodeOptions`, `PropertyValue` from `../../types/node.js`; `FieldSystemId` from `../../schemas/node-schema.js`; `QueryDefinition` from `../../types/query.js`; `SupertagInfo` from `../node.service.js`
   - Export `QueryEvaluationResult` type: `{ nodes: AssembledNode[], totalCount: number, evaluatedAt: Date }`
   - Note: `getProperty()` and `getPropertyValues()` are pure helpers that operate on `AssembledNode` — they stay as module-level functions, NOT on the backend interface

2. Implement `SqliteBackend` class in `sqlite-backend.ts`:
   - `init()` calls `initDatabase()` from `../../client/master-client.js` + `bootstrapSystemNodesSync()`. Sets internal `this.db` reference. Idempotent guard.
   - Each method wraps the corresponding sync function from `node.service.ts`, passing `this.db` as the first argument and returning the result as a resolved Promise
   - Example: `async assembleNode(nodeId: string) { return nodeService.assembleNode(this.db, nodeId) }`
   - `save()` calls `saveMasterDatabase()` (which is a no-op, but keeps the contract)
   - `evaluateQuery()` wraps `evaluateQuery()` from `query-evaluator.service.ts`
   - The existing `node.service.ts` and `query-evaluator.service.ts` are NOT modified

3. Write tests in `sqlite-backend.test.ts`:
   - Use the same in-memory SQLite setup pattern as `node.service.test.ts` (`:memory:` database, create tables, seed system nodes)
   - Test `init()` → `createNode()` → `assembleNode()` round-trip
   - Test `setProperty()` → `assembleNode()` → verify property appears
   - Test `addNodeSupertag()` → `assembleNode()` → verify supertag appears
   - Test `deleteNode()` → `findNodeById()` returns null
   - No need to exhaustively test every method (the underlying functions are already tested in `node.service.test.ts`) — focus on verifying the delegation pattern works

**Verification:**
- `npx nx run nxus-db:test` — all existing tests pass, new tests pass

### [x] Step: NodeFacade class and barrel exports
<!-- chat-id: c7c4ded7-1326-4b1f-9c4d-05ab1815392c -->

**Goal:** Create the `NodeFacade` class that selects a backend based on `ARCHITECTURE_TYPE` and delegates all operations. Export from `@nxus/db/server`.

**Files to create:**
- `libs/nxus-db/src/services/facade.ts` — `NodeFacade` class + `nodeFacade` singleton
- `libs/nxus-db/src/services/facade.test.ts` — Tests

**Files to modify:**
- `libs/nxus-db/src/services/index.ts` — Add `export * from './facade.js'` and `export * from './backends/types.js'`

**Details:**

1. Implement `NodeFacade` class in `facade.ts`:
   - Private fields: `backend: NodeBackend | null`, `initialized: boolean`
   - `async init()`: reads `process.env.ARCHITECTURE_TYPE`, dynamically imports the appropriate backend class, calls `backend.init()`. Idempotent (early return if already initialized). For now, only `SqliteBackend` is available — if `ARCHITECTURE_TYPE === 'graph'`, still create `SqliteBackend` but log a warning that SurrealDB backend is not yet implemented (will be replaced in Step 4)
   - `ensureInitialized()`: private guard that throws if `init()` hasn't been called
   - All `NodeBackend` methods: call `ensureInitialized()` then delegate to `this.backend!.methodName(...)`
   - Export singleton: `export const nodeFacade = new NodeFacade()`
   - Also re-export pure helpers: `export { getProperty, getPropertyValues } from './node.service.js'`

2. Write tests in `facade.test.ts`:
   - Create facade instance (not the singleton — use `new NodeFacade()` for test isolation)
   - Test with default env (no `ARCHITECTURE_TYPE` set) → should initialize SQLite backend
   - Test basic flow: `init()` → `createNode()` → `assembleNode()` → verify result shape matches `AssembledNode`
   - Test idempotency: calling `init()` twice doesn't error
   - Test guard: calling `assembleNode()` before `init()` throws
   - Uses same in-memory SQLite setup as `sqlite-backend.test.ts` — may need to mock `initDatabase`/`getDatabase` to return the in-memory instance

3. Update barrel exports in `services/index.ts`:
   - Add `export * from './facade.js'`
   - Add `export * from './backends/types.js'`
   - Keep all existing exports (no breaking changes yet)

**Verification:**
- `npx nx run nxus-db:test` — all existing + new tests pass
- `npx nx run-many --target=typecheck --all` — type-checks pass

### [x] Step: SurrealDB graph schema for field table and has_field edges
<!-- chat-id: bea25e9f-75b5-4c8c-8847-f82f91c4219a -->

**Goal:** Extend the SurrealDB schema to include `field` table and `has_field` relation. Write a bootstrap function for SurrealDB field definitions. Test schema creation.

**Files to create:**
- `libs/nxus-db/src/services/backends/surreal-schema.ts` — Schema DDL + bootstrap
- `libs/nxus-db/src/services/backends/surreal-schema.test.ts` — Tests

**Files to modify:**
- `libs/nxus-db/src/client/graph-client.ts` — Call the new schema init from `initGraphSchema()`

**Details:**

1. Create `surreal-schema.ts` with:
   - `initFieldSchema(db: Surreal)` function that executes DDL for:
     - `field` table (SCHEMAFULL): `content` (string), `system_id` (string, UNIQUE index), `value_type` (option\<string\>), `default_value` (FLEXIBLE option\<any\>), `created_at` (datetime DEFAULT time::now())
     - `has_field` relation (SCHEMAFULL, TYPE RELATION IN node OUT field): `value` (FLEXIBLE option\<any\>), `order` (option\<int\> DEFAULT 0), `created_at` (datetime DEFAULT time::now()), `updated_at` (datetime DEFAULT time::now())
     - Indexes on `has_field`: `idx_has_field_in` (FIELDS in), `idx_has_field_out` (FIELDS out), `idx_has_field_in_out` (FIELDS in, out)
   - `bootstrapSurrealFields(db: Surreal)` function that upserts field records matching the `commonFields` list from `bootstrap.ts` (lines 304-483). Each field gets: `system_id` (e.g., `'field:path'`), `content` (e.g., `'path'`), `value_type` (mapped from fieldType). Uses `UPSERT field SET ... WHERE system_id = $systemId` for idempotency.
   - Reuse the `SYSTEM_FIELDS` constant from `../../schemas/node-schema.js` for system_id values

2. Modify `initGraphSchema()` in `graph-client.ts`:
   - After existing schema DDL, call `initFieldSchema(db)` and `bootstrapSurrealFields(db)`
   - Import from `../services/backends/surreal-schema.js`

3. Write tests in `surreal-schema.test.ts`:
   - Use `setupTestGraphDatabase()` from `../../client/__tests__/graph-test-utils.js`
   - Verify `field` table exists after init (query `INFO FOR DB`)
   - Verify system fields were bootstrapped: `SELECT * FROM field WHERE system_id = 'field:path'` returns a record
   - Verify `has_field` relation works: create a test node, create a test field, `RELATE node->has_field->field SET value = 'test'`, query it back
   - Verify unique constraint on `field.system_id`

**Verification:**
- `npx nx run nxus-db:test` — all existing + new tests pass (including the 157 existing SurrealDB tests which now also init the field schema)

### [x] Step: SurrealDB backend implementation with graph-based assembly
<!-- chat-id: 79dc768a-47fd-46dc-a154-1ad302f9060b -->

**Goal:** Implement the full `SurrealBackend` class with graph-based assembly (properties as `has_field` edges) and comprehensive tests.

**Files to create:**
- `libs/nxus-db/src/services/backends/surreal-backend.ts` — `SurrealBackend` class
- `libs/nxus-db/src/services/backends/surreal-backend.test.ts` — Comprehensive tests

**Details:**

1. Implement `SurrealBackend` class:
   - `init()`: calls `initGraphDatabase()` from `../../client/graph-client.js`, stores the `Surreal` instance. Idempotent.
   - **Node CRUD:**
     - `createNode(options)`: `CREATE node SET content = $content, content_plain = ..., system_id = $systemId, created_at = time::now(), updated_at = time::now()`. If `options.supertagId` provided, also `RELATE node->has_supertag->supertag`. Returns the string-serialized RecordId. Emits `node:created` via `eventBus`.
     - `findNodeById(nodeId)`: query node by RecordId, then call internal `assembleFromGraph()`
     - `findNodeBySystemId(systemId)`: `SELECT * FROM node WHERE system_id = $systemId AND deleted_at IS NONE`, then assemble
     - `updateNodeContent(nodeId, content)`: `UPDATE node SET content = $content, content_plain = ..., updated_at = time::now() WHERE id = $nodeId`. Emits `node:updated`.
     - `deleteNode(nodeId)`: `UPDATE node SET deleted_at = time::now() WHERE id = $nodeId` (soft delete). Emits `node:deleted`.
   - **Assembly (core of this step):**
     - `assembleNode(nodeId)`: Execute the assembly query from spec.md §4.4 — fetch node, fetch all `has_field` edges with field metadata, fetch `has_supertag` edges. Map results to `AssembledNode`:
       - `properties`: group by `field_name` (the field's `content`), create `PropertyValue[]` for each group. Each `PropertyValue` has: `value` (JSON-parsed), `rawValue` (JSON string), `fieldNodeId` (field record ID as string), `fieldName` (field content), `fieldSystemId` (field system_id), `order`.
       - `supertags`: map `has_supertag` targets to `{ id: string, content: string, systemId: string | null }`
     - `assembleNodeWithInheritance(nodeId)`: assemble the node, then for each supertag, walk `extends` relations to ancestor supertags, collect their field definitions via `getSupertagFieldDefinitions()`, and merge default values for fields not already set on the node
   - **Properties:**
     - `setProperty(nodeId, fieldId, value, order?)`: resolve `fieldId` (FieldSystemId like `'field:path'`) to the corresponding `field` record. Then: `DELETE has_field WHERE in = $nodeId AND out = $fieldId` (clear existing), `RELATE $nodeId->has_field->$fieldId SET value = $value, order = $order`. Emits `property:set`.
     - `addPropertyValue(nodeId, fieldId, value)`: resolve field, find max order of existing edges, `RELATE` with `order = maxOrder + 1`. Emits `property:added`.
     - `clearProperty(nodeId, fieldId)`: resolve field, `DELETE has_field WHERE in = $nodeId AND out = $fieldId`. Emits `property:removed`.
     - `linkNodes(fromId, fieldId, toId, append?)`: like setProperty but value is the target node's RecordId string
   - **Supertags:**
     - `addNodeSupertag(nodeId, supertagSystemId)`: find supertag by system_id, `RELATE node->has_supertag->supertag`. Emits `supertag:added`. Return true if added, false if already exists.
     - `removeNodeSupertag(nodeId, supertagSystemId)`: find supertag, `DELETE has_supertag WHERE in = $nodeId AND out = $supertagId`. Emits `supertag:removed`.
     - `getNodeSupertags(nodeId)`: `SELECT out.* FROM has_supertag WHERE in = $nodeId`, map to `SupertagInfo[]`
     - `getNodesBySupertags(supertagSystemIds, matchAll?)`: find nodes that have supertag relations matching the given IDs
   - **Query:**
     - `getNodesBySupertagWithInheritance(supertagId)`: resolve supertag, walk `extends` tree (ancestors), find all nodes with `has_supertag` to any of those supertags, assemble each
     - `getAncestorSupertags(supertagId, maxDepth?)`: recursive walk of `extends` relations
     - `getSupertagFieldDefinitions(supertagId)`: query `has_field` edges from the supertag node to field definitions
     - `evaluateQuery(definition)`: translate `QueryDefinition` filters to SurQL. Handle `supertag` filter (via `has_supertag` joins), `property` filter (via `has_field` edge value comparisons), `content` filter (via `content_plain CONTAINS`), `hasField` filter, `temporal` filter. For complex logical filters (AND/OR/NOT), compose SurQL sub-queries. Assemble matching nodes.
   - **Persistence:**
     - `save()`: no-op (SurrealDB auto-persists)
   - **Helper:** `resolveFieldId(fieldSystemId: FieldSystemId)`: internal method to find the `field` record by system_id, with caching

2. Write comprehensive tests in `surreal-backend.test.ts`:
   - Setup: `setupTestGraphDatabase()` → create `SurrealBackend` instance, point it at the test DB
   - **Node CRUD tests:** create → find by id → find by system_id → update content → delete (soft) → find returns null
   - **Assembly tests:**
     - Create node, set properties, assemble → verify `AssembledNode` shape, property values, field metadata
     - Multi-value property: `addPropertyValue` × 3 → assemble → verify 3 `PropertyValue` entries with correct order
     - Node with supertags: add supertag → assemble → verify supertags array
   - **Supertag inheritance tests:**
     - Create parent supertag + child supertag with `extends` → `getAncestorSupertags` returns parent
     - `getNodesBySupertagWithInheritance` for parent returns nodes tagged with child
     - `assembleNodeWithInheritance` merges parent field defaults
   - **Property tests:** set → clear → re-set, link nodes, verify property values
   - **Query tests:** evaluateQuery with supertag filter, property filter, content filter
   - **Event emission tests:** verify eventBus receives `node:created`, `property:set`, etc.

**Verification:**
- `npx nx run nxus-db:test` — all tests pass

### [x] Step: Backend equivalence tests and facade integration with SurrealDB
<!-- chat-id: 8dcc07b6-4ef7-4e44-9ad6-5e0320d4ed89 -->

**Goal:** Wire the `SurrealBackend` into the facade's `init()` method, write parametric tests that verify both backends produce equivalent `AssembledNode` output.

**Files to create:**
- `libs/nxus-db/src/services/backends/backend-equivalence.test.ts` — Parametric tests

**Files to modify:**
- `libs/nxus-db/src/services/facade.ts` — Wire up `SurrealBackend` in `init()` when `ARCHITECTURE_TYPE === 'graph'`

**Details:**

1. Update `facade.ts` `init()`:
   - Replace the placeholder warning with actual dynamic import: `const { SurrealBackend } = await import('./backends/surreal-backend.js')`
   - Create and initialize `SurrealBackend` instance

2. Create `backend-equivalence.test.ts`:
   - Use `describe.each(['sqlite', 'surreal'] as const)` to run the same test suite against both backends
   - Factory functions: `createTestSqliteBackend()` (in-memory SQLite), `createTestSurrealBackend()` (in-memory SurrealDB via `setupTestGraphDatabase()`)
   - Shared test cases:
     - `createNode` → `assembleNode` → verify `AssembledNode` shape is identical (modulo ID format)
     - `setProperty` → `assembleNode` → `getProperty` round-trip
     - `addPropertyValue` × N → verify ordering preserved
     - `clearProperty` → verify property removed
     - `addNodeSupertag` → verify supertag in assembled node
     - `removeNodeSupertag` → verify supertag removed
     - `deleteNode` → `findNodeById` returns null
     - `getNodesBySupertags` returns correct nodes
     - `updateNodeContent` → content updated in assembled node
     - `evaluateQuery` with supertag filter → same nodes returned
   - **ID normalization:** Tests should not compare IDs directly (UUID vs RecordId string). Compare content, properties, supertags, etc.

**Verification:**
- `npx nx run nxus-db:test` — all tests pass, including equivalence tests for both backends

### [x] Step: Consumer migration to facade API
<!-- chat-id: 7c11dcd6-6a61-4eba-bc6a-4d82071588b0 -->

**Goal:** Migrate all consumer files from direct `node.service` / `getDatabase()` imports to the `nodeFacade` API. Remove backend-switching logic from `apps.server.ts`.

**Files to modify (22+ files):**

**nxus-core (12 files):**
- `apps/nxus-core/src/services/apps/apps.server.ts` — Remove `isGraphArchitecture()` branching, use `nodeFacade` directly
- `apps/nxus-core/src/services/apps/apps-mutations.server.ts` — Replace `getDatabase() + setProperty(db, ...)` with `await nodeFacade.setProperty(...)`
- `apps/nxus-core/src/services/apps/node-items.server.ts` — Update imports (types only, minimal change)
- `apps/nxus-core/src/services/tag.server.ts` — Replace `initDatabase() + createNode(db, ...)` with `await nodeFacade.createNode(...)`
- `apps/nxus-core/src/services/tag-config.server.ts` — Replace direct DB calls with facade calls
- `apps/nxus-core/src/services/inbox/inbox.server.ts` — Replace `assembleNode(db, id)` with `await nodeFacade.assembleNode(id)`
- `apps/nxus-core/src/services/graph/graph.server.ts` — Refactor to use facade; the Graph CRUD functions that overlap with facade become thin wrappers or are removed
- `apps/nxus-core/src/services/nodes/index.ts` — Re-export from facade instead of direct node.service imports
- `apps/nxus-core/src/config/feature-flags.ts` — Keep as-is (other parts of the app may still use it), but add a note that the facade handles backend selection
- `apps/nxus-core/src/scripts/assemble-full-items.ts` — Replace direct DB access with facade
- `apps/nxus-core/src/scripts/compare-legacy-vs-nodes.ts` — Replace direct DB access with facade

**nxus-workbench (4 files):**
- `libs/nxus-workbench/src/server/nodes.server.ts` — Replace `initDatabase() + getDatabase() + assembleNode(db, ...)` with `await nodeFacade.init(); await nodeFacade.assembleNode(...)`. Update dynamic imports.
- `libs/nxus-workbench/src/server/search-nodes.server.ts` — Replace `getDatabase() + nodes table + Drizzle like/isNull` with facade query methods. The text search using `like()` on the nodes table needs to use `evaluateQuery` with a `content` filter instead.
- `libs/nxus-workbench/src/server/query.server.ts` — Replace direct `createNode`, `setProperty`, `evaluateQuery` with facade calls
- `libs/nxus-workbench/src/server/graph.server.ts` — Replace graph-specific operations with facade

**nxus-calendar (2 files):**
- `libs/nxus-calendar/src/server/calendar.server.ts` — Replace `initDatabase() + assembleNode(db, ...)` with `await nodeFacade.init(); await nodeFacade.assembleNode(...)`. Replace `evaluateQuery(db, query)` with `await nodeFacade.evaluateQuery(query)`. Note: `.map(id => assembleNode(db, id))` pattern becomes `Promise.all(ids.map(id => nodeFacade.assembleNode(id)))`.
- `libs/nxus-calendar/src/server/google-sync.server.ts` — Same pattern as calendar.server.ts

**Migration pattern per file:**
1. Remove: `import { initDatabase, getDatabase, assembleNode, ... } from '@nxus/db/server'`
2. Add: `import { nodeFacade, getProperty, getPropertyValues, SYSTEM_FIELDS, SYSTEM_SUPERTAGS, FIELD_NAMES } from '@nxus/db/server'`
3. Remove: `initDatabase()` / `const db = getDatabase()` lines
4. Add: `await nodeFacade.init()` at the start of each handler (idempotent)
5. Replace: `assembleNode(db, nodeId)` → `await nodeFacade.assembleNode(nodeId)`
6. Replace: `setProperty(db, nodeId, field, value)` → `await nodeFacade.setProperty(nodeId, field, value)`
7. Replace: `createNode(db, options)` → `await nodeFacade.createNode(options)`
8. Replace: `evaluateQuery(db, query)` → `await nodeFacade.evaluateQuery(query)`
9. Keep: `getProperty(node, fieldName)`, `getPropertyValues(node, fieldName)` — these remain pure functions
10. Remove: `isGraphArchitecture()` checks — the facade handles this internally

**Key sync→async changes:**
- `assembleNode(db, id)` (sync) → `await nodeFacade.assembleNode(id)` (async)
- `.map(id => assembleNode(db, id))` → `await Promise.all(ids.map(id => nodeFacade.assembleNode(id)))`
- `evaluateQuery(db, query)` (sync) → `await nodeFacade.evaluateQuery(query)` (async)

**What NOT to change:**
- Ephemeral DB consumers (`alias.server.ts`, `tool-health.service.ts`) — they use a separate database
- Type-only imports (`AssembledNode`, `PropertyValue`, `CreateNodeOptions`) — still exported from `@nxus/db/server`
- `getProperty()`, `getPropertyValues()` — remain as direct imports (pure functions)

**Verification:**
- `npx nx run-many --target=test --all` — all tests pass
- `npx nx run-many --target=typecheck --all` — type-checks pass
- Verify no remaining direct imports of `getDatabase()`, `initDatabase()` in consumer files (except ephemeral DB consumers)

### [ ] Step: SQLite-to-SurrealDB migration script and final validation

**Goal:** Create a migration script that reads all data from SQLite and writes it to SurrealDB using the graph model. Validate end-to-end.

**Files to create:**
- `libs/nxus-db/src/services/backends/migration.ts` — Migration script
- `libs/nxus-db/src/services/backends/migration.test.ts` — Tests

**Details:**

1. Implement migration script in `migration.ts`:
   - `async function migrateSqliteToSurreal(sqliteDb, surrealDb)`:
     - **Step 1: Migrate field definitions.** Read all nodes with `supertag:field` from SQLite. For each, create a `field` record in SurrealDB with matching `system_id`, `content`, and `value_type`.
     - **Step 2: Migrate nodes.** Read all nodes from SQLite `nodes` table. For each, `CREATE node SET ...` in SurrealDB with matching content, system_id, owner_id, timestamps.
     - **Step 3: Migrate properties to has_field edges.** Read all rows from `node_properties`. For each: resolve `field_node_id` to the corresponding field record's system_id, look up the `field` record in SurrealDB, then `RELATE node->has_field->field SET value = ..., order = ...`.
     - **Step 4: Migrate supertags.** For each node, find properties where `field_node_id` matches `field:supertag`. These point to supertag nodes. For each, create `has_supertag` relation. Handle `field:extends` similarly for supertag inheritance (`extends` relation).
     - **Step 5: Validate.** For each migrated node, assemble it via both backends and compare the output. Report any differences.
   - Export a CLI-friendly entry point

2. Write tests in `migration.test.ts`:
   - Seed an in-memory SQLite database with: 5 nodes, 15 properties, 3 supertags, 2 inheritance relations
   - Run migration to in-memory SurrealDB
   - Verify: same number of nodes, fields, has_field edges, has_supertag edges
   - Verify: `assembleNode()` from SurrealDB backend produces equivalent `AssembledNode` for each migrated node (compare content, properties, supertags — not IDs)

**Verification:**
- `npx nx run nxus-db:test` — all tests pass
- Migration test: zero differences between SQLite and SurrealDB assembled output
