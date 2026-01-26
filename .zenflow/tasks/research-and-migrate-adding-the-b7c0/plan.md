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

### [ ] Step 1: User Clarification - Resolve Open Questions
<!-- chat-id: 6737b3df-530b-4dba-b759-7fff1fb0b883 -->

Before implementation, get user input on:

1. **Primary Type Display**: How to show multi-type items in UI?
   - A: Primary badge + count (e.g., "Tool +1")
   - B: All type badges
   - C: Composite label (e.g., "Tool & Repository")

2. **Type Filtering**: When filtering by type, show items with:
   - A: ANY selected types
   - B: ALL selected types
   - C: Both options (advanced filter)

3. **Migration Scope**: Should migration include:
   - A: Just junction table (minimum)
   - B: Also create supertags
   - C: Full node-based migration

4. **Manifest Support**: Should `manifest.json` support `types: []` array?

---

### [ ] Step 2: Database Schema - Add itemTypes Junction Table

**Files to modify:**
- `packages/nxus-db/src/schemas/item-schema.ts` - Add `itemTypes` table definition
- `packages/nxus-db/src/index.ts` - Export new table
- Create migration file

**Implementation:**
1. Add `itemTypes` table with columns: `item_id`, `type`, `is_primary`, `order`
2. Add composite primary key on (item_id, type)
3. Generate and run migration
4. Populate from existing `items.type` column

**Verification:**
- Migration runs without errors
- Data integrity: all existing items have one entry in `itemTypes`

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
