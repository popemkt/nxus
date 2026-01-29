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

### [ ] Step: Fix Zod Schema Type Inference
Fix the core schema issues that cascade into 400+ type errors.

**Tasks**:
- [ ] Fix `SupertagFilterSchema.includeInherited` to be truly optional in TypeScript
- [ ] Remove duplicate `SavedQuery` interface from `node.ts` (keep in `query.ts`)
- [ ] Run typecheck to verify reduction in errors

**Files**:
- `packages/nxus-db/src/types/query.ts`
- `packages/nxus-db/src/types/node.ts`

**Verification**: `pnpm nx run @nxus/db:typecheck` should show significant error reduction.

---

### [ ] Step: Fix Database Schema and Service Errors
Fix the `isPrimary` column issue and related service code.

**Tasks**:
- [ ] Add `isPrimary` column to `itemTypes` schema (or remove if not needed)
- [ ] Fix `node.service.ts` references to `isPrimary`
- [ ] Remove unused `and` import from `node.service.ts`

**Files**:
- `packages/nxus-db/src/schemas/item-schema.ts`
- `packages/nxus-db/src/services/node.service.ts`

**Verification**: `pnpm nx run @nxus/db:typecheck` should pass for these files.

---

### [ ] Step: Clean Up Unused Imports
Remove unused imports and variables flagged by TypeScript.

**Tasks**:
- [ ] Clean `dependency-tracker.ts` unused type guards
- [ ] Clean test files with unused variables (prefix with `_` if intentional)

**Files**:
- `packages/nxus-db/src/reactive/dependency-tracker.ts`
- Various test files in `packages/nxus-db/src/reactive/__tests__/`

**Verification**: No TS6133/TS6196 errors remaining.

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
