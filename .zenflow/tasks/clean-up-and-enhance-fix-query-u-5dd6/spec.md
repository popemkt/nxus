# Technical Specification: Clean up and enhance/fix query UX

## Task Difficulty: Medium

This task involves:
- Cleaning up deprecated function calls that emit console warnings
- Removing unnecessary regex-based UUID detection where type safety is sufficient
- Fixing inconsistent field naming (`fieldSystemId` vs `fieldId`) in UI components
- Ensuring the query workbench UX allows listing and editing saved queries

## Technical Context

### Technology Stack
- **Language**: TypeScript 5.9
- **Build**: Nx 22.3.3, Vite
- **Database**: better-sqlite3 with Drizzle ORM
- **Frontend**: React with TanStack React Query
- **UI Framework**: Phosphor Icons, custom UI components

### Relevant Packages
- `packages/nxus-db` - Database layer with query evaluation engine
- `packages/nxus-workbench` - Frontend app with query builder UI

---

## Issues to Address

### Issue 1: Deprecated `findNode()` calls emitting warnings

**Problem**: The `findNode()` function is deprecated and logs warnings like:
```
[DEPRECATED] findNode() called with '019bf028-6d38-7fda-8de2-9948ff67f44e'. Use findNodeById() or findNodeBySystemId() instead.
```

**Root Cause**: Multiple server functions still use `findNode()` instead of the explicit `findNodeById()` or `findNodeBySystemId()`.

**Files to Modify**:

1. `packages/nxus-workbench/src/server/query.server.ts`
   - Line 113: `updateQueryServerFn` uses `findNode(db, queryId)` - should use `findNodeById()`
   - Line 160: `deleteQueryServerFn` uses `findNode(db, queryId)` - should use `findNodeById()`
   - Line 238: `executeSavedQueryServerFn` uses `findNode(db, queryId)` - should use `findNodeById()`

2. `packages/nxus-workbench/src/server/nodes.server.ts`
   - Line 49: `getNodeServerFn` uses `findNode(db, identifier)` - needs to use `isSystemId()` to route appropriately
   - Line 153: `deleteNodeServerFn` uses `findNode(db, nodeId)` - should use `findNodeById()`
   - Line 186: `setNodePropertiesServerFn` uses `findNode(db, nodeId)` - should use `findNodeById()`
   - Line 311: `getItemByIdFromNodesServerFn` uses `findNode(db, ...)` - should use `findNodeBySystemId()`

---

### Issue 2: Regex-based UUID detection could be simplified

**Problem**: The `UUID_REGEX` in `query-evaluator.service.ts:23` is used for detecting node references. While this works, the user raised concern about regex performance.

**Analysis**: The regex is only used in one place (`evaluateLinksToRelation`) to detect if a property value looks like a UUID when no `targetNodeId` is specified. This is a valid use case - we need heuristics here since we can't know at compile time what values are stored in properties.

**Recommendation**: Keep the regex as-is for now. It's a standard UUID pattern and runs only when needed. The performance concern is minor compared to database queries. Alternative approaches (like checking UUID byte length) would be less accurate.

---

### Issue 3: Inconsistent field naming in UI components

**Problem**: The query filter type schema uses `fieldId` but some UI components use `fieldSystemId`:

- **Type Schema** (`packages/nxus-db/src/types/query.ts`):
  - `PropertyFilterSchema` uses `fieldId` (line 64)
  - `HasFieldFilterSchema` uses `fieldId` (line 125)

- **UI Components using wrong name**:
  - `property-filter.tsx`: Uses `filter.fieldSystemId` (lines 82, 94, 103, 128, 130)
  - `hasfield-filter.tsx`: Uses `filter.fieldSystemId` (lines 65, 70, 78, 89, 91)
  - `query-builder.tsx`: Creates `hasField` with `fieldSystemId` (line 302)
  - `query-linter.tsx`: Accesses `filter.fieldSystemId` for hasField (line 211)
  - `logical-filter.tsx`: Accesses `filter.fieldSystemId` for hasField (lines 393-394)

**Resolution**: Update all UI components to use `fieldId` consistently to match the type schema. The schema is correct; the UI components need fixing.

---

