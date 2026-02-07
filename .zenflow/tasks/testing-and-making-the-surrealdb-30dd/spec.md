# Technical Specification: Testing and Making the SurrealDB Backend Functional

## Difficulty Assessment: **Hard**

This is a complex task involving:
- An existing but untested SurrealDB integration that uses SDK v1.3 (which has no embedded/in-memory mode)
- A comprehensive reactive backend layer (event bus, query subscriptions, computed fields, automations) built entirely around SQLite
- The SurrealDB implementation has a different data model (graph relations via `RELATE`, `props` object) vs SQLite (EAV pattern with `nodeProperties` table)
- No existing tests for SurrealDB code
- SDK version considerations (v1.3 vs v2.x for embedded testing support)
- Need to integrate SurrealDB operations with the reactive event bus

## Technical Context

### Current Stack

| Component | Technology | Location |
|-----------|------------|----------|
| Primary Storage | SQLite + Drizzle ORM (better-sqlite3) | `packages/nxus-db/src/client/master-client.ts` |
| Graph Storage | SurrealDB v1.3.2 (JS SDK) | `packages/nxus-db/src/client/graph-client.ts` |
| Node Service | CRUD + query operations | `packages/nxus-db/src/services/node.service.ts` |
| Query Engine | Pull-based evaluator | `packages/nxus-db/src/services/query-evaluator.service.ts` |
| Reactive Layer | Event bus + subscriptions | `packages/nxus-db/src/reactive/` |
| Graph Service | SurrealDB CRUD + traversals | `packages/nxus-core/src/services/graph/graph.service.ts` |
| Graph Server | TanStack server functions | `packages/nxus-core/src/services/graph/graph.server.ts` |
| Feature Flags | Architecture toggle | `packages/nxus-core/src/config/feature-flags.ts` |
| Testing | Vitest + in-memory SQLite | `packages/nxus-db/vitest.config.ts` |

### Current SurrealDB Implementation Status

**What exists:**
1. `graph-client.ts` (267 lines) — Connection management, schema initialization with 7 tables (node, supertag, has_supertag, extends, part_of, dependency_of, references, tagged_with)
2. `graph.service.ts` (669 lines) — Full CRUD for nodes, supertags, relations, semantic traversals (componentsRec, dependenciesRec, etc.), polling-based live subscriptions
3. `graph.server.ts` (529 lines) — TanStack server functions wrapping graph.service, type converters between GraphNode and Item/Tag

**What's missing:**
1. **No tests** — Zero test coverage for any SurrealDB code
2. **No event bus integration** — SurrealDB mutations don't emit to the reactive event bus
3. **No embedded testing support** — SDK v1.3 requires running SurrealDB server; v2.x with `@surrealdb/node` supports `mem://` for in-memory testing
4. **No data sync** — No code to sync between SQLite and SurrealDB
5. **SurrealQL correctness unknown** — Queries like recursive traversals (`->part_of*10->`) haven't been validated
6. **Feature flag exists but is unused** — `ARCHITECTURE_TYPE` in feature-flags.ts defaults to `'node'` (SQLite)

### Data Model Differences

| Aspect | SQLite (node.service) | SurrealDB (graph.service) |
|--------|----------------------|--------------------------|
| Properties | EAV table (`nodeProperties`) with fieldNodeId + JSON value | `props` object on node record |
| Supertags | Property with fieldNodeId = supertagField.id | Explicit `has_supertag` relation table |
| Inheritance | `field:extends` property pointing to parent supertag | `extends` relation table |
| Relations | Properties with value = target nodeId | Typed relation tables (`part_of`, `dependency_of`, `references`, `tagged_with`) |
| Traversals | Manual recursive queries in JS | SurrealQL `->relation*N->` syntax |
| IDs | UUIDv7 strings | SurrealDB `RecordId` objects |

### SurrealDB SDK Version Situation

The project uses `surrealdb@^1.3.2` which:
- Only supports connecting to a **running SurrealDB server** via HTTP/WebSocket
- Does NOT support embedded/in-memory mode
- Requires external SurrealDB process for testing

The newer `surrealdb@^2.x` + `@surrealdb/node`:
- Supports `mem://` in-memory embedded mode
- Breaking API changes (constructor options, event system, auth)
- SurrealQL syntax changes (UPSERT instead of CREATE for idempotent ops, access management changes)
- Would enable fast, isolated testing without external server

## Implementation Approach

### Goal
Make the SurrealDB backend functional by:
1. Writing comprehensive tests for all existing SurrealDB code
2. Upgrading to SDK v2 to enable embedded in-memory testing (no external server dependency)
3. Ensuring SurrealDB operations integrate with the reactive event bus
4. Validating and fixing SurrealQL queries

### Strategy: Test-First with SDK Upgrade

**Phase 1: SDK Upgrade + Testing Infrastructure**
- Upgrade `surrealdb` to v2 and add `@surrealdb/node` for embedded in-memory testing
- Update `graph-client.ts` to support both remote (production) and embedded (testing) modes
- Create test utilities (in-memory DB setup/teardown, schema initialization)

**Phase 2: Unit Tests for graph-client.ts**
- Test connection, schema initialization, reconnection
- Test SURREAL_CONFIG environment variable handling

