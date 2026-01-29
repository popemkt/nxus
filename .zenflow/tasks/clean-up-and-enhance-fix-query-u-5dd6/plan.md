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
<!-- chat-id: 9a58eab9-da70-47e4-a3d6-8b6aded74cdc -->

**Difficulty Assessment**: Medium

Three main issues identified:
1. Deprecated `findNode()` calls emitting console warnings (7 locations across 2 files)
2. Inconsistent field naming: UI uses `fieldSystemId` but type schema uses `fieldId` (5 files)
3. Query workbench UX needs verification for saved query management

Full specification saved to `{@artifacts_path}/spec.md`.

---

### [x] Step: Fix deprecated findNode() calls in server functions
<!-- chat-id: 05dcc078-b801-4c09-a58d-181585d784e8 -->

Replace all deprecated `findNode()` calls with explicit `findNodeById()` or `findNodeBySystemId()`:

**Files to modify:**
- `packages/nxus-workbench/src/server/query.server.ts` (3 locations: lines 113, 160, 238)
- `packages/nxus-workbench/src/server/nodes.server.ts` (4 locations: lines 49, 153, 186, 311)

**Implementation:**
- [x] Replace `findNode(db, queryId)` with `findNodeById(db, queryId)` for query operations
- [x] For `getNodeServerFn`, use `isSystemId()` to route: systemId → `findNodeBySystemId()`, UUID → `findNodeById()`
- [x] Import `isSystemId` from `@nxus/db/server` where needed

**Verification:**
- Run tests: `pnpm -F @nxus/db test` ✅ (374 passed)
- Run tests: `pnpm -F @nxus/workbench test` ✅ (150 passed)
- TypeScript: No errors related to the function changes

---

### [x] Step: Fix fieldSystemId → fieldId inconsistency in query builder UI
<!-- chat-id: f1ab5163-6227-4523-a1a6-c4f2b46dc1fc -->

Update UI components to use `fieldId` matching the type schema:

**Files modified:**
- `packages/nxus-workbench/src/features/query-builder/filters/property-filter.tsx`
- `packages/nxus-workbench/src/features/query-builder/filters/hasfield-filter.tsx`
- `packages/nxus-workbench/src/features/query-builder/query-builder.tsx` (createDefaultFilter)
- `packages/nxus-workbench/src/features/query-builder/query-linter.tsx` (formatHasFieldFilter)
- `packages/nxus-workbench/src/features/query-builder/filters/logical-filter.tsx`

**Implementation:**
- [x] Replace all `filter.fieldSystemId` with `filter.fieldId`
- [x] Replace all `fieldSystemId` state variables with `fieldId`
- [x] Update `onUpdate({ fieldSystemId: ... })` to `onUpdate({ fieldId: ... })`
- [x] Fix `createDefaultFilter` for hasField type to use `fieldId`

**Verification:**
- Tests: `pnpm -F @nxus/workbench test` ✅ (150 passed)
- Grep confirms no remaining `fieldSystemId` references in query-builder folder

---

### [x] Step: Verify and test query workbench UX
<!-- chat-id: 7b2db1a9-f801-4272-94fd-cccd8a070f9d -->

Ensure the saved queries functionality is accessible and working:

**Verification checklist:**
- [x] `QueryBuilderWithSaved` is used where appropriate (provides saved queries access)
- [x] "Saved Queries" button is visible and clickable
- [x] Saved queries list loads correctly
- [x] Click on saved query loads it into builder
- [x] Edit mode allows updating saved queries
- [x] Delete functionality works with confirmation
- [x] Create new query flow works end-to-end

**Verification Results:**
All checklist items verified via code review:

1. **QueryBuilderWithSaved** - Correctly used in `QueryResultsView.tsx:170` as the main query view component
2. **Saved Queries button** - Rendered at top of query builder (`query-builder-with-saved.tsx:179-198`) with Folder icon
3. **Saved queries list** - `SavedQueriesPanel` uses `useSavedQueries()` hook with loading/error/empty states
4. **Load saved query** - `handleLoadSavedQuery` loads definition into builder and tracks query ID
5. **Edit mode** - Shows "Editing saved query" indicator with Update/Detach buttons when `loadedQueryId` is set
6. **Delete** - Two-click confirmation pattern with 3-second auto-reset timeout
7. **Create new** - Save dialog prompts for name, creates query via `createQuery` mutation

**Tests:** `pnpm -F @nxus/workbench test` ✅ (150 passed)
**Build:** `npx nx run-many -t build --all` ✅

---

### [ ] Step: Final verification and report

1. Run full test suite: `pnpm test`
2. Run linters: `pnpm lint`
3. Build all packages: `pnpm build`
4. Write report to `{@artifacts_path}/report.md` describing:
   - What was implemented
   - How the solution was tested
   - Any issues encountered
