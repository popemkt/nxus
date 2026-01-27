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

### [x] Step: Phase 7 - Advanced Filters
<!-- chat-id: 755ca16b-aad8-44b8-bedd-551138903924 -->

**Goal**: Complete the filter type coverage

**Completed**:
1. Implemented all remaining filter editors in `packages/nxus-core/src/components/features/query-builder/filters/`:
   - `relation-filter.tsx`: Relationship type selector (childOf, ownedBy, linksTo, linkedFrom) with optional target node ID
   - `temporal-filter.tsx`: Date field (createdAt/updatedAt), operators (within/before/after), days presets (1, 7, 14, 30, 90, 365), or date picker
   - `hasfield-filter.tsx`: Field existence check with negate option
   - `logical-filter.tsx`: Nested filter groups with AND/OR/NOT operators, supports adding any filter type as nested children

2. Implemented `query-linter.tsx`:
   - Displays query as human-readable plain text
   - Format examples:
     - "Nodes with #Item+ AND where Status = installed"
     - "Nodes containing 'Claude' created in last 7 days"
     - "Nodes (with #Tool OR child of any) sorted by created ↓"
   - Shows sort direction indicator (↑/↓)
   - Shows limit if non-default

3. Added `sort-config.tsx`:
   - Sort field selector (Name, Created, Updated, Type, Status, Category, Title)
   - Direction toggle button (asc/desc)
   - Clear button to remove sort

4. Updated `filter-chip.tsx`:
   - Added imports for all new filter editors
   - Added conditional rendering for each filter type in FilterEditor
   - Updated logical filter icon to use TreeStructure

5. Updated `add-filter-menu.tsx`:
   - Added TreeStructure icon import
   - Extended FilterType to include 'and' | 'or' | 'not'
   - Added "Logical Groups" section with AND/OR/NOT options

6. Updated `query-builder.tsx`:
   - Added SortConfig and QueryLinter imports
   - Added showSort and showLinter props
   - Integrated SortConfig in filter row
   - Integrated QueryLinter below filters when hasFilters
   - Extended createDefaultFilter to handle logical filter types

7. Updated exports:
   - `filters/index.ts`: Exports all 7 filter editors
   - `query-builder/index.ts`: Exports SortConfig, QueryLinter, and all filter editors

**Verification**:
- All 54 @nxus/db tests pass
- TypeScript compiles (only pre-existing TS6305 errors for workbench build artifacts)
- All filter types have complete editors
- Complex queries with nested logical groups supported

---

### [x] Step: Phase 8 - Saved Queries
<!-- chat-id: d048ce98-0760-4734-95fe-55a82df4b1b9 -->

**Goal**: Enable saving and managing queries

**Completed**:
1. Created `saved-queries-panel.tsx`:
   - Lists all saved queries with search filter
   - Execute button to run and load query results
   - Edit button to load query into query builder
   - Delete with confirmation (click twice to confirm)
   - Create new button to start fresh query
   - Shows filter count, sort status, and last run time for each query
   - Filter preview chips (shows first 3 filters)

2. Created `query-builder-with-saved.tsx`:
   - Wraps QueryBuilder with full saved queries integration
   - "Saved Queries" button to toggle saved queries panel view
   - Save button with name dialog for new queries
   - Update button when editing existing saved query
   - Detach button to disconnect from saved query
   - Tracks `loadedQueryId` state for update mode

3. Updated gallery route (`routes/index.tsx`):
   - Integrated `QueryBuilderWithSaved` component
   - Added `loadedQueryId` state management
   - Connected `onQueryIdChange` handler

4. Updated bootstrap (`packages/nxus-db/src/services/bootstrap.ts`):
   - Added `#Query` supertag (`SYSTEM_SUPERTAGS.QUERY`)
   - Added query-specific fields:
     - `queryDefinition` (json)
     - `querySort` (json)
     - `queryLimit` (number)
     - `queryResultCache` (json)
     - `queryEvaluatedAt` (text)

5. Exported new components from `query-builder/index.ts`:
   - `QueryBuilderWithSaved`
   - `SavedQueriesPanel`

**Verification**:
- All 54 @nxus/db tests pass
- TypeScript compiles (only pre-existing TS6305 errors for workbench build artifacts)
- Can create, save, load, edit, delete queries
- Saved queries persist across sessions via node-based storage

---

### [x] Step: Phase 9 - Reactivity & Cache Invalidation
<!-- chat-id: 3643ab2d-6261-4225-9772-880fc6e7fa71 -->

