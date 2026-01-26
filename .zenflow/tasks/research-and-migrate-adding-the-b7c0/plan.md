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
<!-- chat-id: bdbbfeb2-8ae3-4ae2-96c4-8b3890eca9b0 -->

**Completed**: Created `spec.md` with comprehensive technical specification including:
- Difficulty assessment: **Medium-Hard**
- Current architecture analysis (legacy single-type vs node-based supertag system)
- Hybrid implementation approach leveraging both systems
- Database schema changes (new `item_types` junction table)
- Type definition changes (`types: ItemType[]` array)
- Service layer and API changes
- Migration strategy with rollback plan
- Open questions for user input

---

## Implementation Steps

### [x] Step 1: User Clarification - Resolve Open Questions
<!-- chat-id: e614631d-8a6c-4d89-9e81-01e21107721a -->

**Completed**: User provided decisions on all open questions:

1. **Primary Type Display**: **B - Show all type badges side by side**
   - Display all type badges for each item
   - Clear visibility of all item types at a glance

2. **Type Filtering**: **C - Both options (advanced filter toggle)**
   - Default: ANY selected types (OR logic)
   - Advanced toggle: ALL selected types (AND logic)

3. **Migration Scope**: **C - Full node-based migration**
   - Supertags become the authoritative source of truth
   - `item_types` table synced from supertags
   - Legacy `items.type` kept for backward compatibility only

4. **Manifest Support**: **Yes - Support `types: []` array**
   - Change from `type: "tool"` to `types: ["tool", "repo"]`
   - Migration: Export current items to JSON, update format
   - Backward compat: Accept single `type`, convert to `types: [type]`

Updated `spec.md` section 13.5 with these decisions.

---

### [x] Step 2: Database Schema - Add itemTypes Junction Table
<!-- chat-id: fe635e0a-bcff-42e5-8745-7bde5e124fdf -->

**Completed**: Added the `item_types` junction table for multi-type support:

**Files modified:**
- `packages/nxus-db/src/schemas/item-schema.ts` - Added `itemTypes` table definition with Drizzle ORM
- `packages/nxus-db/src/client/master-client.ts` - Added migration SQL with auto-population from existing items

**Implementation details:**
1. Added `itemTypes` table with columns:
   - `item_id` (TEXT, NOT NULL) - Foreign key to items.id
   - `type` (TEXT, NOT NULL) - One of 'html', 'typescript', 'remote-repo', 'tool'
   - `is_primary` (INTEGER, DEFAULT 0) - Boolean flag for primary type
   - `order` (INTEGER, DEFAULT 0) - Sort order for display
2. Composite primary key on (item_id, type)
3. Added indexes on `item_id` and `type` for query performance
4. Auto-migration: `INSERT OR IGNORE INTO item_types SELECT id, type, 1, 0 FROM items`
5. Export via barrel in `schemas/index.ts` (already exports all from item-schema.js)

**Verification completed:**
- Build passes: `pnpm nx run nxus-core:build` succeeds
- All tests pass: `pnpm nx run-many --target=test --all` (21 tests)
- Type definitions exported: `ItemTypeEntry`, `NewItemTypeEntry`

---

### [ ] Step 3: Type Definitions - Update Item Types

**Files to modify:**
- `packages/nxus-db/src/types/item.ts` - Add `types` array, keep `type` for compat

**Implementation:**
1. Add `types: z.array(ItemTypeSchema).min(1)` to base schema
2. Add `primaryType: ItemTypeSchema` field
3. Keep `type` as alias to `primaryType` for backward compatibility
4. Update zod schemas with refinement (primaryType must be in types)
5. Remove discriminated union (no longer needed)

**Verification:**
- Type checking passes: `pnpm type-check`
- Existing tests still pass

---

### [ ] Step 4: Service Layer - Update Query Logic

**Files to modify:**
- `packages/nxus-core/src/services/apps/apps.server.ts` - Update queries to join types
- `packages/nxus-core/src/services/apps/apps-mutations.server.ts` - Add type mutations

**Implementation:**
1. Update `getAllApps()` to join with `itemTypes` table
2. Update `parseAppRecord()` to accept types array parameter
3. Add `setItemTypes()` function
4. Add `addItemType()` function
5. Add `removeItemType()` function
6. Ensure writes update both `items.type` and `itemTypes` table

**Verification:**
- Queries return items with `types` array populated
- Single-type items work correctly (backward compat)
- Type mutations create/update/delete correctly

---

### [ ] Step 5: Node-Based Integration - Supertag Helpers

**Files to modify:**
- `packages/nxus-db/src/services/node.service.ts` - Add supertag query helpers

**Implementation:**
1. Add `getNodeSupertags(nodeId)` function
2. Add `setNodeSupertags(nodeId, supertags[])` function
3. Add `getNodesBySupertags(supertags[], matchAll)` function
4. Sync supertag assignments with `itemTypes` table when `NODE_BASED_ARCHITECTURE_ENABLED`

**Verification:**
- Supertag queries work in node-based mode
- Type changes sync between both systems

---

### [ ] Step 6: UI Constants - Multi-Type Display Helpers

**Files to modify:**
- `packages/nxus-core/src/lib/app-constants.ts` - Add display helpers for multi-type

**Implementation:**
1. Add `getTypeIcon(types: ItemType[])` - returns primary type icon
2. Add `getTypeLabel(types: ItemType[])` - returns display label
3. Add `getTypeBadges(types: ItemType[])` - returns badge configurations
4. Handle edge cases (empty array, unknown types)

**Verification:**
- Helper functions return expected values
- UI components can use new helpers

---

### [ ] Step 7: Migration Script - Update Manifest Migration

**Files to modify:**
- `packages/nxus-core/scripts/migrate-manifests.ts` - Handle multi-type during migration

**Implementation:**
1. Update to read `types` array from manifest (if present)
2. Fall back to single `type` field for backward compat
3. Populate `itemTypes` table during migration
4. Set primary type from first element or explicit `primaryType` field

**Verification:**
- Migration handles both old and new manifest formats
- All items have correct types after migration

---

### [ ] Step 8: Testing & Verification

**Implementation:**
1. Run existing test suite: `pnpm test`
2. Run linting: `pnpm lint`
3. Run type checking: `pnpm type-check`
4. Manual testing:
   - Create item with single type
   - Add second type to item
   - Query by type (verify multi-type items appear)
   - Remove type (verify item retains at least one)
5. Test backward compatibility with existing code

**Verification:**
- All tests pass
- No lint errors
- No type errors
- Manual tests succeed

---

### [ ] Step 9: Documentation & Report

**Files to create:**
- `{@artifacts_path}/report.md` - Implementation report

**Implementation:**
1. Document what was implemented
2. Document how the solution was tested
3. Document any challenges or issues encountered
4. Note any follow-up work needed

**Verification:**
- Report is complete and accurate
