# Technical Specification: Node Assembly Facade with SurrealDB Graph Backend

## 1. Technical Context

### 1.1 Language & Runtime
- **Language:** TypeScript 5.9, ES2022 target, `nodenext` module resolution
- **Runtime:** Node.js (server-side only for DB operations)
- **Build:** Nx 22.3.3 monorepo with Vite
- **Test:** Vitest 3.0.5 (in-process, node environment)

### 1.2 Key Dependencies
| Package | Version | Role |
|---------|---------|------|
| `drizzle-orm` | ^0.45.1 | SQLite ORM (existing node service) |
| `better-sqlite3` | ^12.6.0 | SQLite driver |
| `surrealdb` | ^2.0.0-alpha.18 | SurrealDB JS SDK |
| `@surrealdb/node` | ^2.6.1 | SurrealDB embedded engine (dev/test) |
| `zod` | ^4.2.1 | Validation |
| `uuidv7` | ^1.1.0 | ID generation |

### 1.3 Monorepo Layout
```
libs/nxus-db/           ← Facade + both backends live here
  src/
    index.ts            ← Client-safe exports (types, schemas)
    server.ts           ← Server exports (clients, services, drizzle-orm re-export)
    client/             ← Database connection management
    services/           ← Node CRUD, query evaluator, bootstrap
    schemas/            ← Drizzle table defs, constants (SYSTEM_FIELDS, etc.)
    types/              ← AssembledNode, PropertyValue, QueryDefinition
    reactive/           ← Event bus, subscriptions, automations

apps/nxus-core/         ← Primary consumer
  src/services/graph/   ← Current SurrealDB service (to be absorbed)

libs/nxus-workbench/    ← Consumer (4 server files)
libs/nxus-calendar/     ← Consumer (2 server files)
```

### 1.4 Current Architecture (Before)

All node operations are **synchronous, stateless functions** that take a Drizzle `db` instance as the first parameter:

```typescript
// Current pattern — every consumer calls initDatabase() + getDatabase()
import { initDatabase, getDatabase, assembleNode, setProperty } from '@nxus/db/server'

initDatabase()
const db = getDatabase()
const node = assembleNode(db, nodeId)
setProperty(db, nodeId, SYSTEM_FIELDS.STATUS, 'done')
```

The SurrealDB graph service lives in `apps/nxus-core/src/services/graph/` with:
- `graph.service.ts` (798 lines) — async CRUD using a flat `props: Record<string, unknown>` model
- `graph.server.ts` (533 lines) — TanStack server functions with `GraphNode → Item` converters

Backend selection is in `apps/nxus-core/src/config/feature-flags.ts`:
```typescript
export const ARCHITECTURE_TYPE: ArchitectureType = process.env.ARCHITECTURE_TYPE === 'graph' ? 'graph' : 'node'
```

**Core problem:** The graph service stores properties as a flat `props` blob, not as edges. Assembly in SurrealDB mode has no equivalent to `assembleNode()`. The two backends produce incompatible types (`AssembledNode` vs `GraphNode`).

---

## 2. Implementation Approach

### 2.1 Strategy Pattern with Backend Interfaces

The facade uses the **Strategy pattern**: a `NodeBackend` interface defines all operations, with two implementations (SQLite, SurrealDB). The facade selects the backend at initialization time and delegates all calls.

```
┌─────────────────────────────────────────────────────┐
│  Consumers (nxus-core, workbench, calendar)         │
│  import { nodeFacade } from '@nxus/db/server'       │
└─────────────┬───────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────┐
│  NodeFacade  (libs/nxus-db/src/services/facade.ts)  │
│  - init() → selects backend from ARCHITECTURE_TYPE  │
│  - Delegates all operations to active backend       │
│  - Pure helpers (getProperty, getPropertyValues)    │
│    don't delegate — they operate on AssembledNode   │
└─────────────┬──────────────────┬────────────────────┘
              │                  │
     ┌────────▼────────┐  ┌─────▼──────────────┐
     │  SQLiteBackend   │  │  SurrealDBBackend   │
     │  (sync, wraps    │  │  (async, new        │
     │   node.service)  │  │   graph model)      │
     └─────────────────┘  └─────────────────────┘
```

### 2.2 Key Design Decisions

**D1. Async facade API.** The SurrealDB SDK is inherently async. Rather than making the SQLite backend artificially async and the SurrealDB backend artificially sync, the facade exposes **async methods** for all operations. The SQLite backend returns immediately-resolved promises wrapping the existing synchronous functions. This is the correct approach because:
- It's truthful about the SurrealDB contract
- `await` on a resolved promise has negligible overhead in V8
- Consumers already use `async` server functions (TanStack `createServerFn`)
- It future-proofs for any backend that requires I/O

