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
<!-- chat-id: 40cef3ab-b301-4091-88ac-7951d8d77a70 -->

**Difficulty Assessment**: Hard

Created comprehensive technical specification in `spec.md` covering:
- Query definition schema with multiple filter types
- Backend query evaluation engine design
- Frontend query builder component architecture
- Gallery integration strategy
- Reactivity via TanStack Query cache invalidation

---

### [x] Step: Phase 1 - Core Query Types & Schema

**Goal**: Add query data model to `@nxus/db`

**Tasks**:
1. Create `packages/nxus-db/src/types/query.ts`:
   - `QueryFilterSchema` (discriminated union of filter types)
   - `QueryDefinitionSchema` (filters, sort, limit)
   - Filter type schemas: supertag, property, content, relation, temporal, hasField, logical
   - `QuerySortSchema`
   - Type exports

2. Update `packages/nxus-db/src/schemas/node-schema.ts`:
   - Add `SYSTEM_SUPERTAGS.QUERY = 'supertag:query'`
   - Add query-related `SYSTEM_FIELDS`:
     - `QUERY_DEFINITION = 'field:query_definition'`
     - `QUERY_SORT = 'field:query_sort'`
     - `QUERY_LIMIT = 'field:query_limit'`
     - `QUERY_RESULT_CACHE = 'field:query_result_cache'`
     - `QUERY_EVALUATED_AT = 'field:query_evaluated_at'`

3. Export new types from `packages/nxus-db/src/index.ts`

**Verification**:
- TypeScript compiles without errors
- `pnpm --filter @nxus/db build`

---

### [x] Step: Phase 2 - Query Evaluation Engine
<!-- chat-id: 328ddc9d-d61c-430b-b37c-2adc5a2d053c -->

**Goal**: Implement backend query execution logic

**Completed**:
1. Created `packages/nxus-db/src/services/query-evaluator.service.ts` with:
   - `evaluateQuery(db, definition)` - main entry point returning `QueryEvaluationResult`
   - `evaluateFilter(db, filter, candidateNodeIds)` - dispatcher for all filter types
   - `evaluateSupertagFilter()` - uses `getNodeIdsBySupertagWithInheritance` with optional direct-match mode
   - `evaluatePropertyFilter()` - supports all comparison operators (eq, neq, gt, gte, lt, lte, contains, startsWith, endsWith, isEmpty, isNotEmpty)
   - `evaluateContentFilter()` - full-text search on `contentPlain` with case-sensitivity option
   - `evaluateHasFieldFilter()` - check field existence with negate option
   - `evaluateTemporalFilter()` - date-based filtering (within, before, after)
   - `evaluateRelationFilter()` - ownership/backlink queries (childOf, ownedBy, linksTo, linkedFrom)
   - `evaluateLogicalFilter()` - AND/OR/NOT combinations with nested support
   - `sortNodes()` - sorting by content, timestamps, or property fields
   - Limit enforcement with totalCount tracking

2. Created comprehensive unit tests in `query-evaluator.service.test.ts`:
   - 34 tests covering all filter types
   - Tests for complex queries, sorting, limiting, and edge cases

3. Exported from `packages/nxus-db/src/services/index.ts`

**Verification**:
- All 54 tests pass: `pnpm --filter @nxus/db test`
- TypeScript compiles without errors

---

### [ ] Step: Phase 3 - Query Server Functions

**Goal**: Create server API for query operations

**Tasks**:
1. Create `packages/nxus-workbench/src/server/query.server.ts`:
   - `evaluateQueryServerFn` - evaluate query definition, return nodes
   - `createQueryServerFn` - create saved query node
   - `updateQueryServerFn` - update saved query
   - `getSavedQueriesServerFn` - list all saved queries
   - `executeSavedQueryServerFn` - run saved query by ID

2. Export from `packages/nxus-workbench/src/server/index.ts`

3. Add input validation with Zod schemas

**Verification**:
- Server functions callable from client
- Manual test via React component or dev tools

---

### [ ] Step: Phase 4 - Query Builder UI (Basic)

**Goal**: Create visual query builder component

**Tasks**:
1. Create component structure:
   ```
   packages/nxus-core/src/components/features/query-builder/
   ├── index.ts
   ├── query-builder.tsx       # Main container
   ├── filter-list.tsx         # Renders filter chips
   ├── filter-chip.tsx         # Individual filter display
   ├── add-filter-menu.tsx     # Dropdown to add new filters
   └── filters/
       ├── index.ts
       ├── supertag-filter.tsx
       ├── property-filter.tsx
       └── content-filter.tsx
   ```

2. Implement `QueryBuilder` component:
   - Props: `value`, `onChange`, `onExecute`, `compact`
   - State: editing filter, add menu open
   - Layout: filter chips + add button + execute button

3. Implement basic filter editors:
   - `SupertagFilter`: dropdown of available supertags
   - `PropertyFilter`: field selector + operator + value input
   - `ContentFilter`: text search input

4. Create Zustand store `packages/nxus-core/src/stores/query.store.ts`:
   - Current query definition
   - Query builder UI state

