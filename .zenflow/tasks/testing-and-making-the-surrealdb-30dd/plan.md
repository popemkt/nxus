# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

---

## Workflow Steps

### [x] Step: Technical Specification

Assess the task's difficulty, as underestimating it leads to poor outcomes.
- easy: Straightforward implementation, trivial bug fix or feature
- medium: Moderate complexity, some edge cases or caveats to consider
- hard: Complex logic, many caveats, architectural considerations, or high-risk changes

Create a technical specification for the task that is appropriate for the complexity level:
- Review the existing codebase architecture and identify reusable components.
- Define the implementation approach based on established patterns in the project.
- Identify all source code files that will be created or modified.
- Define any necessary data model, API, or interface changes.
- Describe verification steps using the project's test and lint commands.

Save the output to `{@artifacts_path}/spec.md` with:
- Technical context (language, dependencies)
- Implementation approach
- Source code structure changes
- Data model / API / interface changes
- Verification approach

If the task is complex enough, create a detailed implementation plan based on `{@artifacts_path}/spec.md`:
- Break down the work into concrete tasks (incrementable, testable milestones)
- Each task should reference relevant contracts and include verification steps
- Replace the Implementation step below with the planned tasks

Rule of thumb for step size: each step should represent a coherent unit of work (e.g., implement a component, add an API endpoint, write tests for a module). Avoid steps that are too granular (single function).

Important: unit tests must be part of each implementation task, not separate tasks. Each task should implement the code and its tests together, if relevant.

Save to `{@artifacts_path}/plan.md`. If the feature is trivial and doesn't warrant this breakdown, keep the Implementation step below as is.

---

### [x] Step: SDK Upgrade and Testing Infrastructure
<!-- chat-id: 0407a580-3bd8-435d-a397-2b8e76bf83a3 -->

Upgrade SurrealDB dependencies and establish the test infrastructure for in-memory embedded testing.

- Upgrade `surrealdb` from `^1.3.2` to v2 in both `packages/nxus-db/package.json` and `packages/nxus-core/package.json`
- Add `@surrealdb/node` as devDependency for embedded `mem://` in-memory engine support
- Update `packages/nxus-db/src/client/graph-client.ts` to support v2 SDK API:
  - New `Surreal` constructor with `engines` option for embedded mode
  - Support both remote (`http://...`) and embedded (`mem://`) connection modes
  - Export a `createEmbeddedGraphDatabase()` helper for tests
- Create `packages/nxus-db/src/client/__tests__/graph-test-utils.ts`:
  - In-memory SurrealDB setup/teardown helpers
  - Schema initialization for test databases
  - Seed data helpers for system supertags (Item, Tag, Field, Command)
- Write basic smoke tests verifying the embedded connection works
- Run `pnpm install` and verify no regressions in existing SQLite tests (`pnpm test` in nxus-db)

**Verification:** `pnpm test` passes in `packages/nxus-db`, embedded SurrealDB smoke test passes.

---

### [x] Step: Test graph-client.ts (Connection and Schema)
<!-- chat-id: c1460c89-9f0e-4246-b247-b614130c1e0a -->

Write unit tests for the SurrealDB connection layer.