**D2. Singleton facade instance.** The facade is a module-level singleton (`nodeFacade`) exported from `@nxus/db/server`. Consumers call `await nodeFacade.init()` once (idempotent), then call methods directly. This replaces the current `initDatabase() + getDatabase()` two-step pattern.

**D3. Feature-flag moves to libs/nxus-db.** The `ARCHITECTURE_TYPE` env var is read inside the facade's `init()` method. The feature-flags file in `apps/nxus-core` becomes a thin re-export or is removed. This is necessary because the facade lives in the library layer, not the app layer.

**D4. SurrealDB graph model: `has_field` edges.** Properties become first-class graph edges (`node --[has_field {value, order}]--> field`), replacing the flat `props` blob. This means:
- `assembleNode` = `SELECT * FROM has_field WHERE in = $nodeId` + join field metadata
- Field definitions are records in a `field` table (mirroring how they are nodes in SQLite)
- Multi-value properties = multiple `has_field` edges to the same field with different `order` values

**D5. No changes to `AssembledNode` type.** The existing type is well-designed and used in 22+ files. Both backends produce it.

**D6. `getProperty` / `getPropertyValues` remain module-level pure functions.** They operate on `AssembledNode` data, not the database. They don't belong behind the facade's backend dispatch.

**D7. Query evaluator adaptation.** `evaluateQuery()` currently uses Drizzle directly. For phase 1, it will be wrapped by the facade. The SQLite backend calls the existing function. The SurrealDB backend translates `QueryDefinition` to SurQL `WHERE` clauses. This is a substantial piece of work but follows the same backend-dispatch pattern.

---

## 3. Source Code Structure Changes

### 3.1 New Files in `libs/nxus-db/src/`

```
services/
  facade.ts                      ← NodeFacade class + singleton export
  facade.test.ts                 ← Tests against both backends
  backends/
    types.ts                     ← NodeBackend interface definition
    sqlite-backend.ts            ← SQLite implementation (wraps node.service.ts)
    sqlite-backend.test.ts       ← SQLite-specific tests (thin; most coverage is existing)
    surreal-backend.ts           ← SurrealDB graph implementation
    surreal-backend.test.ts      ← SurrealDB-specific tests
    surreal-schema.ts            ← SurrealDB schema DDL (field table, has_field relation)
    surreal-assembly.ts          ← assembleNode via graph traversal
    surreal-assembly.test.ts     ← Assembly-specific tests
```

### 3.2 Modified Files in `libs/nxus-db/src/`

| File | Change |
|------|--------|
| `server.ts` | Add `export * from './services/facade.js'` and `export * from './services/backends/types.js'` |
| `services/index.ts` | Add `export * from './facade.js'` and `export * from './backends/types.js'` |
| `client/graph-client.ts` | Extend `initGraphSchema()` to include `field` table and `has_field` relation (or call out to `surreal-schema.ts`) |

### 3.3 Moved Files

| From | To | Reason |
|------|-----|--------|
| `apps/nxus-core/src/services/graph/graph.service.ts` | Absorbed into `libs/nxus-db/src/services/backends/surreal-backend.ts` | SurrealDB operations are a backend implementation detail |
| `apps/nxus-core/src/services/graph/graph.server.ts` | Kept but refactored to use facade | Server functions for TanStack routes remain in the app |
| `apps/nxus-core/src/config/feature-flags.ts` | Logic absorbed into facade init; file becomes thin re-export | Backend selection is a library concern |

### 3.4 Consumer Migration (22+ files)

Each consumer file changes from:
```typescript
// Before
import { initDatabase, getDatabase, assembleNode, setProperty, ... } from '@nxus/db/server'
initDatabase()
const db = getDatabase()
const node = assembleNode(db, nodeId)
```

To:
```typescript
// After
import { nodeFacade, getProperty, getPropertyValues } from '@nxus/db/server'
await nodeFacade.init()
const node = await nodeFacade.assembleNode(nodeId)
```

Note: `getProperty` and `getPropertyValues` remain top-level imports (pure helpers).

---

## 4. Data Model / API / Interface Changes

### 4.1 NodeBackend Interface

