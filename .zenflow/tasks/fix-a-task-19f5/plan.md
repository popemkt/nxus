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

### [ ] Step: Verify Build and Types

Run verification commands to ensure no broken imports:

1. Run `pnpm tsc --noEmit` in nxus-core package
2. Run `pnpm lint` to check for lint issues
3. Run `pnpm build` to verify the application builds
4. Write report to `{@artifacts_path}/report.md`

Note: SQLite error in browser is expected per task description (separate issue)
