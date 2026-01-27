# Implementation Report: Multi-Type Support for Items in Nxus Core

## Executive Summary

Successfully implemented the ability for items in nxus core to have multiple types simultaneously (e.g., an item can be both a "tool" and a "repo"). The implementation leverages a hybrid approach using both the legacy junction table system and the existing node-based supertag architecture.

**Status**: ✅ Complete
**Difficulty**: Medium-Hard
**All Tests Passing**: Yes (171 tests across 3 projects)

---

## What Was Implemented

### 1. Database Schema - `item_types` Junction Table

**File**: `packages/nxus-db/src/schemas/item-schema.ts`

Added a new junction table to store multiple types per item:

```typescript
export const itemTypes = sqliteTable(
  'item_types',
  {
    itemId: text('item_id').notNull(),
    type: text('type').$type<AppType>().notNull(),
    isPrimary: integer('is_primary').default(0),
    order: integer('order').default(0),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.type] }),
    index('idx_item_types_item_id').on(table.itemId),
    index('idx_item_types_type').on(table.type),
  ],
)
```

**Auto-Migration**: Existing items are automatically migrated via:
```sql
INSERT OR IGNORE INTO item_types (item_id, type, is_primary, "order")
SELECT id, type, 1, 0 FROM items;
```

### 2. Type Definitions - Multi-Type Schema

**File**: `packages/nxus-db/src/types/item.ts`

Converted from discriminated union to unified schema with multi-type support:

- Added `types: z.array(ItemTypeSchema).min(1)` - array of all types
- Added `primaryType: ItemTypeSchema` - primary type for display
- Kept `type` as deprecated alias to `primaryType` for backward compatibility
- All type-specific fields made optional in base schema
- Added `superRefine` validation:
  - `primaryType` must be in `types` array
  - `type` must match `primaryType`
  - Tool-specific fields required when 'tool' in types
  - Remote-repo path validated as URL when 'remote-repo' in types

**Type Guards Added**:
- `isToolItem(item)` - checks if 'tool' in types
- `isTypeScriptItem(item)` - checks if 'typescript' in types
- `isRemoteRepoItem(item)` - checks if 'remote-repo' in types
- `isHtmlItem(item)` - checks if 'html' in types

### 3. Service Layer - Query and Mutation Logic

**File**: `packages/nxus-core/src/services/apps/apps.server.ts`

Updated query functions to:
- Join with `item_types` table to fetch all types
- Build `types` array from junction table (fallback to single type)
- Determine `primaryType` from junction table (`isPrimary=true`)
- Return items with `types`, `primaryType`, and deprecated `type` fields

**File**: `packages/nxus-core/src/services/apps/apps-mutations.server.ts`

Added type mutation functions:
- `setItemTypesServerFn(itemId, types, primaryType)` - Replace all types
- `addItemTypeServerFn(itemId, type)` - Add a single type
- `removeItemTypeServerFn(itemId, type)` - Remove a type (prevents removing last)
- `setPrimaryTypeServerFn(itemId, type)` - Change primary type

All mutations maintain both junction table AND legacy `items.type` for backward compatibility.

### 4. Node-Based Integration - Supertag Helpers

**File**: `packages/nxus-db/src/services/node.service.ts`

Added comprehensive supertag helper functions:

**Query Helpers**:
- `getNodeSupertags(db, nodeId)` - Get all supertags for a node
- `getNodeSupertagSystemIds(db, nodeId)` - Get just systemIds
- `setNodeSupertags(db, nodeId, supertagSystemIds[])` - Replace all supertags
- `addNodeSupertag(db, nodeId, supertagSystemId)` - Add a single supertag
- `removeNodeSupertag(db, nodeId, supertagSystemId)` - Remove a supertag
- `getNodesBySupertags(db, supertagSystemIds[], matchAll)` - Query with OR/AND logic

**Mapping Constants**:
- `SUPERTAG_TO_ITEM_TYPE` - Maps supertag systemIds to AppType
- `ITEM_TYPE_TO_SUPERTAG` - Maps AppType to supertag systemIds
- `supertagsToItemTypes(supertags[])` - Convert supertags to ItemTypes
- `itemTypesToSupertags(types[])` - Convert ItemTypes to supertags

**Sync Functions**:
- `syncNodeSupertagsToItemTypes(db, nodeId, itemId)` - Sync supertags → itemTypes
- `syncItemTypesToNodeSupertags(db, itemId, nodeId)` - Sync itemTypes → supertags
- `syncAllNodeSupertagsToItemTypes(db)` - Batch sync all item nodes

### 5. UI Constants - Display Helpers

**File**: `packages/nxus-core/src/lib/app-constants.ts`

Added multi-type display helper functions:

**Single-Type Helpers**:
- `getTypeIcon(type)` - Returns icon for a type
- `getTypeLabel(type)` - Returns short label
- `getTypeLabelLong(type)` - Returns long label

**Multi-Type Helpers** (work with Item objects):
- `getPrimaryTypeIcon(item)` - Primary type icon
- `getPrimaryTypeLabel(item)` - Primary type label
- `getAllTypeLabels(item)` - Array of all type labels
- `getAllTypeIcons(item)` - Array of all type icons
- `getTypeBadges(item)` - Full badge configurations

