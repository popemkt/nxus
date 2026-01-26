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

### [x] Step 3: Type Definitions - Update Item Types
<!-- chat-id: 6e005528-d4b1-4c52-9e50-79d7de03c85f -->

**Completed**: Updated Item type definitions for multi-type support:

**Files modified:**
- `packages/nxus-db/src/types/item.ts` - Complete rewrite of item schema

**Implementation details:**
1. Added `types: z.array(ItemTypeSchema).min(1)` to base schema
2. Added `primaryType: ItemTypeSchema` field for display and backward compatibility
3. Kept `type` as alias to `primaryType` (marked deprecated)
4. Moved `ConfigFieldSchema` and `ConfigSchemaSchema` before `BaseItemSchema` (dependency order)
5. Added all type-specific fields as optional to `BaseItemSchema`:
   - `checkCommand`, `platform`, `installInstructions`, `configSchema` (for tool type)
   - `startCommand`, `buildCommand` (for typescript type)
   - `clonePath`, `branch` (for remote-repo type)
6. Replaced discriminated union with unified `ItemSchema` using `superRefine`:
   - Validates `primaryType` is in `types` array
   - Validates `type` matches `primaryType`
   - Validates tool-specific fields when 'tool' in types
   - Validates remote-repo path is valid URL when 'remote-repo' in types
7. Added type aliases: `ToolItem`, `TypeScriptItem`, `RemoteRepoItem`, `HtmlItem`
8. Added type guards: `isToolItem()`, `isTypeScriptItem()`, `isRemoteRepoItem()`, `isHtmlItem()`

**Verification completed:**
- Build passes: `pnpm nx run nxus-core:build` succeeds
- All tests pass: `pnpm nx run-many --target=test --all` (171 tests across 3 projects)

---

### [x] Step 4: Service Layer - Update Query Logic
<!-- chat-id: aad3db17-f0a1-4a93-87a0-cf36933a5f22 -->

**Completed**: Updated service layer for multi-type query and mutation support:

**Files modified:**
- `packages/nxus-core/src/services/apps/apps.server.ts` - Updated queries to join with itemTypes table
- `packages/nxus-core/src/services/apps/apps-mutations.server.ts` - Added type mutation functions

**Implementation details:**

1. **apps.server.ts changes:**
   - Added `itemTypes` import from `@nxus/db/server`
   - Added `ItemType` type import from `@nxus/db`
   - Created `ItemTypeEntry` interface for type data from junction table
   - Updated `parseAppRecord()` to accept a third parameter `typesFromJunction: ItemTypeEntry[]`
   - `parseAppRecord()` now builds `types` array from junction table, falls back to single type from record
   - `parseAppRecord()` determines `primaryType` from junction table (`isPrimary=true`) or record.type
   - Returns items with `types`, `primaryType`, and deprecated `type` fields populated
   - Updated `getAllAppsServerFn()` to query `item_types` table and group by itemId
   - Updated `getAppByIdServerFn()` to query types for the specific item

2. **apps-mutations.server.ts changes:**
   - Added `itemTypes` table import and `ItemType` type
   - Added `and` import from drizzle-orm for compound where clauses
   - Created local `TypeEntry` interface
   - Added `setItemTypesServerFn()` - Replace all types for an item (with primary normalization)
   - Added `addItemTypeServerFn()` - Add a single type to an item
   - Added `removeItemTypeServerFn()` - Remove a type (prevents removing last type, promotes new primary)
   - Added `setPrimaryTypeServerFn()` - Change which type is primary
   - All mutations update both `itemTypes` junction table AND `items.type` for backward compatibility

**Verification completed:**
- Build passes: `pnpm nx run nxus-core:build` succeeds
- All tests pass: `pnpm nx run-many --target=test --all` (171 tests across 3 projects)

---

### [x] Step 5: Node-Based Integration - Supertag Helpers
<!-- chat-id: 88c85537-1b44-4e37-adee-ed27fb730fdc -->

**Completed**: Added comprehensive supertag helper functions for node-based multi-type support:

**Files modified:**
- `packages/nxus-db/src/services/node.service.ts` - Added supertag query and sync helpers

**Implementation details:**

1. **Supertag Query Helpers:**
   - `getNodeSupertags(db, nodeId)` - Returns all supertags with id, systemId, content, order
   - `getNodeSupertagSystemIds(db, nodeId)` - Convenience function returning just systemIds
   - `setNodeSupertags(db, nodeId, supertagSystemIds[])` - Replace all supertags for a node
   - `addNodeSupertag(db, nodeId, supertagSystemId)` - Add a single supertag (returns false if already present)
   - `removeNodeSupertag(db, nodeId, supertagSystemId)` - Remove a single supertag
   - `getNodesBySupertags(db, supertagSystemIds[], matchAll)` - Query nodes by supertags with OR/AND logic
   - `getNodeIdsBySupertags(db, supertagSystemIds[], matchAll)` - Lightweight version returning just IDs

2. **Supertag <-> ItemType Mapping:**
   - `SUPERTAG_TO_ITEM_TYPE` - Maps supertag systemIds to AppType values
   - `ITEM_TYPE_TO_SUPERTAG` - Maps AppType values to supertag systemIds
   - `supertagsToItemTypes(supertags[])` - Convert supertags to ItemType array
   - `itemTypesToSupertags(types[])` - Convert ItemTypes to supertag array

3. **Sync Functions:**
   - `syncNodeSupertagsToItemTypes(db, nodeId, itemId)` - Sync node's supertags to itemTypes table
   - `syncItemTypesToNodeSupertags(db, itemId, nodeId)` - Sync itemTypes to node's supertags
   - `extractItemIdFromNodeSystemId(nodeSystemId)` - Extract item ID from 'item:{id}' format
   - `syncAllNodeSupertagsToItemTypes(db)` - Batch sync all item nodes to itemTypes table

**Verification completed:**
- Build passes: `pnpm nx run nxus-core:build` succeeds
- All tests pass: `pnpm nx run-many --target=test --all` (all 3 projects pass)

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
