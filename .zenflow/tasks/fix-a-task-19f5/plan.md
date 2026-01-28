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
<!-- chat-id: fd6ec081-c138-47a7-ad6c-aca59e62d4d9 -->

**Difficulty**: Medium

Investigated the query system duplication between nxus-core and nxus-workbench. The main route already correctly imports from workbench, but duplicate files remain in nxus-core.

**Findings**:
- 20 duplicate files to delete from nxus-core
- 1 file needs import update before deletion (node-inspector.tsx)
- All required exports available from @nxus/workbench and @nxus/workbench/server

See `spec.md` for full technical specification.

---

### [x] Step: Update Import in node-inspector.tsx
<!-- chat-id: 0779dba7-214b-4614-a663-f3c07a747b8d -->

Update the node-inspector.tsx file to import `getBacklinksServerFn` from `@nxus/workbench/server` instead of the local duplicate.

**File**: `packages/nxus-core/src/components/features/debug/node-inspector.tsx`

Change:
```typescript
import { getBacklinksServerFn } from '@/services/query/query.server'
```
To:
```typescript
import { getBacklinksServerFn } from '@nxus/workbench/server'
```

---

### [x] Step: Delete Duplicate Query Files
<!-- chat-id: 34871f64-4605-4bd6-b939-39ca1ac90402 -->

Remove all duplicate query-related files from nxus-core:

1. Delete entire directory: `src/components/features/query-builder/` (17 files)
2. Delete: `src/services/query/query.server.ts`
3. Delete: `src/hooks/use-query.ts`
4. Delete: `src/stores/query.store.ts`
5. Clean up empty `src/services/query/` directory if applicable

**Completed**: All 20 files deleted successfully, including the empty `src/services/query/` directory.

---

### [x] Step: Verify Build and Types
<!-- chat-id: dcf3cd3f-b414-4260-a565-e51ea27765a5 -->

Run verification commands to ensure no broken imports:

1. Run `pnpm tsc --noEmit` in nxus-core package
2. Run `pnpm lint` to check for lint issues
3. Run `pnpm build` to verify the application builds
4. Write report to `{@artifacts_path}/report.md`

Note: SQLite error in browser is expected per task description (separate issue)

**Completed**:
- TypeScript check shows only pre-existing errors (TS6305 missing dist files, TS7006 implicit any)
- ESLint not available (pre-existing config issue)
- Build fails due to pre-existing @nxus/db Node.js imports in browser code
- Dev server starts successfully ✅
- No broken imports to deleted query files
- Report written to `report.md`

### [x] Step: Fix the bug
<!-- chat-id: 18aae797-3b99-41c8-919a-da86aa628c58 -->

I think we can focus on the bug now, at least make the index loadable. Not sure why we removed those and the index is still not fixed. Once you make the index loadable, and the error contained within /nodes only, you can stop

**Completed**:

The root cause was that `@nxus/workbench/src/server/*.server.ts` files were importing from `@nxus/db/server` at the **module level** (static imports). This caused Vite to bundle `better-sqlite3` into the client bundle, which fails because better-sqlite3 is a Node.js native module.

**Fix Applied**:

Changed all static imports from `@nxus/db/server` to dynamic imports inside handler functions:

1. **nodes.server.ts** - Converted 6 server functions to use dynamic imports
2. **graph.server.ts** - Converted 3 server functions to use dynamic imports
3. **search-nodes.server.ts** - Converted 6 server functions to use dynamic imports
4. **adapters.ts** - Copied `getProperty`/`getPropertyValues` helper functions locally to avoid importing from `@nxus/db/server`

The pattern change:
```typescript
// BEFORE (causes bundling issue):
import { initDatabase, getDatabase } from '@nxus/db/server'

export const myServerFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    initDatabase()
    const db = getDatabase()
    // ...
  })

// AFTER (dynamic import inside handler):
export const myServerFn = createServerFn({ method: 'GET' })
  .handler(async () => {
    const { initDatabase, getDatabase } = await import('@nxus/db/server')
    initDatabase()
    const db = getDatabase()
    // ...
  })
```

**Verification**:
- Index page (`/`) loads correctly with no console errors ✅
- `/nodes` page loads correctly with all supertags and 200 nodes displayed ✅
- No `better-sqlite3` bundling errors in browser ✅
