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

### [ ] Step: Fix deprecated findNode() calls in server functions

Replace all deprecated `findNode()` calls with explicit `findNodeById()` or `findNodeBySystemId()`:

**Files to modify:**
- `packages/nxus-workbench/src/server/query.server.ts` (3 locations: lines 113, 160, 238)
- `packages/nxus-workbench/src/server/nodes.server.ts` (4 locations: lines 49, 153, 186, 311)

**Implementation:**
- [ ] Replace `findNode(db, queryId)` with `findNodeById(db, queryId)` for query operations
- [ ] For `getNodeServerFn`, use `isSystemId()` to route: systemId → `findNodeBySystemId()`, UUID → `findNodeById()`
- [ ] Import `isSystemId` from `@nxus/db/server` where needed

**Verification:**
- Run tests: `pnpm -F @nxus/db test`
- Build: `pnpm -F @nxus/workbench build`
- Manual check: Confirm no deprecation warnings in console

---

### [ ] Step: Fix fieldSystemId → fieldId inconsistency in query builder UI

Update UI components to use `fieldId` matching the type schema:

**Files to modify:**
- `packages/nxus-workbench/src/features/query-builder/filters/property-filter.tsx`
- `packages/nxus-workbench/src/features/query-builder/filters/hasfield-filter.tsx`
- `packages/nxus-workbench/src/features/query-builder/query-builder.tsx` (createDefaultFilter)
- `packages/nxus-workbench/src/features/query-builder/query-linter.tsx` (formatHasFieldFilter)
- `packages/nxus-workbench/src/features/query-builder/filters/logical-filter.tsx`

**Implementation:**
- [ ] Replace all `filter.fieldSystemId` with `filter.fieldId`
- [ ] Replace all `fieldSystemId` state variables with `fieldId`
- [ ] Update `onUpdate({ fieldSystemId: ... })` to `onUpdate({ fieldId: ... })`
- [ ] Fix `createDefaultFilter` for hasField type to use `fieldId`

**Verification:**
- Lint: `pnpm -F @nxus/workbench lint`
- TypeScript: `pnpm -F @nxus/workbench typecheck` (or build)
- Manual: Test property filters and hasField filters in query builder

---

### [ ] Step: Verify and test query workbench UX

Ensure the saved queries functionality is accessible and working:

**Verification checklist:**
- [ ] `QueryBuilderWithSaved` is used where appropriate (provides saved queries access)
- [ ] "Saved Queries" button is visible and clickable
- [ ] Saved queries list loads correctly
- [ ] Click on saved query loads it into builder
- [ ] Edit mode allows updating saved queries
- [ ] Delete functionality works with confirmation
- [ ] Create new query flow works end-to-end

**If issues found:**
- Document in report.md
- Fix integration issues as needed

---

### [ ] Step: Final verification and report

1. Run full test suite: `pnpm test`
2. Run linters: `pnpm lint`
3. Build all packages: `pnpm build`
4. Write report to `{@artifacts_path}/report.md` describing:
   - What was implemented
   - How the solution was tested
   - Any issues encountered