- Create `packages/nxus-db/src/client/__tests__/graph-client.test.ts`
- Test `initGraphDatabase()` with embedded mode (mem://)
- Test schema initialization:
  - `node` table with all fields (content, content_plain, system_id, props, timestamps)
  - `supertag` table with all fields
  - All 6 relation tables (has_supertag, extends, part_of, dependency_of, references, tagged_with)
  - System supertags bootstrap (supertag:item, supertag:tag, supertag:field, supertag:command)
  - Index creation (idx_system_id, idx_content_plain, idx_deleted, etc.)
- Test `getGraphDatabase()` returns the connected instance
- Test `closeGraphDatabase()` properly closes connection
- Fix any SurrealQL syntax issues discovered (v1 → v2 differences)

**Verification:** All graph-client tests pass, schema validated against expected tables/fields.

---

### [x] Step: Test graph.service.ts (CRUD and Relations)
<!-- chat-id: 907179f4-1a2a-4875-bef7-e44581cffec7 -->

Write unit tests for the graph service CRUD operations and relation management.

- Create `packages/nxus-core/src/services/graph/__tests__/graph.service.test.ts`
- Test Node CRUD:
  - `createNode()` — basic, with system_id, with supertag, with props
  - `getNode()` — by ID, returns null for non-existent
  - `getNodeBySystemId()` — finds by system_id, excludes deleted
  - `updateNode()` — update content, update props, returns updated node
  - `deleteNode()` — soft delete (sets deleted_at)
  - `purgeNode()` — hard delete including all relations
- Test Supertag operations:
  - `getAllSupertags()` — returns system supertags
  - `getSupertagBySystemId()` — finds by system_id
  - `getNodesBySupertag()` — returns nodes with matching supertag
- Test Relation operations:
  - `addRelation()` — all 6 types, with order/context metadata
  - `removeRelation()` — removes specific relation
  - `getOutgoingRelations()` — returns target nodes
  - `getIncomingRelations()` — returns source nodes (backlinks)
- Fix any SurrealQL query issues discovered during testing

**Verification:** All CRUD and relation tests pass, SurrealQL queries validated.

---

### [ ] Step: Test graph.service.ts (Traversals and Search)

Write unit tests for the semantic traversal operators and search functionality.

- Add to `packages/nxus-core/src/services/graph/__tests__/graph.service.test.ts`
- Test Semantic Traversals (create multi-level hierarchies for each):
  - `componentsRec()` — recursive part_of descendants (A→B→C, query A returns B,C)
  - `dependenciesRec()` — recursive dependency chain
  - `dependentsRec()` — reverse dependency chain
  - `backlinks()` — all nodes referencing a target
  - `ancestorsRec()` — recursive part_of ancestors
- Test edge cases:
  - Cyclic relations (A→B→A should not infinite loop)
  - Deleted nodes excluded from traversals
  - maxDepth parameter respected
  - Deduplication of results
- Test search and property queries:
  - `searchNodes()` — case-insensitive content search
  - `getNodesByProperty()` — filter by props values
- Fix any recursive traversal SurrealQL issues

**Verification:** All traversal tests pass including edge cases, search returns correct results.

---

### [ ] Step: Event Bus Integration for SurrealDB Mutations

Integrate the reactive event bus with SurrealDB mutation operations so the reactive layer responds to graph changes.

- Modify `packages/nxus-core/src/services/graph/graph.service.ts`:
  - Import `eventBus` from `@nxus/db/server` (already exported via reactive module)
  - Add event emission to `createNode()` → emit `node:created`
  - Add event emission to `updateNode()` → emit `node:updated` with before/after
  - Add event emission to `deleteNode()` → emit `node:deleted`
  - Add event emission to `addRelation('has_supertag', ...)` → emit `supertag:added`
  - Add event emission to `removeRelation('has_supertag', ...)` → emit `supertag:removed`
- Write tests verifying event emission:
  - Each mutation emits the correct event type
  - Events contain correct nodeId, timestamp, before/afterValue
  - Supertag events include supertagId
- Ensure `purgeNode()` emits `node:deleted` event

**Verification:** Event bus tests pass, mutations correctly broadcast to all subscribers.

---

### [ ] Step: Integration Tests and Final Validation

Write integration tests verifying the full SurrealDB → Event Bus pipeline and validate no regressions.

- Write integration test combining graph.service + event bus:
  - Create nodes via graph.service → verify event bus subscriber receives events
  - Add/remove supertags → verify supertag events fire
  - Full CRUD cycle → verify complete event lifecycle
- Validate graph.server.ts type converters:
  - `graphNodeToItem()` round-trip accuracy
  - `serializeGraphNode()` output format
  - Tag conversion pipeline
- Run full test suites:
  - `cd packages/nxus-db && pnpm test` — all existing + new graph tests pass
  - `cd packages/nxus-core && pnpm test` — all existing + new graph tests pass
- Write report to `{@artifacts_path}/report.md`:
  - What was implemented
  - How the solution was tested
  - Issues encountered and how they were resolved
  - SurrealQL fixes/changes made
  - Recommendations for next steps (data sync, production deployment, etc.)

**Verification:** All tests pass in both packages, no regressions, report written.