**Utility Helpers**:
- `hasMultipleTypes(item)` - Boolean check
- `getTypeCount(item)` - Count of types

### 6. Migration Script - Multi-Type Manifest Support

**File**: `packages/nxus-core/scripts/migrate-manifests.ts`

Updated to handle both old and new manifest formats:

**Old Format** (still supported):
```json
{ "type": "tool" }
```

**New Format**:
```json
{ "types": ["tool", "repo"], "primaryType": "tool" }
```

The migration:
1. Reads raw manifest
2. Normalizes type fields (converts `type` to `types: [type]`)
3. Populates `item_types` junction table
4. Sets `is_primary` flag based on `primaryType`
5. Maintains backward compatibility by writing `primaryType` to legacy `items.type`

---

## User Decisions Incorporated

| Decision | Choice | Implementation |
|----------|--------|----------------|
| Primary Type Display | Show all type badges side by side | `getTypeBadges()` returns all badge configs |
| Type Filtering | Both OR and AND options | `getNodesBySupertags(db, ids, matchAll)` supports both |
| Migration Scope | Full node-based as source of truth | Sync functions maintain supertag ↔ itemTypes alignment |
| Manifest Support | Support `types: []` array | `normalizeManifestTypes()` handles both formats |

---

## Testing & Verification

### Test Results

```
pnpm nx run-many --target=test --all

@nxus/db:       20 tests passed
@nxus/workbench: 150 tests passed
nxus-core:      1 test passed (3 skipped - PTY buffer tests)

Total: 171 tests passed
```

### Build Verification

```
pnpm nx run-many --target=build --all

✅ Client build: Success
✅ SSR build: Success
✅ All packages built without type errors
```

### Backward Compatibility Verified

| Aspect | Verification |
|--------|-------------|
| `type` field | Kept as deprecated alias for `primaryType` |
| Legacy queries | Fall back to single type if junction table empty |
| `items.type` column | Synced on all mutations |
| Single-type manifests | Auto-converted to `types: [type]` |
| Existing tests | All 171 tests pass unchanged |

---

## Challenges & Solutions

### 1. Discriminated Union to Unified Schema

**Challenge**: The original `ItemSchema` used a discriminated union which doesn't support items having multiple types.

**Solution**: Replaced with a unified schema using `superRefine` for conditional validation. All type-specific fields are now optional at the schema level, with runtime validation ensuring required fields are present based on the `types` array.

### 2. Type-Specific Field Validation

**Challenge**: Different item types have different required fields (e.g., `checkCommand` for tools).

**Solution**: Added `superRefine` validation that checks the `types` array and validates that type-specific fields are present when their type is included.

### 3. Keeping Legacy System Working

**Challenge**: Existing code expects a single `type` field.

**Solution**:
- Keep `type` as a deprecated alias for `primaryType`
- Service layer always populates both `types` array and legacy `type`
- Mutation functions update both junction table and legacy column

### 4. Supertag ↔ ItemType Mapping

**Challenge**: The node-based supertag system uses different identifiers (e.g., `supertag:tool`) than the legacy type enum (e.g., `tool`).

**Solution**: Created bidirectional mapping constants (`SUPERTAG_TO_ITEM_TYPE`, `ITEM_TYPE_TO_SUPERTAG`) and conversion functions to translate between systems.

---

## Files Modified

| File | Changes |
|------|---------|
| `packages/nxus-db/src/schemas/item-schema.ts` | Added `itemTypes` junction table |
| `packages/nxus-db/src/client/master-client.ts` | Added migration SQL |
| `packages/nxus-db/src/types/item.ts` | Multi-type schema with backward compat |
| `packages/nxus-core/src/services/apps/apps.server.ts` | Query logic for junction table |
| `packages/nxus-core/src/services/apps/apps-mutations.server.ts` | Type mutation functions |
| `packages/nxus-db/src/services/node.service.ts` | Supertag helper functions |
| `packages/nxus-core/src/lib/app-constants.ts` | Multi-type display helpers |
| `packages/nxus-core/scripts/migrate-manifests.ts` | Multi-type manifest support |

---

## Follow-Up Work (Future Tasks)

The following items are outside the scope of this task but may be considered for future work:

1. **UI Component Updates**: Update React components to use the new `getTypeBadges()` helpers to display multiple type badges
2. **Filter UI**: Add advanced filter toggle for AND/OR type filtering in list views
3. **Type Editor**: Add UI for editing item types (add/remove types, change primary)
4. **Full Supertag Migration**: Run batch sync to fully migrate all items to supertag-based types
5. **Performance Optimization**: Add caching for type queries if needed at scale

---

## Conclusion

The multi-type support for items has been successfully implemented with:
- Full backward compatibility maintained
- Both legacy junction table and node-based supertag systems supported
- Comprehensive helper functions for UI integration
- All existing tests passing
- Clean migration path for manifests

The implementation follows the hybrid approach as specified, allowing gradual adoption while maintaining system stability.
