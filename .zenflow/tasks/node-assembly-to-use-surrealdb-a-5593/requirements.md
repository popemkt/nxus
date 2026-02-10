# PRD: Node Assembly Facade with SurrealDB Graph Backend

## 1. Problem Statement

The Nxus system currently has two database backends (SQLite node-based, SurrealDB graph-based) with **no unified abstraction layer**. The switching logic lives in the `nxus-core` app via feature flags and conditional imports (`apps.server.ts:16-43`), meaning:

1. **Mini-apps are coupled to DB implementation details.** Each consumer (nxus-core, nxus-workbench, nxus-calendar) directly imports `assembleNode`, `setProperty`, `getDatabase`, etc. from `@nxus/db/server` and works with SQLite-specific APIs (Drizzle ORM query builders, synchronous `getDatabase()` calls).

2. **Node assembly is SQLite-only.** The core `assembleNode()` function (`node.service.ts:290-385`) queries `nodes` + `nodeProperties` tables using Drizzle joins. The SurrealDB graph service (`graph.service.ts`) has no equivalent — it stores properties as a flat `props` JSON blob on the document, losing the field-definition-as-node model.

3. **Two incompatible data models.** SQLite uses EAV (Entity-Attribute-Value) with `nodeProperties` rows keyed by `fieldNodeId`. SurrealDB stores a denormalized `props: Record<string, unknown>` on the node document. Converting between them requires ad-hoc adapter code (`graph.server.ts:60-131`).

4. **Duplicate, divergent APIs.** The node service has ~30 functions. The graph service has ~20 partially overlapping functions with different signatures, different type names (`AssembledNode` vs `GraphNode`), and different capabilities (inheritance exists only in SQLite).

This blocks the vision of **swappable backends** (SQLite, SurrealDB, future Datomic) behind a clean facade.

## 2. Goal

Introduce a **NodeFacade** in `libs/nxus-db` that:

- Provides a single, backend-agnostic API for all node operations (CRUD, assembly, properties, supertags, queries)
- Hides whether the underlying store is SQLite, SurrealDB, or a future alternative
- Models node properties as **graph edges** in SurrealDB (`node --[has_field {value, order}]--> field_definition_node`), making assembly a graph traversal
- Returns the existing `AssembledNode` type regardless of backend
- Allows mini-apps to migrate incrementally from direct node service calls to the facade

## 3. Requirements

### 3.1 Facade Interface (in `libs/nxus-db`)

**R1.** Define a `NodeFacade` interface (or set of functions) in `libs/nxus-db` that covers all node operations currently used by consumers. The interface must be backend-agnostic — no Drizzle types, no SurrealDB RecordId types in the public API.

**R2.** The facade must expose at minimum the following operation groups, matching the current node service API surface:

