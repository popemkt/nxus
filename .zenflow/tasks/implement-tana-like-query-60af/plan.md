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

### [x] Step: Phase 3 - Query Server Functions
<!-- chat-id: f60be5b0-c875-47b2-8cac-a7b30836cfaa -->

**Goal**: Create server API for query operations

**Completed**:
1. Created `packages/nxus-workbench/src/server/query.server.ts` with:
   - `evaluateQueryServerFn` - evaluate query definition, return AssembledNode[] with totalCount and evaluatedAt
   - `createQueryServerFn` - create saved query node with supertag:query
   - `updateQueryServerFn` - update saved query name and/or definition
   - `deleteQueryServerFn` - soft-delete saved query
   - `getSavedQueriesServerFn` - list all saved queries with definitions
   - `executeSavedQueryServerFn` - run saved query by ID with optional result caching

2. All server functions use:
   - TanStack `createServerFn` with proper method types (GET/POST)
   - Zod schema validation via `.inputValidator()` using schemas from `@nxus/db`:
     - `EvaluateQueryInputSchema`
     - `CreateQueryInputSchema`
     - `UpdateQueryInputSchema`
   - Database initialization with bootstrap for system nodes

3. Exported all functions from `packages/nxus-workbench/src/server/index.ts`

4. Helper function `nodeToSavedQuery()` converts AssembledNode to SavedQueryResponse

**Verification**:
- TypeScript compiles without errors (no query.server.ts errors in tsc output)
- All 54 @nxus/db tests pass: `pnpm --filter @nxus/db test`
- Server functions ready for client consumption

---

### [x] Step: Phase 4 - Query Builder UI (Basic)
<!-- chat-id: 9ae68e92-8bf5-44c9-a65f-004ec588841e -->

**Goal**: Create visual query builder component

**Completed**:
1. Created component structure:
   ```
   packages/nxus-core/src/components/features/query-builder/
   ├── index.ts                 # Exports all components
   ├── query-builder.tsx        # Main container with filter management
   ├── filter-list.tsx          # Renders filter chips
   ├── filter-chip.tsx          # Individual filter display with inline editing
   ├── add-filter-menu.tsx      # Dropdown menu for adding filters
   └── filters/
       ├── index.ts
       ├── supertag-filter.tsx  # Supertag selection with inheritance toggle
       ├── property-filter.tsx  # Field + operator + value selector
       └── content-filter.tsx   # Full-text search with case sensitivity
   ```

2. Implemented `QueryBuilder` component:
   - Props: `value`, `onChange`, `onExecute`, `onSave`, `onClose`, `compact`, `showExecute`, `showSave`, `resultCount`, `isLoading`
   - Filter management: add/update/remove/clear all
   - Action buttons: Execute, Save (optional), Clear all

3. Implemented basic filter editors:
   - `SupertagFilterEditor`: Fetches supertags via server function, includes inheritance toggle
   - `PropertyFilterEditor`: Field selector with 11 SYSTEM_FIELDS, 11 operators (eq, neq, gt, gte, lt, lte, contains, startsWith, endsWith, isEmpty, isNotEmpty)
   - `ContentFilterEditor`: Text search with case-sensitivity option

4. Created Zustand store `packages/nxus-core/src/stores/query.store.ts`:
   - `currentQuery`: QueryDefinition being built
   - `isBuilderOpen`, `editingFilterId`, `isAddMenuOpen`: UI state
   - Actions: `setCurrentQuery`, `resetQuery`, `addFilter`, `updateFilter`, `removeFilter`, `setSort`, `setLimit`

**Verification**:
- All 54 @nxus/db tests pass
- Components compile without TypeScript errors (excluding pre-existing TS6305 error for workbench build artifacts)
- Filter chip UI shows filter type icon, formatted label, and remove button
- Clicking filter chip opens inline editor popup
- Add filter dropdown categorizes filters into Basic (supertag, property, content) and Advanced (temporal, relation, hasField)

---

### [x] Step: Phase 5 - Query Execution Hook
<!-- chat-id: 0a74d471-5ce2-4a14-9177-c3ce0190a9c9 -->

**Goal**: Create React hooks for query execution

**Completed**:
1. Created `packages/nxus-core/src/hooks/use-query.ts` with:
   - `useQueryEvaluation(definition, options?)` - evaluate ad-hoc query with TanStack Query
   - `useSavedQuery(queryId, options?)` - execute saved query by ID
   - `useSavedQueries(options?)` - list all saved queries
   - `useCreateQuery()` - mutation hook for creating saved queries
   - `useUpdateQuery()` - mutation hook for updating saved queries
   - `useDeleteQuery()` - mutation hook for deleting saved queries
   - `useQueryInvalidation()` - cache invalidation utility hooks

2. Implemented with TanStack Query patterns:
   - Query keys factory (`queryKeys`) for consistent cache management
   - Definition hash-based cache keys for ad-hoc queries
   - Configurable stale time (30s for evaluations, 60s for saved queries list)
   - Automatic cache invalidation on mutations

3. Type-safe interfaces:
   - `QueryEvaluationResult` - nodes, totalCount, evaluatedAt, loading/error states
   - `SavedQueriesResult` - queries list with loading/error states
   - `SavedQueryResult` - query details, nodes, and execution state

4. Hooks follow existing patterns in the codebase (use-app-registry, use-tool-health)

**Verification**:
- All 54 @nxus/db tests pass: `pnpm --filter @nxus/db test`
- TypeScript compiles (only pre-existing TS6305 errors for workbench build artifacts)
- Hooks ready for use with `@/hooks/use-query` import pattern

---

### [x] Step: Phase 6 - Gallery Integration
<!-- chat-id: 23729240-14bb-433e-985f-540adf467b80 -->

**Goal**: Integrate query builder UI with the gallery

**Completed**:
1. Added "Advanced Filter" button to FloatingHud (`floating-hud.tsx`):
   - New `FunnelIcon` import from Phosphor
   - New props: `queryBuilderOpen`, `onQueryBuilderToggle`
   - Button toggles query builder panel visibility
   - Positioned next to the Tags toggle button

2. Updated gallery route (`routes/index.tsx`):
   - Added `queryBuilderOpen` state and toggle handler
   - Integrated `useQueryStore` for query builder state management
   - Connected `useQueryEvaluation` hook to evaluate queries in real-time
   - Query evaluation only runs when panel is open AND has filters (performance optimization)

3. Created floating Query Builder panel:
   - Positioned on right side (mirror of Tags panel on left)
   - Uses same visual styling as Tags panel (glass morphism, border, shadow)
   - Slide-in animation with opacity transition
   - Shows query builder component with result count
   - Displays results preview (first 10 nodes with supertag chips)
   - Shows "+N more results" when total exceeds 10

4. Unified backdrop handling:
   - Single backdrop covers both panels when either is open
   - Clicking backdrop closes both panels

**Design Decision**:
The gallery continues to use `useAppRegistry` for the main display (fetching `Item[]` from legacy SQLite).
The query builder provides a parallel querying capability against the node-based architecture (`AssembledNode[]`).
Full migration to query-based data fetching will happen in a future phase when the node-based architecture
is ready to replace the legacy approach.

**Verification**:
- All 54 @nxus/db tests pass
- TypeScript compiles (only pre-existing TS6305 errors for workbench build artifacts)
- Gallery continues to work with existing tag/search filters
- Advanced query builder opens and shows real-time results

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