**Verification**:
- Component renders without errors
- Can add/remove filters
- Execute button triggers query

---

### [ ] Step: Phase 5 - Query Execution Hook

**Goal**: Create React hooks for query execution

**Tasks**:
1. Create `packages/nxus-core/src/hooks/use-query.ts`:
   - `useQueryEvaluation(definition)` - evaluate ad-hoc query
   - `useSavedQuery(queryId)` - execute saved query
   - `useSavedQueries()` - list all saved queries

2. Implement with TanStack Query:
   - Query keys include definition hash for caching
   - Stale time configuration

**Verification**:
- Hooks work in test component
- Results update when definition changes

---

### [ ] Step: Phase 6 - Gallery Integration

**Goal**: Refactor gallery to use query-based data fetching

**Tasks**:
1. Update `packages/nxus-core/src/hooks/use-app-registry.ts`:
   - Build query definition from options (search, filters, tags)
   - Use `useQueryEvaluation` internally
   - Transform `AssembledNode[]` to `Item[]` for backward compat
   - Keep existing interface unchanged

2. Add query builder to gallery HUD:
   - Modify `packages/nxus-core/src/components/features/gallery/hud/floating-hud.tsx`
   - Add "Advanced Filter" button
   - Show query builder panel when clicked

3. Update `packages/nxus-core/src/routes/index.tsx`:
   - Add query builder panel state
   - Pass query to gallery views

**Verification**:
- Gallery continues to work with existing filters
- Advanced query builder opens and works
- Results update reactively

---

### [ ] Step: Phase 7 - Advanced Filters

**Goal**: Complete the filter type coverage

**Tasks**:
1. Implement remaining filter editors:
   - `RelationFilter`: relationship type + optional target node
   - `TemporalFilter`: date picker or "last N days" input
   - `LogicalFilter`: nested filter group with AND/OR/NOT

2. Implement `query-linter.tsx`:
   - Display query as plain text (like Tana's linter)
   - Format: "Nodes with #Item AND type = tool AND created in last 7 days"

3. Add sort configuration UI:
   - Field selector
   - Direction toggle

**Verification**:
- All filter types work correctly
- Complex queries with nested logic evaluate properly

---

### [ ] Step: Phase 8 - Saved Queries

**Goal**: Enable saving and managing queries

**Tasks**:
1. Create `saved-queries-panel.tsx`:
   - List saved queries
   - Click to execute
   - Edit/delete actions
   - Create new query

2. Add saved query CRUD to query builder:
   - Save button (creates query node)
   - Load button (opens saved queries panel)
   - Name input for saving

3. Ensure query nodes get proper bootstrap:
   - Add `supertag:query` to bootstrap if needed
   - Add query-related field nodes

**Verification**:
- Can create, save, load, edit, delete queries
- Saved queries persist across sessions

---

### [ ] Step: Phase 9 - Reactivity & Cache Invalidation

**Goal**: Ensure query results update when data changes

**Tasks**:
1. Identify mutation points:
   - Node creation (`createNode`)
   - Node update (`updateNodeContent`, `setProperty`)
   - Node deletion (`deleteNode`)

2. Add cache invalidation after mutations:
   - Invalidate `['query']` query keys
   - Invalidate `['gallery-query']`
   - Invalidate `['saved-query']`

3. Test reactivity:
   - Create node while viewing query results
   - Verify results update automatically

**Verification**:
- Creating/updating nodes triggers query refresh
- Results are consistent with current data

---

### [ ] Step: Phase 10 - Polish & Documentation

**Goal**: Final refinements and documentation

**Tasks**:
1. UI/UX refinements:
   - Loading states
   - Error handling
   - Empty states
   - Keyboard navigation

2. Performance optimization:
   - Debounce query evaluation
   - Optimize filter evaluation order

3. Write documentation:
   - Update ARCHITECTURE.md with query system
   - Add JSDoc comments to key functions
   - Create user guide for query builder

4. Final testing:
   - Test all filter combinations
   - Test edge cases (empty results, large datasets)
   - Cross-browser testing

**Verification**:
- All tests pass
- No console errors
- Documentation complete

---

## Completion Criteria

- [ ] Query types defined and exported from `@nxus/db`
- [ ] Query evaluation engine handles all filter types
- [ ] Server functions for query CRUD operations
- [ ] Query builder UI with Tana-like UX
- [ ] Gallery uses query-based data fetching
- [ ] Saved queries functionality
- [ ] Reactive updates when data changes
- [ ] Documentation updated

---

## Notes

**Key Design Decisions**:
1. Store queries as nodes with `supertag:query` (consistent with "everything is a node")
2. Use TanStack Query cache invalidation for reactivity (simple, effective)
3. Keep backward compatibility in `useAppRegistry` during migration
4. Progressive disclosure in UI (basic filters first, advanced on demand)

**References**:
- Technical spec: `spec.md`
- Archived docs: `/docs/archived/node-based-arch-queries.md`
- Tana search docs: https://tana.inc/docs/search-nodes
