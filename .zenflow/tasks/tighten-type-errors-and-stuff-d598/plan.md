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
<!-- chat-id: 3f72cd9c-5883-4ca9-9592-da9dcedda2c9 -->

**Completed**: Created `spec.md` with full error analysis.

**Summary**:
- **Difficulty**: Medium (506 errors, but repetitive patterns)
- **Root causes identified**:
  1. Zod schema type inference issues (SupertagFilter missing `includeInherited`)
  2. Duplicate `SavedQuery` export
  3. Missing `isPrimary` column in itemTypes schema
  4. Unused imports

See `spec.md` for detailed technical specification.

---

### [x] Step: Fix Zod Schema Type Inference
<!-- chat-id: 1c7b2b36-7610-432e-b34c-14f698ced04d -->
Fix the core schema issues that cascade into 400+ type errors.

**Completed**: Reduced errors from 506 to 39.

**Tasks**:
- [x] Fix `SupertagFilterSchema.includeInherited` to be truly optional in TypeScript
- [x] Remove duplicate `SavedQuery` interface from `node.ts` (keep in `query.ts`)
- [x] Fix `QueryDefinitionSchema.filters` and `limit` to be truly optional
- [x] Update helper functions and services to handle optional fields
- [x] Run typecheck to verify reduction in errors

**Changes made**:
- `packages/nxus-db/src/types/query.ts`: Changed `.optional().default()` to just `.optional()` for `includeInherited`, `filters`, and `limit` - this makes the TypeScript types truly optional while runtime defaults can be applied elsewhere
- `packages/nxus-db/src/types/node.ts`: Replaced duplicate `SavedQuery` interface with re-export from `query.ts`
- `packages/nxus-db/src/services/query-evaluator.service.ts`: Added nullish coalescing for `definition.filters`
- `packages/nxus-db/src/reactive/dependency-tracker.ts`: Added nullish coalescing for `definition.filters` and removed unused type guard imports

**Verification**: `pnpm nx run @nxus/db:typecheck` shows 39 errors (down from 506) - remaining errors are unused variables in tests and `isPrimary` column issue (next step).

---

### [x] Step: Fix Database Schema and Service Errors
<!-- chat-id: bbe2137e-596c-4757-924c-03cbf6b0d88b -->
Fix the `isPrimary` column issue and related service code.

**Completed**: Removed `isPrimary` references from `node.service.ts`.

**Tasks**:
- [x] Add `isPrimary` column to `itemTypes` schema (or remove if not needed) - Removed usage, `order=0` indicates primary
- [x] Fix `node.service.ts` references to `isPrimary` - Removed `isPrimary` from insert values
- [x] Remove unused `and` import from `node.service.ts` - Removed

**Changes made**:
- `packages/nxus-db/src/services/node.service.ts`:
  - Removed unused `and` import from drizzle-orm
  - Removed `isPrimary: i === 0` from `syncNodeSupertagsToItemTypes` insert values
  - Simplified sorting in `syncItemTypesToNodeSupertags` to just use `order` (since `order=0` is primary)

**Files**:
- `packages/nxus-db/src/services/node.service.ts`

**Verification**: `pnpm nx run @nxus/db:typecheck` shows no errors for `node.service.ts`.

---

### [x] Step: Clean Up Unused Imports
<!-- chat-id: 9fd8182e-ef22-4bee-8c03-ce42b59a0bb8 -->
Remove unused imports and variables flagged by TypeScript.

**Completed**: Cleaned all unused imports and variables.

**Tasks**:
- [x] Clean `dependency-tracker.ts` unused type guards
- [x] Clean test files with unused variables

**Changes made**:
- `packages/nxus-db/src/reactive/dependency-tracker.ts`: Removed unused `ContentFilter` import
- `packages/nxus-db/src/reactive/__tests__/automation.test.ts`: Removed unused `getProperty`, `QueryDefinition` imports, and unused variables (`sub1`, `lowThresholdFired`, `highThresholdFired`)
- `packages/nxus-db/src/reactive/__tests__/event-bus.test.ts`: Removed unused `MutationType` import
- `packages/nxus-db/src/reactive/__tests__/integration.test.ts`: Removed unused `vi`, `QueryDefinition`, `MutationEvent` imports, fixed type narrowing issue in `capturedEvent` test
- `packages/nxus-db/src/reactive/__tests__/computed-field.test.ts`: Removed unused variables (`sub1`, `sub2`, `p3`)
- `packages/nxus-db/src/reactive/__tests__/performance-targets.test.ts`: Removed unused `createNode` import
- `packages/nxus-db/src/reactive/__tests__/performance.bench.ts`: Fixed `EventBus` import (moved to `types.js`)
- `packages/nxus-db/src/reactive/__tests__/query-subscription.test.ts`: Removed unused `createEventBus` import and `taskId` variable
- `packages/nxus-db/src/reactive/__tests__/subscription-tracker.test.ts`: Removed unused variables (`netflix`, `spotify`, `youtube`, `github`, `slack`, `sub2`)
- `packages/nxus-db/src/reactive/__tests__/webhook-queue.test.ts`: Fixed Mock type signature, removed invalid `contentPlain` property from test node

**Verification**: `pnpm nx run @nxus/db:typecheck` passes with 0 errors.

---

### [ ] Step: Fix Remaining Test Type Errors
If schema fixes don't resolve all test errors, fix test fixtures.

**Tasks**:
- [ ] Add missing `includeInherited` to SupertagFilter test fixtures (if still needed)
- [ ] Add missing `limit` to QueryDefinition test fixtures (if still needed)

**Files**:
- `packages/nxus-db/src/reactive/__tests__/*.test.ts`

**Verification**: Full typecheck passes with 0 errors.

---

### [ ] Step: Add MIT License and Tighten TypeScript Config
Add license file and configure TypeScript to prevent future errors.

**Tasks**:
- [ ] Create `LICENSE` file with MIT license text
- [ ] Add `noUnusedLocals` and `noUnusedParameters` to `tsconfig.base.json`
- [ ] Verify all packages still build

**Files**:
- `LICENSE` (new)
- `tsconfig.base.json`

**Verification**: `pnpm nx run-many --target=typecheck --all` passes with 0 errors.

---

### [ ] Step: Final Verification and Report
Run full verification and document completion.

**Tasks**:
- [ ] Run full typecheck across all packages
- [ ] Run build for all packages
- [ ] Run tests to ensure no regressions
- [ ] Write completion report to `report.md`

**Verification**:
```bash
pnpm nx run-many --target=typecheck --all  # 0 errors
pnpm nx run-many --target=build --all      # Success
pnpm nx run-many --target=test --all       # All pass
```
