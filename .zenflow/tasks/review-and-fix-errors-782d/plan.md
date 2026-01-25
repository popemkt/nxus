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
<!-- chat-id: 5fe8989c-edd3-4839-8272-92b9aa97dd7b -->

Completed: See `spec.md` for full PR review and analysis.

**Summary**: This PR attempts to fix type errors but is incomplete. It exposed 12 pre-existing type errors in `@nxus/workbench` by changing from `noEmit: true` to `composite: true`. Tests pass but typecheck fails.

**Difficulty**: Medium

---

### [x] Step: Fix type errors in @nxus/workbench
<!-- chat-id: d680d63a-f7c7-4c95-925c-431d417729cf -->

**Completed**: Fixed all type errors exposed by the build configuration change.

**Changes made**:

1. Added explicit type annotations to callback parameters with implicit `any`:
   - `NodeBrowser.tsx:51` - Added type `{ id: string; content: string; systemId: string | null }` to `st` parameter
   - `NodeInspector.tsx:282` - Added same type to `st` parameter
   - `nodes.server.ts:142` - Added `AssembledNode` type to `node` parameter
   - `nodes.server.ts:186` - Added `NodeProperty` type to `p` parameter
   - `nodes.server.ts:235` - Added `AssembledNode` type to `cmd` parameter
   - `nodes.server.ts:273` - Added `AssembledNode` type to `node` parameter
   - `search-nodes.server.ts:281` - Added `Node | undefined` type annotation
   - `search-nodes.server.ts:330` - Added supertag type to `st` parameter

2. Fixed type inference errors in `NodeInspector.tsx`:
   - Line 166: Cast `Object.entries()` result to proper property value type
   - Line 314: Same fix applied for the map operation

3. Fixed `@ts-expect-error` in `adapters.test.ts:266`:
   - The directive was initially showing as "unused" due to build config issues
   - After fixing project references, restored the directive with updated comment
   - The directive is necessary because workflow commands correctly don't have a `command` property

4. Fixed build configuration issues:
   - Added `composite: true` and `emitDeclarationOnly: true` to `@nxus/db/tsconfig.json`
   - This was required because `@nxus/workbench` uses TypeScript project references to `@nxus/db`

**Verification**: `npx nx run @nxus/workbench:typecheck` passes successfully

---

### [x] Step: Final Verification
<!-- chat-id: 3b352bbf-d70e-4889-9872-7c771404b701 -->

**Completed**: All verification passed.

**Results**:
- Typecheck: All 4 projects pass
- Tests: All 36 tests pass (20 in @nxus/db, 15 in @nxus/workbench, 1 in nxus-core)

**Additional fixes from PR review**:
1. Fixed bug in `db-sync-tags.ts` - incorrect tag creation count
2. Removed unused imports in `migrate-to-nodes.ts`
3. Added `*.tsbuildinfo` to `.gitignore` and removed from git tracking

**Report**: See `report.md` for full details including outstanding issues for future work.