### Issue 4: Query Workbench UX - Saved Queries Management

**Current State**: The saved queries functionality exists and is comprehensive:
- `SavedQueriesPanel` component shows saved queries list
- `QueryBuilderWithSaved` wraps query builder with save/load functionality
- Server functions exist: `getSavedQueriesServerFn`, `createQueryServerFn`, `updateQueryServerFn`, `deleteQueryServerFn`

**UX Issue**: The user can't easily find and edit older queries. Need to verify the integration is properly exposed in the workbench UI.

**Files to Check/Enhance**:
- Ensure `QueryBuilderWithSaved` is used instead of plain `QueryBuilder` where appropriate
- Verify `SavedQueriesPanel` is accessible from the main workbench interface
- Consider adding a dedicated "Queries" section in the sidebar if not present

---

## Implementation Approach

### Phase 1: Fix deprecated `findNode()` calls

Replace all deprecated `findNode()` calls with explicit alternatives:

```typescript
// For query IDs (always UUIDs)
const existingNode = findNodeById(db, queryId)

// For identifiers that could be UUID or systemId
import { isSystemId } from '@nxus/db/server'
const node = isSystemId(identifier)
  ? findNodeBySystemId(db, identifier)
  : findNodeById(db, identifier)
```

### Phase 2: Fix `fieldSystemId` → `fieldId` inconsistency

Update the following files to use `fieldId` instead of `fieldSystemId`:

1. `property-filter.tsx` - Replace all `fieldSystemId` references with `fieldId`
2. `hasfield-filter.tsx` - Replace all `fieldSystemId` references with `fieldId`
3. `query-builder.tsx` - Fix `createDefaultFilter` for `hasField` type
4. `query-linter.tsx` - Fix `formatHasFieldFilter` function
5. `logical-filter.tsx` - Fix hasField display logic

### Phase 3: Query Workbench UX Verification

1. Check if `QueryBuilderWithSaved` is properly integrated in the main workbench
2. Ensure users can access saved queries list
3. Verify edit/load functionality works correctly

---

## Files to Create or Modify

### Modified Files

| File | Changes |
|------|---------|
| `packages/nxus-workbench/src/server/query.server.ts` | Replace `findNode()` with `findNodeById()` (3 locations) |
| `packages/nxus-workbench/src/server/nodes.server.ts` | Replace `findNode()` with appropriate alternatives (4 locations) |
| `packages/nxus-workbench/src/features/query-builder/filters/property-filter.tsx` | Replace `fieldSystemId` with `fieldId` |
| `packages/nxus-workbench/src/features/query-builder/filters/hasfield-filter.tsx` | Replace `fieldSystemId` with `fieldId` |
| `packages/nxus-workbench/src/features/query-builder/query-builder.tsx` | Fix `createDefaultFilter` for hasField |
| `packages/nxus-workbench/src/features/query-builder/query-linter.tsx` | Fix `formatHasFieldFilter` to use `fieldId` |
| `packages/nxus-workbench/src/features/query-builder/filters/logical-filter.tsx` | Fix hasField display to use `fieldId` |

---

## Verification Approach

### Unit Tests
```bash
# Run existing tests to ensure no regression
pnpm -F @nxus/db test
```

### Manual Testing
1. Build the workbench: `pnpm -F @nxus/workbench build`
2. Start the workbench and verify:
   - No console warnings about deprecated `findNode()` calls
   - Query builder property filters work correctly
   - HasField filters work correctly
   - Saved queries can be listed, loaded, and edited

### Linting
```bash
pnpm -F @nxus/workbench lint
pnpm -F @nxus/db lint
```

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Breaking existing saved queries | Medium | Query definitions stored in DB use correct schema; UI was just displaying wrong |
| Regression in node lookups | Low | Using explicit functions is more reliable than the ambiguous `findNode()` |
| Type errors from field renaming | Low | TypeScript will catch any mismatches immediately |

---

## Out of Scope

1. **Regex optimization**: The UUID regex is used appropriately and performance is not a real concern
2. **Complete OR-style pattern removal**: The `isSystemId()` function is already properly implemented using prefix checking, not regex
3. **New features**: This task focuses on cleanup and bug fixes, not new functionality