**Goal**: Ensure query results update when data changes

**Completed**:
1. Identified mutation points in the codebase:
   - `updateNodeContentServerFn` in `nodes.server.ts` - updates node content
   - `createQueryServerFn`, `updateQueryServerFn`, `deleteQueryServerFn` in `query.server.ts` - query CRUD
   - `createItemInGraphServerFn`, `updateItemInGraphServerFn` in `graph.server.ts` - item mutations via SurrealDB

2. Added new server functions for node mutations (`nodes.server.ts`):
   - `createNodeServerFn` - create a new node with optional supertag, owner, and properties
   - `deleteNodeServerFn` - soft delete a node
   - `setNodePropertiesServerFn` - set one or more properties on a node

3. Created node mutation hooks with automatic cache invalidation (`use-query.ts`):
   - `useCreateNode()` - creates nodes, invalidates query evaluations and saved query executions
   - `useUpdateNodeContent()` - updates node content, invalidates query caches
   - `useDeleteNode()` - deletes nodes, invalidates query caches
   - `useSetNodeProperties()` - updates node properties, invalidates query caches

4. Cache invalidation strategy:
   - All node mutation hooks invalidate query keys matching `['query', 'evaluation', *]` and `['query', 'saved', *]`
   - Uses TanStack Query's `invalidateQueries` with predicate function for flexible cache targeting
   - Query evaluations automatically refetch when cache is invalidated
   - `useQueryEvaluation` hook in gallery already benefits from this (auto-refreshes on node changes)

5. Exported new server functions from `packages/nxus-workbench/src/server/index.ts`:
   - `createNodeServerFn`
   - `deleteNodeServerFn`
   - `setNodePropertiesServerFn`

**Verification**:
- All 54 @nxus/db tests pass: `pnpm --filter @nxus/db test`
- TypeScript compiles (only pre-existing TS6305 errors for workbench build artifacts)
- Creating/updating nodes via the new hooks triggers query refresh
- Results are consistent with current data through TanStack Query cache invalidation

---

### [x] Step: Phase 10 - Polish & Documentation
<!-- chat-id: b231e3f7-8640-42d9-9c8a-27b5eeccdfb0 -->

**Goal**: Final refinements and documentation

**Completed**:
1. UI/UX refinements:
   - Added loading spinner with animated icon and "Evaluating query..." text
   - Added error state display with warning icon and error message
   - Improved empty state messaging ("Ready to execute" with funnel icon)
   - Added Escape key support to close filter editor popups
   - Made remove buttons keyboard accessible with tabIndex, focus ring, and aria-label
   - Added focus-within visibility for saved query action buttons

2. Performance optimization:
   - Added `debounceMs` option to `useQueryEvaluation` hook (default: 0)
   - Gallery now uses 300ms debounce to prevent excessive evaluations while typing
   - Debounce state shows as "loading" to indicate pending evaluation

3. Documentation:
   - Updated `packages/nxus-core/ARCHITECTURE.md` with Query System section:
     - Overview of architecture across packages
     - Query definition schema explanation
     - Filter types table with examples
     - Hooks usage examples
     - Reactivity explanation
     - Integration guide
   - Existing JSDoc comments in `@nxus/db` types are comprehensive

4. Final testing:
   - All 54 @nxus/db tests pass
   - TypeScript compiles without query-related errors
   - Only pre-existing TS6305 errors for workbench build artifacts

**Verification**:
- `pnpm --filter @nxus/db test` - 54 tests pass
- TypeScript compiles without errors in query system files
- ARCHITECTURE.md updated with query system documentation

---


### [x] Step: Fix up
<!-- chat-id: e5246762-c188-403d-97b0-1d51cb868e9e -->

**Problem**: `better-sqlite3` was being bundled into the client-side code, causing "promisify is not a function" error.

**Root Cause**: When importing server functions from `@nxus/workbench/server` at module top-level, Vite's bundler would follow the import chain: `@nxus/workbench/server` → `@nxus/db/server` → `better-sqlite3`. Even though the functions were created with TanStack Start's `createServerFn`, the bundler doesn't know to skip external package imports.

**Solution**:
1. Created separate types file `packages/nxus-db/src/types/node.ts` for client-safe types (AssembledNode, PropertyValue, CreateNodeOptions, SavedQuery)
2. Updated `@nxus/db/src/index.ts` to export types from the new types file instead of from node.service.ts
3. Created local server function wrappers in `packages/nxus-core/src/services/query/query.server.ts`:
   - Each wrapper uses `createServerFn` locally
   - Uses **dynamic imports** inside the handler functions to import from `@nxus/workbench/server`
   - Dynamic imports prevent the bundler from following the import chain at build time