```typescript
// libs/nxus-db/src/services/backends/types.ts

import type { AssembledNode, CreateNodeOptions } from '../../types/node.js'
import type { FieldSystemId } from '../../schemas/node-schema.js'
import type { QueryDefinition } from '../../types/query.js'
import type { SupertagInfo } from '../node.service.js'

export interface QueryEvaluationResult {
  nodes: AssembledNode[]
  totalCount: number
  evaluatedAt: Date
}

export interface NodeBackend {
  /** Initialize the backend (connect, bootstrap schema). Idempotent. */
  init(): Promise<void>

  // -- Node CRUD --
  findNodeById(nodeId: string): Promise<AssembledNode | null>
  findNodeBySystemId(systemId: string): Promise<AssembledNode | null>
  createNode(options: CreateNodeOptions): Promise<string>
  updateNodeContent(nodeId: string, content: string): Promise<void>
  deleteNode(nodeId: string): Promise<void>

  // -- Assembly --
  assembleNode(nodeId: string): Promise<AssembledNode | null>
  assembleNodeWithInheritance(nodeId: string): Promise<AssembledNode | null>

  // -- Properties --
  setProperty(nodeId: string, fieldId: FieldSystemId, value: unknown, order?: number): Promise<void>
  addPropertyValue(nodeId: string, fieldId: FieldSystemId, value: unknown): Promise<void>
  clearProperty(nodeId: string, fieldId: FieldSystemId): Promise<void>
  linkNodes(fromId: string, fieldId: FieldSystemId, toId: string, append?: boolean): Promise<void>

  // -- Supertags --
  addNodeSupertag(nodeId: string, supertagSystemId: string): Promise<boolean>
  removeNodeSupertag(nodeId: string, supertagSystemId: string): Promise<boolean>
  getNodeSupertags(nodeId: string): Promise<SupertagInfo[]>
  getNodesBySupertags(supertagSystemIds: string[], matchAll?: boolean): Promise<AssembledNode[]>

  // -- Query --
  getNodesBySupertagWithInheritance(supertagId: string): Promise<AssembledNode[]>
  getAncestorSupertags(supertagId: string, maxDepth?: number): Promise<string[]>
  getSupertagFieldDefinitions(supertagId: string): Promise<Map<string, { fieldNodeId: string; fieldName: string; defaultValue?: unknown }>>
  evaluateQuery(definition: QueryDefinition): Promise<QueryEvaluationResult>

  // -- Persistence --
  save(): Promise<void>
}
```

### 4.2 NodeFacade Class

```typescript
// libs/nxus-db/src/services/facade.ts

export class NodeFacade implements NodeBackend {
  private backend: NodeBackend | null = null
  private initialized = false

  async init(): Promise<void> {
    if (this.initialized) return
    const archType = process.env.ARCHITECTURE_TYPE === 'graph' ? 'graph' : 'node'

    if (archType === 'graph') {
      const { SurrealBackend } = await import('./backends/surreal-backend.js')
      this.backend = new SurrealBackend()
    } else {
      const { SqliteBackend } = await import('./backends/sqlite-backend.js')
      this.backend = new SqliteBackend()
    }

    await this.backend.init()
    this.initialized = true
  }

  // All methods delegate to this.backend with init guard
  async assembleNode(nodeId: string): Promise<AssembledNode | null> {
    this.ensureInitialized()
    return this.backend!.assembleNode(nodeId)
  }

  // ... all other NodeBackend methods follow the same pattern
}

// Singleton export
export const nodeFacade = new NodeFacade()
```

### 4.3 SurrealDB Schema Additions

New table and relation to support the graph-based property model:

```sql
-- Field definition table (first-class entities)
DEFINE TABLE OVERWRITE field SCHEMAFULL;
DEFINE FIELD OVERWRITE content ON field TYPE string;
DEFINE FIELD OVERWRITE system_id ON field TYPE string;
DEFINE FIELD OVERWRITE value_type ON field TYPE option<string>;
DEFINE FIELD OVERWRITE default_value ON field FLEXIBLE TYPE option<any>;
DEFINE FIELD OVERWRITE created_at ON field TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_field_system_id ON field FIELDS system_id UNIQUE;

-- Property edge: node --[has_field]--> field
DEFINE TABLE OVERWRITE has_field SCHEMAFULL TYPE RELATION IN node OUT field;
DEFINE FIELD OVERWRITE value ON has_field FLEXIBLE TYPE option<any>;
DEFINE FIELD OVERWRITE order ON has_field TYPE option<int> DEFAULT 0;
DEFINE FIELD OVERWRITE created_at ON has_field TYPE datetime DEFAULT time::now();
DEFINE FIELD OVERWRITE updated_at ON has_field TYPE datetime DEFAULT time::now();
DEFINE INDEX OVERWRITE idx_has_field_in ON has_field FIELDS in;
DEFINE INDEX OVERWRITE idx_has_field_out ON has_field FIELDS out;
DEFINE INDEX OVERWRITE idx_has_field_in_out ON has_field FIELDS in, out;
```

