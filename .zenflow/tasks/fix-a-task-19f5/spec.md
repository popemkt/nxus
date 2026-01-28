# Technical Specification: Remove Query Duplication from nxus-core

## Task Context

**Difficulty**: Medium

The query system was implemented in `@nxus/workbench` package but duplicate files were left in `@nxus/core`. The main `index.tsx` route already imports from workbench correctly, but there are leftover duplicate files in nxus-core that need to be removed, and a few internal imports need to be updated to use workbench exports.

## Technical Context

- **Language**: TypeScript/React
- **Framework**: TanStack Start, TanStack Query
- **Monorepo Structure**: pnpm workspace with packages in `packages/`
- **Key Packages**:
  - `@nxus/core` (packages/nxus-core) - Main app
  - `@nxus/workbench` (packages/nxus-workbench) - Authoritative location for query system
  - `@nxus/db` (packages/nxus-db) - Database layer

## Current State

### Already Correct
The main route file (`packages/nxus-core/src/routes/index.tsx:7`) correctly imports from workbench:
```typescript
import { QueryBuilderWithSaved, useQueryEvaluation, useQueryStore } from '@nxus/workbench'
```

### Duplicate Files to Remove (from nxus-core)

1. **Server Functions** (1 file):
   - `src/services/query/query.server.ts` - Duplicate of workbench's query.server.ts

2. **Hooks** (1 file):
   - `src/hooks/use-query.ts` - Duplicate of workbench's hooks

3. **Stores** (1 file):
   - `src/stores/query.store.ts` - Duplicate of workbench's query store

4. **Components** (17 files):
   - `src/components/features/query-builder/` - Entire directory is duplicate
     - `index.ts`
     - `add-filter-menu.tsx`
     - `filter-chip.tsx`
     - `filter-list.tsx`
     - `query-builder.tsx`
     - `query-builder-with-saved.tsx`
     - `query-linter.tsx`
     - `saved-queries-panel.tsx`
     - `sort-config.tsx`
     - `filters/index.ts`
     - `filters/content-filter.tsx`
     - `filters/hasfield-filter.tsx`
     - `filters/logical-filter.tsx`
     - `filters/property-filter.tsx`
     - `filters/relation-filter.tsx`
     - `filters/supertag-filter.tsx`
     - `filters/temporal-filter.tsx`

### Files with Imports to Update

These files in nxus-core import from the duplicate local query code and need updating:

1. **`src/components/features/debug/node-inspector.tsx:15`**
   - Current: `import { getBacklinksServerFn } from '@/services/query/query.server'`
   - Change to: `import { getBacklinksServerFn } from '@nxus/workbench/server'`

2. **`src/components/features/query-builder/filters/supertag-filter.tsx:20`** (will be deleted, but verify no other references)
   - Current: `import { getSupertagsServerFn } from '@/services/query/query.server'`

3. **`src/components/features/query-builder/saved-queries-panel.tsx:26`** (will be deleted)
   - Current: `from '@/hooks/use-query'`

4. **`src/components/features/query-builder/query-builder-with-saved.tsx:32-33`** (will be deleted)
   - Current: `import { useCreateQuery, useUpdateQuery } from '@/hooks/use-query'`

5. **`src/hooks/use-query.ts:25`** (will be deleted)
   - Current: `from '@/services/query/query.server'`

## Implementation Approach

### Phase 1: Update Import in node-inspector.tsx
Before deleting anything, update the one file that will remain but currently imports from the duplicate code:

- Update `src/components/features/debug/node-inspector.tsx` to import `getBacklinksServerFn` from `@nxus/workbench/server` instead of `@/services/query/query.server`

### Phase 2: Delete Duplicate Files
Remove all duplicate query-related files:

1. Delete entire directory: `src/components/features/query-builder/`
2. Delete: `src/services/query/query.server.ts`
3. Delete: `src/hooks/use-query.ts`
4. Delete: `src/stores/query.store.ts`
5. If `src/services/query/` directory is now empty, delete it

### Phase 3: Verify No Broken Imports
Run TypeScript compilation to ensure no broken imports remain.

## Verification Steps

1. Run `pnpm tsc --noEmit` in the nxus-core package to verify no type errors
2. Run `pnpm lint` to check for any lint issues
3. Run `pnpm build` to verify the application builds correctly
4. The expected SQLite error in the browser console is acceptable per task description (to be fixed in a future task)

## Files Modified

| File | Action |
|------|--------|
| `src/components/features/debug/node-inspector.tsx` | Update import |
| `src/services/query/query.server.ts` | Delete |
| `src/hooks/use-query.ts` | Delete |
| `src/stores/query.store.ts` | Delete |
| `src/components/features/query-builder/` (17 files) | Delete entire directory |

## Risk Assessment

**Low Risk**:
- The main route already uses workbench imports correctly
- Workbench exports all necessary functions
- Only cleanup of unused duplicate code

**Potential Issue**:
- The SQLite/better-sqlite3 error mentioned in the task will still occur after this migration. This is expected and will be addressed in a separate task involving server function architecture.

## Notes

- The workbench package exports `getBacklinksServerFn` from `@nxus/workbench/server`
- The workbench package exports `getSupertagsServerFn` from `@nxus/workbench/server`
- All query hooks, stores, and components are properly exported from `@nxus/workbench`