**Phase 3: Unit Tests for graph.service.ts**
- Test all CRUD operations (createNode, getNode, updateNode, deleteNode, purgeNode)
- Test supertag operations (getAllSupertags, getSupertagBySystemId, getNodesBySupertag)
- Test relation operations (addRelation, removeRelation, getOutgoing/IncomingRelations)
- Test semantic traversals (componentsRec, dependenciesRec, dependentsRec, backlinks, ancestorsRec)
- Test search and property queries
- Fix any SurrealQL issues discovered during testing

**Phase 4: Event Bus Integration**
- Add event bus emission to graph.service mutation functions (createNode, updateNode, deleteNode)
- Mirror the pattern from `node.service.ts` where mutations emit `MutationEvent`s
- This enables the reactive layer (query subscriptions, automations) to work with SurrealDB mutations

**Phase 5: Integration Tests**
- Test graph.service + event bus together
- Test graph.server.ts server functions (if feasible without TanStack Start runtime)
- Validate the full Item/Tag conversion pipeline

## Source Code Changes

### New Files

| File | Purpose |
|------|---------|
| `packages/nxus-db/src/client/__tests__/graph-client.test.ts` | Unit tests for SurrealDB connection and schema |
| `packages/nxus-db/src/client/__tests__/graph-test-utils.ts` | Shared test utilities (in-memory DB, seed data) |
| `packages/nxus-core/src/services/graph/__tests__/graph.service.test.ts` | Unit tests for graph CRUD, relations, traversals |

### Modified Files

| File | Changes |
|------|---------|
| `packages/nxus-db/package.json` | Upgrade `surrealdb` to v2, add `@surrealdb/node` |
| `packages/nxus-core/package.json` | Upgrade `surrealdb` to v2, add `@surrealdb/node` |
| `packages/nxus-db/src/client/graph-client.ts` | Support v2 SDK constructor, add embedded mode for testing |
| `packages/nxus-core/src/services/graph/graph.service.ts` | Add event bus emission to mutations, fix SurrealQL if needed |
| `packages/nxus-core/src/services/graph/graph.server.ts` | Fix any type issues from SDK upgrade |

### Dependency Changes

```
# Upgrade
surrealdb: ^1.3.2 → ^2.x (latest stable)

# Add
@surrealdb/node: ^2.x (for embedded in-memory engine)
```

## Key Design Decisions

### 1. SDK Upgrade to v2
**Decision:** Upgrade from v1.3 to v2.x
**Rationale:** v1.3 cannot run tests without an external SurrealDB server. The embedded `mem://` mode in v2 via `@surrealdb/node` enables fast, isolated tests. This is the critical blocker for proper testing.
**Risk:** Breaking API changes in v2. Mitigated by the fact that the current code isn't used in production (feature flag = 'node').

### 2. Event Bus Integration Pattern
**Decision:** Graph service mutations emit to the same `eventBus` singleton from `reactive/event-bus.ts`
**Rationale:** This allows the reactive layer (query subscriptions, computed fields, automations) to respond to SurrealDB mutations without any changes. The event bus is architecture-agnostic — it just needs `MutationEvent`s.
**Pattern:** Same as `node.service.ts` — each mutation function emits an event after the database operation succeeds.

### 3. Test Location
**Decision:** Graph client tests in `nxus-db`, graph service tests in `nxus-core`
**Rationale:** Follows the current code location. `graph-client.ts` is in `nxus-db`, while `graph.service.ts` is in `nxus-core`.

### 4. Dual-Mode Connection
**Decision:** `graph-client.ts` supports both remote (`http://...`) and embedded (`mem://`) connections
**Rationale:** Remote for production/dev with running SurrealDB server, embedded for tests.

## Verification Approach

### Unit Testing
- **graph-client.ts**: Connection lifecycle, schema creation, config resolution
- **graph.service.ts**: All 20+ exported functions tested against in-memory SurrealDB
- **Event emission**: Verify mutations emit correct `MutationEvent` types

### Integration Testing
- CRUD → Event Bus → Query Subscription chain
- Item/Tag conversion round-trip accuracy
- Recursive traversal correctness with multi-level hierarchies

### Validation
- Run all existing tests to ensure no regressions in SQLite path
- Run `pnpm test` in both `nxus-db` and `nxus-core` packages
- Lint checks pass

### Test Commands
```bash
# Run all nxus-db tests
cd packages/nxus-db && pnpm test

# Run all nxus-core tests
cd packages/nxus-core && pnpm test

# Run only graph-related tests
cd packages/nxus-db && npx vitest run src/client/__tests__/graph-client.test.ts
cd packages/nxus-core && npx vitest run src/services/graph/__tests__/graph.service.test.ts
```

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| SurrealDB v2 SDK has different SurrealQL syntax | Medium | High | Test all queries, fix as discovered |
| `@surrealdb/node` native bindings don't build on all platforms | Low | High | Add as devDependency only, CI fallback |
| SurrealQL recursive traversal syntax differs in v2 | Medium | Medium | Validate and update query syntax |
| Event bus integration creates coupling between packages | Low | Low | Use the existing singleton pattern, same as node.service |
| Test execution time with embedded SurrealDB | Low | Low | In-memory mode is fast; parallel test suites |