### 4.4 SurrealDB Assembly Query

Assembling a node becomes a graph traversal:

```sql
-- Single query to get node + all properties + supertags
LET $base = (SELECT * FROM node WHERE id = $nodeId AND deleted_at IS NONE);
LET $props = (
  SELECT
    value,
    order,
    out.id AS field_id,
    out.content AS field_name,
    out.system_id AS field_system_id
  FROM has_field
  WHERE in = $nodeId
  ORDER BY out.system_id, order
);
LET $tags = (
  SELECT
    out.id AS id,
    out.name AS content,
    out.system_id AS system_id
  FROM has_supertag
  WHERE in = $nodeId
);
RETURN { base: $base, props: $props, tags: $tags };
```

The SurrealDB backend maps this result to `AssembledNode`:
- `properties` dict: group `$props` by `field_name`, create `PropertyValue` objects
- `supertags` array: map `$tags` to `{ id, content, systemId }`

### 4.5 ID Mapping Strategy

The SQLite backend uses UUIDv7 strings as node IDs. SurrealDB uses `RecordId` objects (e.g., `node:abc123`). The facade normalizes this:

- **Facade API uses `string` IDs everywhere** (matching `AssembledNode.id: string`)
- **SQLite backend:** IDs are UUIDs, used directly
- **SurrealDB backend:** IDs are stored as SurrealDB RecordIds internally. The backend converts to string form (`node:abc123`) when building `AssembledNode` and converts back (`toRecordId()`) when receiving IDs from the facade. The `AssembledNode.id` field will contain the string representation of the RecordId (e.g., `"node:abc123"`), consistent with the current graph service behavior.

### 4.6 Event Bus Integration

Both backends emit `MutationEvent`s through the existing `eventBus`:
- **SQLite backend:** Already emits events (existing node.service.ts behavior preserved)
- **SurrealDB backend:** Emits the same event types with the same payload shape. The `nodeId` in events uses the string-serialized RecordId.

The reactive system (query subscriptions, computed fields, automations) continues to work because it listens on `eventBus`, not on database-specific hooks.

---

## 5. Delivery Phases

### Phase 1: Foundation (Backend Interface + SQLite Backend + Facade Shell)

**Goal:** Define the `NodeBackend` interface, implement the `SqliteBackend` wrapping existing code, create the `NodeFacade` class, and export it. All existing tests must still pass. No consumer migration yet.

**Deliverables:**
- `services/backends/types.ts` — `NodeBackend` interface
- `services/backends/sqlite-backend.ts` — Wraps existing `node.service.ts` functions
- `services/facade.ts` — `NodeFacade` class + `nodeFacade` singleton
- `services/facade.test.ts` — Tests verifying the facade delegates correctly to SQLite backend
- Updated barrel exports in `server.ts` and `services/index.ts`

**Verification:**
- `npx nx run nxus-db:test` — all existing tests pass
- New facade tests pass (facade with SQLite backend produces same results as direct node.service calls)

### Phase 2: SurrealDB Graph Schema + Assembly

**Goal:** Implement the SurrealDB graph model for properties (`field` table, `has_field` edges) and the assembly function that produces `AssembledNode` from graph traversal.

**Deliverables:**
- `services/backends/surreal-schema.ts` — Schema DDL for `field` table and `has_field` relation
- `services/backends/surreal-assembly.ts` — `assembleNodeFromGraph()` function
- `services/backends/surreal-assembly.test.ts` — Tests with in-memory SurrealDB

**Verification:**
- Seed test data (nodes, field definitions, has_field edges) into in-memory SurrealDB
- Verify `assembleNodeFromGraph()` produces identical `AssembledNode` shape as SQLite's `assembleNode()`
- `npx nx run nxus-db:test` — all tests pass

### Phase 3: SurrealDB Backend Implementation

**Goal:** Complete the `SurrealBackend` class implementing all `NodeBackend` methods using the graph model.

**Deliverables:**
- `services/backends/surreal-backend.ts` — Full `SurrealBackend` implementation
- `services/backends/surreal-backend.test.ts` — Comprehensive tests for all operations
- Feature-flag logic in facade's `init()` method (reads `ARCHITECTURE_TYPE`)