| Group | Operations |
|-------|-----------|
| **Initialization** | `init()` — initialize the active backend |
| **Node CRUD** | `findNodeById(id)`, `findNodeBySystemId(systemId)`, `createNode(options)`, `updateNodeContent(nodeId, content)`, `deleteNode(nodeId)` |
| **Assembly** | `assembleNode(nodeId)` → `AssembledNode`, `assembleNodeWithInheritance(nodeId)` → `AssembledNode` |
| **Properties** | `setProperty(nodeId, fieldSystemId, value, order?)`, `addPropertyValue(nodeId, fieldSystemId, value)`, `clearProperty(nodeId, fieldSystemId)`, `linkNodes(fromId, fieldId, toId, append?)` |
| **Supertags** | `addNodeSupertag(nodeId, supertagSystemId)`, `removeNodeSupertag(nodeId, supertagSystemId)`, `getNodeSupertags(nodeId)`, `getNodesBySupertags(supertagSystemIds, matchAll?)` |
| **Query** | `getNodesBySupertagWithInheritance(supertagId)`, `getAncestorSupertags(supertagId, maxDepth?)`, `getSupertagFieldDefinitions(supertagId)` |
| **Helpers** | `getProperty<T>(node, fieldName)`, `getPropertyValues<T>(node, fieldName)` — these operate on `AssembledNode` and remain pure functions |
| **Save/Persist** | `save()` — persist changes (relevant for SQLite's WAL flush; no-op for SurrealDB) |

**R3.** The facade must return `AssembledNode` (the existing type from `types/node.ts:17-27`) from all assembly operations, regardless of backend. This is the **canonical assembled type** for all consumers.

**R4.** The facade must accept and use `FieldSystemId` (e.g., `'field:supertag'`) and `FieldContentName` (e.g., `'Supertag'`) branded types for write and read operations respectively, preserving the existing dual-interface pattern.

### 3.2 SurrealDB Graph Model for Properties

**R5.** In SurrealDB, model node properties as graph edges using a `has_field` relation table:

```
node --[has_field { value, order }]--> field
```

Where:
- `node` is a record in the `node` table (the entity)
- `field` is a record in the `field` table (the field definition — a first-class entity with its own `system_id`, `content`, and configuration)
- The `has_field` edge carries: `value` (JSON-serializable), `order` (integer for multi-value ordering)
- Reference-type values (links to other nodes) store the target node's record ID as the `value`

**R6.** `field` definitions in SurrealDB must be first-class records (not just string keys), mirroring how they are nodes in the SQLite model. Each field record has: `system_id` (e.g., `'field:path'`), `content` (display name, e.g., `'path'`), `type` hint (string, number, boolean, date, reference, array), and optional `default_value`.

**R7.** Supertags in SurrealDB continue to use the existing `has_supertag` relation (`node --[has_supertag]--> supertag`). Supertag inheritance uses the existing `extends` relation (`supertag --[extends]--> parent_supertag`).

**R8.** Assembling a node in SurrealDB graph mode must be achievable via graph traversal: fetch the node, then follow all outgoing `has_field` edges to get properties (with field metadata from the target), and follow `has_supertag` edges to get supertags. The result must map to `AssembledNode`.

### 3.3 Backend Selection and Migration

**R9.** Backend selection uses the existing `ARCHITECTURE_TYPE` environment variable (`feature-flags.ts`). The facade reads this at initialization and delegates to the appropriate backend implementation. Only one backend is active at a time.

**R10.** The SQLite backend implementation wraps the existing node service functions (`node.service.ts`) with no behavioral changes. This is the safe default — existing behavior is preserved exactly.

**R11.** The SurrealDB backend implementation must produce identical `AssembledNode` output for the same logical data. Verification: seeding the same data into both backends and comparing assembled output must yield equivalent results.

**R12.** Migration path: A one-time migration script reads all data from SQLite (nodes, nodeProperties) and writes it to SurrealDB using the graph model (nodes, field definitions, `has_field` edges, `has_supertag` edges). This enables switching `ARCHITECTURE_TYPE` from `'node'` to `'graph'` without data loss.

### 3.4 Consumer Migration

**R13.** All existing consumers (22 files across nxus-core, libs/nxus-workbench, libs/nxus-calendar) must migrate from direct node service imports to the facade. The facade is exported from `@nxus/db/server`.

**R14.** Migration can be done in one pass since the facade API matches the existing node service function signatures. The primary change per consumer is: replace `import { assembleNode, ... } from '@nxus/db/server'` with facade-based imports, and replace `getDatabase()` + function calls with facade calls (which handle initialization internally).

**R15.** After migration, no consumer outside `libs/nxus-db` should directly import: `getDatabase()`, `initDatabase()`, Drizzle query builders (`eq`, `and`, `like`, etc.), `getGraphDatabase()`, `initGraphDatabase()`, or SurrealDB types. These become internal implementation details of the facade.

### 3.5 What Is NOT In Scope

**R16.** The following are explicitly out of scope for this task:

- **Reactive features** (event bus subscriptions, query subscriptions, computed fields, automations) — the facade will not expose a reactive API in this phase. The existing `eventBus` continues to work internally but is not part of the facade contract. Direction to be decided separately with the user.
- **Running both backends simultaneously** (dual-write / read-from-one) — only one backend is active at a time.
- **Legacy table migration** (the `items`, `item_tags`, `tags`, `commands` tables) — these are already handled by existing migration scripts and are orthogonal to this work.
- **SurrealDB live queries** — polling-based subscriptions in the current graph service are not part of the facade.
- **Query evaluator migration** — `evaluateQuery()` and `QueryDefinition` processing continues to work against the active backend but may need a separate adaptation step.

## 4. Data Model Mapping

### 4.1 SQLite (existing, unchanged)

```
nodes (table)
  id: text PK (UUID)
  content: text
  system_id: text UNIQUE
  owner_id: text
  created_at, updated_at, deleted_at

nodeProperties (table)
  id: integer PK
  node_id: text FK → nodes.id
  field_node_id: text FK → nodes.id (field definition)
  value: text (JSON-encoded)
  order: integer
  created_at, updated_at
```

### 4.2 SurrealDB Graph (new model)

```
node (table)
  id: record
  content: option<string>
  content_plain: option<string>
  system_id: option<string>       -- e.g., 'item:claude-code'
  owner_id: option<record<node>>
  created_at: datetime
  updated_at: datetime
  deleted_at: option<datetime>

field (table)
  id: record
  content: string                 -- display name, e.g., 'path'
  system_id: string               -- e.g., 'field:path'
  value_type: option<string>      -- 'string' | 'number' | 'boolean' | 'date' | 'reference' | 'array'
  default_value: option<any>
  created_at: datetime

supertag (table)                  -- existing, unchanged
  id: record
  name: string
  system_id: option<string>
  color: option<string>
  icon: option<string>
  field_schema: option<array>
  created_at: datetime

has_field (relation: node -> field)
  in: record<node>
  out: record<field>
  value: option<any>              -- JSON-serializable property value
  order: option<int>              -- for multi-value ordering (0-based)
  created_at: datetime

has_supertag (relation: node -> supertag)  -- existing
  in: record<node>
  out: record<supertag>
  created_at: datetime

extends (relation: supertag -> supertag)   -- existing
  in: record<supertag>
  out: record<supertag>
  created_at: datetime

-- Other existing relations remain: part_of, dependency_of, references, tagged_with
```

### 4.3 Assembly Query (SurrealDB)

Assembling a node in SurrealDB:

```sql
-- 1. Get base node
SELECT * FROM node WHERE id = $nodeId;

-- 2. Get all properties (field edges with field definition metadata)
SELECT
  value,
  order,
  out.id AS fieldNodeId,
  out.content AS fieldName,
  out.system_id AS fieldSystemId
FROM has_field
WHERE in = $nodeId
ORDER BY out.system_id, order;

-- 3. Get supertags
SELECT out.* FROM has_supertag WHERE in = $nodeId;
```

This maps directly to the `AssembledNode` shape:
- `properties` keyed by `fieldName` (from `out.content`)
- `supertags` from `has_supertag` targets

## 5. Affected Consumers (complete inventory)

### libs/nxus-db (internal — facade implementation lives here)
- `services/node.service.ts` — becomes the SQLite backend implementation
- `client/graph-client.ts` — used by the SurrealDB backend implementation
- New: `services/facade.ts` (or similar) — the facade entry point

### apps/nxus-core (heaviest consumer — 12 files)
| File | Key imports to migrate |
|------|----------------------|
| `services/apps/apps-mutations.server.ts` | `findNodeBySystemId`, `setProperty`, `addPropertyValue`, `clearProperty`, `getDatabase`, `getSystemNode` |
| `services/apps/node-items.server.ts` | `FIELD_NAMES`, `AssembledNode` (types only — minimal change) |
| `services/apps/apps.server.ts` | `isGraphArchitecture` branching — **eliminated by facade** |
| `services/tag.server.ts` | `createNode`, `findNodeBySystemId`, `setProperty`, `deleteNode`, `getNodesBySupertagWithInheritance` |
| `services/tag-config.server.ts` | `getNodesBySupertagWithInheritance`, `initDatabase` |
| `services/inbox/inbox.server.ts` | `assembleNode`, `createNode`, `setProperty`, `deleteNode`, `getNodesBySupertagWithInheritance` |
| `services/graph/graph.service.ts` | **Absorbed into facade's SurrealDB backend** |
| `services/graph/graph.server.ts` | **Absorbed into facade's SurrealDB backend** |
| `services/nodes/index.ts` | **Re-export hub — re-exports facade instead** |
| `services/command-palette/alias.server.ts` | Uses ephemeral DB only — no change needed |
| `services/tool-health/tool-health.service.ts` | Uses ephemeral DB only — no change needed |
| `scripts/assemble-full-items.ts` | `findNode`, `getDatabase`, `getNodesBySupertagWithInheritance` |
| `scripts/compare-legacy-vs-nodes.ts` | `getDatabase`, `getNodesBySupertagWithInheritance` |

### libs/nxus-workbench (4 server files)
| File | Key imports to migrate |
|------|----------------------|
| `server/nodes.server.ts` | `assembleNode`, `findNodeById`, `createNode`, `deleteNode`, `setProperty`, `initDatabase` |
| `server/search-nodes.server.ts` | `assembleNode`, `initDatabase`, `getDatabase`, `nodes` table + Drizzle `like`/`isNull` |
| `server/query.server.ts` | `createNode`, `setProperty`, `evaluateQuery`, `SYSTEM_SUPERTAGS`, `SYSTEM_FIELDS` |
| `server/graph.server.ts` | Various node operations for graph visualization |

### libs/nxus-calendar (2 server files)
| File | Key imports to migrate |
|------|----------------------|
| `server/calendar.server.ts` | `assembleNode`, `createNode`, `deleteNode`, `setProperty`, `updateNodeContent`, `getProperty`, `evaluateQuery` |
| `server/google-sync.server.ts` | `assembleNode`, `createNode`, `setProperty`, `getProperty`, `evaluateQuery` |

## 6. Validation Strategy

**V1.** Unit tests for each facade operation, verifying both SQLite and SurrealDB backends produce equivalent `AssembledNode` output for the same logical data.

**V2.** The existing test suites (532 tests passing, including 157 SurrealDB-specific tests) must continue to pass after migration.

**V3.** Migration script validation: Seed SQLite with current data, run migration to SurrealDB, compare assembled output for every node. Zero differences = migration is correct.

**V4.** Integration test: Run the nxus-core app with `ARCHITECTURE_TYPE=graph` and verify the app gallery, inbox, tags, and calendar render correctly with SurrealDB-backed assembly.

## 7. Assumptions & Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| A1 | Facade lives in `libs/nxus-db`, not in any app | All mini-apps need it; it's a fundamental data layer concern |
| A2 | Edge direction: `node --[has_field]--> field_definition` | Assembly = "get all outgoing has_field edges"; field definitions are reusable targets; matches how SQLite EAV works (nodeId → fieldNodeId) |
| A3 | Edge carries value + order | SurrealDB edges are real tables that can carry properties; avoids separate value nodes |
| A4 | `AssembledNode` is the canonical return type | Changing it would break all 22+ consumer files; it's already well-designed |
| A5 | One backend active at a time (feature flag) | Simplest migration path; dual-write adds complexity without clear benefit now |
| A6 | SQLite backend wraps existing code unchanged | Zero risk of regression; existing tests validate it |
| A7 | Reactive API deferred to a later phase | User requested separate decision point for this |
| A8 | `getProperty` / `getPropertyValues` remain pure helpers on `AssembledNode` | They don't touch the DB; no reason to put them behind the facade dispatch |
| A9 | `ephemeral DB` consumers (alias.server.ts, tool-health.service.ts) are not affected | They use a separate TTL cache DB, not the node store |
| A10 | Graph service moves from `apps/nxus-core` into `libs/nxus-db` | It's an implementation detail of the SurrealDB backend, not app-specific logic |