4. Updated client files to import from the local `@/services/query/query.server` instead of directly from `@nxus/workbench/server`:
   - `packages/nxus-core/src/hooks/use-query.ts`
   - `packages/nxus-core/src/components/features/query-builder/filters/supertag-filter.tsx`
   - `packages/nxus-core/src/components/features/debug/node-inspector.tsx`
5. Updated `vite.config.ts` to exclude Node.js-only packages from optimization:
   - Added `better-sqlite3`, `drizzle-orm/better-sqlite3`, `@nxus/db`, `@nxus/workbench` to `optimizeDeps.exclude`
   - Added `ssr.noExternal` for `@nxus/db` and `@nxus/workbench`

**Verification**:
- All 54 @nxus/db tests pass
- Application loads without errors at http://localhost:3000
- Query builder UI works correctly

The above error occurred in the <Lazy> component.

React will try to recreate this component tree from scratch using the error boundary you provided, CatchBoundaryImpl.

### [x] Step: Moving the thing
<!-- chat-id: 94fce90d-a7a6-428d-bbc5-21e5b7b67cdc -->

**Goal**: Move query builder to `@nxus/workbench` as a third sidebar view alongside List and Graph views, serving as foundation for future mini-apps and Tana editor feature.

**Completed**:
1. Added 'query' view mode to workbench sidebar (`Sidebar.tsx`):
   - Extended `ViewMode` type to `'list' | 'graph' | 'query'`
   - Added `Funnel` icon for Query Builder view
   - Updated component docs

2. Created `QueryResultsView` component (`components/query-results/`):
   - Full-height panel with QueryBuilderWithSaved at top
   - Results list grouped by supertag (similar to NodeBrowser)
   - Keyboard navigation support (↑↓ to navigate, Enter to select)
   - Integration with `useQueryStore` and `useQueryEvaluation` hooks
   - Stats bar showing result count and filter count

3. Integrated into workbench route (`route.tsx`):
   - Added `QueryResultsView` import and rendering for query view mode
   - Updated help text in inspector empty state for query view

4. Created workbench-local server functions (`server/query.server.ts`):
   - Moved all query server functions with dynamic imports to avoid better-sqlite3 bundling
   - Added node mutation server functions for reactivity

5. Created workbench-local hooks (`hooks/use-query.ts`):
   - Complete query hooks (useQueryEvaluation, useSavedQueries, etc.)
   - Node mutation hooks with cache invalidation

6. Created workbench-local Zustand store (`stores/query.store.ts`):
   - Query UI state management

7. Moved query builder components to `features/query-builder/`:
   - Main components: QueryBuilder, QueryBuilderWithSaved, SavedQueriesPanel
   - All filter editors (7 types)
   - Supporting components: FilterList, FilterChip, AddFilterMenu, SortConfig, QueryLinter

8. Updated exports:
   - `src/index.ts` - exports all query builder components, hooks, and store
   - `src/components/index.ts` - exports QueryResultsView
   - `src/features/query-builder/index.ts` - exports all query builder components

9. Updated gallery (`packages/nxus-core/src/routes/index.tsx`):
   - Changed imports to use `@nxus/workbench` for QueryBuilderWithSaved, useQueryEvaluation, and useQueryStore

**Architecture**:
- Query builder is now fully self-contained in `@nxus/workbench`
- Workbench provides three views: List (NodeBrowser), Graph (GraphView), Query (QueryResultsView)
- Query view serves as foundation for:
  - Future mini-apps that need query-based data access
  - Tana editor feature (query results can be edited inline)
- Gallery can still use the query builder via floating panel (imports from workbench)

**Verification**:
- Dev server starts without errors
- Pre-existing TypeScript errors unrelated to changes
- Query view accessible via Funnel icon in workbench sidebar
## Completion Criteria

- [x] Query types defined and exported from `@nxus/db`
- [x] Query evaluation engine handles all filter types
- [x] Server functions for query CRUD operations
- [x] Query builder UI with Tana-like UX
- [x] Gallery uses query-based data fetching (via Advanced Filter panel)
- [x] Saved queries functionality
- [x] Reactive updates when data changes
- [x] Documentation updated

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
o