**Verification:**
- Mirror of every `sqlite-backend.test.ts` test case, running against SurrealDB
- Property round-trip: `setProperty` → `assembleNode` → `getProperty` yields same value
- Supertag operations: add/remove/query with inheritance
- `npx nx run nxus-db:test` — all tests pass (both backends tested)

### Phase 4: Consumer Migration

**Goal:** Migrate all consumer files from direct `node.service` imports to the facade API.

**Deliverables:**
- Updated imports in all 22+ consumer files across `apps/nxus-core`, `libs/nxus-workbench`, `libs/nxus-calendar`
- Remove `isGraphArchitecture()` branching from `apps.server.ts` (facade handles this)
- Move graph service from `apps/nxus-core/src/services/graph/` to facade's SurrealDB backend
- Update `apps/nxus-core/src/services/nodes/index.ts` to re-export from facade
- Remove direct `getDatabase()` / `initDatabase()` usage from consumers (except ephemeral DB consumers which are unaffected)

**Verification:**
- `npx nx run-many --target=test --all` — all tests pass
- Manual test: run app with `ARCHITECTURE_TYPE=node` — existing behavior preserved
- Manual test: run app with `ARCHITECTURE_TYPE=graph` — app works with SurrealDB backend

### Phase 5: Migration Script + Query Evaluator

**Goal:** SQLite-to-SurrealDB data migration script and query evaluator adaptation.

**Deliverables:**
- Migration script: reads nodes + nodeProperties from SQLite, creates `field` records and `has_field` edges in SurrealDB
- SurrealDB query evaluator: translates `QueryDefinition` filters to SurQL `WHERE` clauses
- Dual-backend query evaluator tests

**Verification:**
- Migration script: seed SQLite, migrate, compare assembled output for every node
- Query evaluator: same `QueryDefinition` produces equivalent results from both backends

---

## 6. Verification Approach

### 6.1 Test Commands

```bash
# All library tests (includes nxus-db)
npx nx run nxus-db:test

# All project tests
npx nx run-many --target=test --all

# Type checking
npx nx run-many --target=typecheck --all
```

### 6.2 Test Strategy Per Phase

| Phase | Test Type | What's Verified |
|-------|-----------|----------------|
| 1 | Unit | SQLite backend wraps node.service correctly; facade delegates |
| 2 | Unit + Integration | SurrealDB assembly produces valid `AssembledNode` from graph traversal |
| 3 | Unit + Integration | All SurrealDB backend operations produce same results as SQLite |
| 4 | Integration | Consumer files work with facade; no regressions |
| 5 | Integration + E2E | Migration correctness; query equivalence |

### 6.3 Backend Equivalence Testing

A key test pattern: **parametric tests that run the same assertions against both backends.** This ensures behavioral parity:

```typescript
describe.each(['sqlite', 'surreal'] as const)('NodeBackend (%s)', (backendType) => {
  let backend: NodeBackend

  beforeAll(async () => {
    backend = backendType === 'sqlite'
      ? await createTestSqliteBackend()
      : await createTestSurrealBackend()
    await backend.init()
  })

  it('assembleNode returns correct shape', async () => {
    const nodeId = await backend.createNode({ content: 'Test Node' })
    await backend.setProperty(nodeId, SYSTEM_FIELDS.DESCRIPTION, 'A test')
    const assembled = await backend.assembleNode(nodeId)

    expect(assembled).toMatchObject({
      id: expect.any(String),
      content: 'Test Node',
      properties: {
        description: [expect.objectContaining({
          value: 'A test',
          fieldSystemId: 'field:description',
        })],
      },
    })
  })

  // ... 30+ more shared test cases
})
```

### 6.4 Regression Safety

- **Phase 1 adds no consumer changes** — zero regression risk
- **Phase 2-3 are additive** — new SurrealDB code, existing code untouched
- **Phase 4 is the migration** — tested by running existing test suites after import changes
- Each phase is independently deployable (facade falls back to SQLite by default)

---

## 7. Risk Analysis

| Risk | Mitigation |
|------|-----------|
| SurrealDB SDK is alpha (v2.0.0-alpha.18) | Tests run against in-memory embedded DB; SDK is already used in 157 tests |
| Async facade breaks sync consumer code | All consumers already use `async` server functions; `await` on sync SQLite ops has negligible cost |
| `has_field` edge queries are slower than SQLite EAV joins | SurrealDB indexes on `has_field.in` and `has_field.out`; assembly query is a single traversal |
| Migration script data loss | Validation step compares assembled output from both backends before switching |
| Consumer migration introduces regressions | Phase 4 is mechanical (import changes); existing tests catch regressions |
