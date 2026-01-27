# Technical Specification: Multi-Type Support for Items in Nxus Core

## Overview

Enable items in nxus core to have multiple types simultaneously (e.g., an item can be both a "tool" and a "repo"). This specification outlines how to leverage the existing supertag system to implement this feature.

## Difficulty Assessment: **Medium-Hard**

- Multiple architectural options to evaluate
- Schema changes required in both legacy and node-based systems
- Query logic changes across multiple services
- UI updates for displaying multi-type items
- Migration considerations for existing data

---

## 1. Technical Context

### Language & Runtime
- **Language**: TypeScript
- **Runtime**: Node.js
- **ORM**: Drizzle ORM with better-sqlite3
- **Database**: SQLite (file-based)
- **Validation**: Zod schemas

### Key Dependencies
- `drizzle-orm` - Database ORM
- `zod` - Schema validation
- `react` - UI framework
- `@tanstack/react-router` - Routing

### Relevant Packages
- `packages/nxus-db` - Database schemas, types, and services
- `packages/nxus-core` - Application logic, UI, and server functions

---

## 2. Current Architecture Analysis

### Current Item Type System (Legacy)

**Location**: `packages/nxus-db/src/types/item.ts`

Items currently use a **discriminated union** with a single `type` field:

```typescript
export const ItemTypeSchema = z.enum([
  'html',
  'typescript',
  'remote-repo',
  'tool',
])

export const ItemSchema = z.discriminatedUnion('type', [
  HtmlItemSchema,
  TypeScriptItemSchema,
  RemoteRepoItemSchema,
  ToolItemSchema,
])
```

**Database Schema** (`packages/nxus-db/src/schemas/item-schema.ts`):
```typescript
export const items = sqliteTable('items', {
  type: text('type').$type<AppType>().notNull(),  // SINGLE TYPE
  // ...
})
```

### Existing Supertag System (Node-Based Architecture)

**Location**: `packages/nxus-db/src/schemas/node-schema.ts`

The codebase already has a sophisticated node-based architecture with supertags that **natively supports multiple types**:

```typescript
export const SYSTEM_SUPERTAGS = {
  ITEM: 'supertag:item',
  TOOL: 'supertag:tool',
  REPO: 'supertag:repo',
  // ...
}
```

**Key Mechanism**: The `nodeProperties` table allows multiple entries for the same field:
- A node can have multiple `field:supertag` properties
- Each property references a different supertag node
- The `order` field controls precedence

---

## 3. Implementation Approach

### Recommended Strategy: Hybrid Approach

Given the existing architecture, we'll implement multi-type support in **both systems**:

1. **Legacy System**: Add `itemTypes` junction table (similar to `itemTags`)
2. **Node-Based System**: Use existing supertag capabilities (already supports multi-type)
3. **Feature Flag**: Use existing `NODE_BASED_ARCHITECTURE_ENABLED` flag to switch behaviors

This allows:
- Backward compatibility with existing code
- Gradual migration path
- Immediate functionality in either mode

---

## 4. Source Code Structure Changes

### 4.1 Database Schema Changes

#### New File: `packages/nxus-db/src/schemas/item-types-schema.ts`
Create junction table for item-to-type relationships:

```typescript
export const itemTypes = sqliteTable(
  'item_types',
  {
    itemId: text('item_id').notNull(),
    type: text('type').$type<ItemType>().notNull(),
    isPrimary: integer('is_primary').default(0), // Primary type for display
    order: integer('order').default(0),
  },
  (table) => [primaryKey({ columns: [table.itemId, table.type] })],
)
```

#### Modify: `packages/nxus-db/src/schemas/item-schema.ts`
- Keep `type` column for backward compatibility (set to primary type)
- Export the new `itemTypes` table

### 4.2 Type Definition Changes

#### Modify: `packages/nxus-db/src/types/item.ts`

```typescript
// Add plural types field
export const ItemBaseSchemaWithTypes = z.object({
  // ... existing fields
  types: z.array(ItemTypeSchema).min(1), // At least one type required
  primaryType: ItemTypeSchema, // Primary type for display/backward compat
})

// Change from discriminated union to conditional schema
export const ItemSchema = ItemBaseSchemaWithTypes.refine(
  (data) => data.types.includes(data.primaryType),
  { message: "Primary type must be in types array" }
)
```

### 4.3 Service Layer Changes

#### Modify: `packages/nxus-core/src/services/apps/apps.server.ts`

Update `parseAppRecord()` to handle multiple types:

```typescript
function parseAppRecord(
  record: ItemRecord,
  tags: TagRef[],
  types: ItemType[] // NEW PARAMETER
): Item {
  return {
    // ...existing fields
    types: types.length > 0 ? types : [record.type], // Fallback to legacy type
    primaryType: record.type,
  }
}
```

Update queries to join with `itemTypes` table (similar to existing `itemTags` pattern).

#### Modify: `packages/nxus-core/src/services/apps/apps-mutations.server.ts`

Add functions for type management:

```typescript
export async function setItemTypes(
  itemId: string,
  types: ItemType[],
  primaryType?: ItemType
): Promise<void>

export async function addItemType(
  itemId: string,
  type: ItemType
): Promise<void>

export async function removeItemType(
  itemId: string,
  type: ItemType
): Promise<void>
```

### 4.4 Node-Based Architecture Integration

#### Modify: `packages/nxus-db/src/services/node.service.ts`

Add helper functions for supertag-based type queries:

```typescript
export function getNodeSupertags(db: DatabaseInstance, nodeId: string): string[]

export function setNodeSupertags(
  db: DatabaseInstance,
  nodeId: string,
  supertags: string[]
): void

export function getNodesBySupertags(
  db: DatabaseInstance,
  supertags: string[],
  matchAll: boolean = false
): NodeRecord[]
```

### 4.5 UI Constants Updates

#### Modify: `packages/nxus-core/src/lib/app-constants.ts`

Add support for multi-type display:

```typescript
export function getTypeIcon(types: ItemType[]): ComponentType
export function getTypeLabel(types: ItemType[]): string
export function getTypeBadges(types: ItemType[]): BadgeConfig[]
```

---

## 5. Data Model Changes

### New Table: `item_types`

| Column | Type | Description |
|--------|------|-------------|
| item_id | TEXT | Foreign key to items.id |
| type | TEXT | One of: 'html', 'typescript', 'remote-repo', 'tool' |
| is_primary | INTEGER | 1 if this is the primary type, 0 otherwise |
| order | INTEGER | Sort order for display |

**Primary Key**: (item_id, type)

### Modified Table: `items`

The `type` column remains but is now:
- Used as the "primary" type for backward compatibility
- Automatically synced with the primary entry in `item_types`

### Node-Based Architecture

No schema changes needed - the existing `node_properties` table already supports multiple supertag assignments per node.

---

## 6. API / Interface Changes

### New Server Functions

```typescript
// Get item with types populated
getItem(id: string): Promise<Item>

// Get items by type(s)
getItemsByTypes(types: ItemType[], matchAll?: boolean): Promise<Item[]>

// Set types for an item
setItemTypes(itemId: string, types: ItemType[], primaryType?: ItemType): Promise<void>

// Add a type to an item
addItemType(itemId: string, type: ItemType): Promise<void>

// Remove a type from an item
removeItemType(itemId: string, type: ItemType): Promise<void>
```

### Type Changes

```typescript
// Before
interface Item {
  type: ItemType
  // ...
}

// After
interface Item {
  types: ItemType[]      // All types
  primaryType: ItemType  // Primary type for display
  type: ItemType         // @deprecated - alias for primaryType
  // ...
}
```

---

## 7. Migration Strategy

### Phase 1: Database Migration

1. Create `item_types` table
2. Populate from existing `items.type`:
   ```sql
   INSERT INTO item_types (item_id, type, is_primary, order)
   SELECT id, type, 1, 0 FROM items;
   ```

### Phase 2: Code Updates

1. Update type definitions
2. Update service layer
3. Update UI components

### Phase 3: Supertag Alignment

1. Ensure item supertags match types in `itemTypes`
2. Consider making supertags the source of truth (future)

### Rollback Plan

- The `type` column remains unchanged and functional
- Feature can be disabled by reverting to legacy queries
- No data loss possible

---

## 8. Files to Create or Modify

### New Files
| File | Purpose |
|------|---------|
| `packages/nxus-db/drizzle/migrations/XXXX_add_item_types.sql` | Migration for new table |

### Modified Files
| File | Changes |
|------|---------|
| `packages/nxus-db/src/schemas/item-schema.ts` | Add `itemTypes` table |
| `packages/nxus-db/src/types/item.ts` | Update `Item` type with `types` array |
| `packages/nxus-core/src/services/apps/apps.server.ts` | Update queries to join types |
| `packages/nxus-core/src/services/apps/apps-mutations.server.ts` | Add type mutation functions |
| `packages/nxus-db/src/services/node.service.ts` | Add supertag helper functions |
| `packages/nxus-core/src/lib/app-constants.ts` | Add multi-type display helpers |
| `packages/nxus-core/scripts/migrate-manifests.ts` | Update to handle multi-type |
| `packages/nxus-db/src/index.ts` | Export new table |

---

## 9. Verification Approach

### Unit Tests
- Test type junction table CRUD operations
- Test type validation (at least one type required)
- Test primary type must be in types array

### Integration Tests
- Test querying items by multiple types
- Test backward compatibility with single-type queries
- Test supertag sync in node-based mode

### Manual Testing
1. Create item with single type → verify backward compat
2. Add second type to item → verify both appear
3. Remove type → verify item retains at least one
4. Query by type → verify multi-type items appear correctly
5. Test UI displays multiple types appropriately

### Linting & Type Checking
```bash
# From project root
pnpm lint
pnpm type-check
```

---

## 10. Open Questions for User

1. **Primary Type Display**: When an item has multiple types, how should it be displayed in the UI?
   - Option A: Show primary type badge + count indicator (e.g., "Tool +1")
   - Option B: Show all type badges
   - Option C: Show composite label (e.g., "Tool & Repository")

2. **Type Filtering**: In list views, should filtering by type:
   - Option A: Show items that have ANY of the selected types
   - Option B: Show items that have ALL of the selected types
   - Option C: Provide both options (advanced filter)

3. **Migration Scope**: Should existing items be migrated to:
   - Option A: Just the junction table (minimum change)
   - Option B: Also create corresponding supertags in node-based system
   - Option C: Full migration to node-based as source of truth

4. **Manifest Support**: Should `manifest.json` files support multiple types?
   - If yes: Change `type: "tool"` to `types: ["tool", "repo"]`
   - If no: Keep single type in manifest, multi-type only via UI/API

---

## 11. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Query performance with junction table | Medium | Add index on item_id, use efficient JOINs |
| Breaking existing code that expects single type | High | Keep `type` field as alias to `primaryType` |
| Inconsistency between legacy and node-based | Medium | Add sync mechanism on writes |
| UI complexity with multiple badges | Low | Design clear visual hierarchy |

---

## 12. Success Criteria

1. ✅ Items can be assigned 1+ types
2. ✅ Each item has a designated primary type
3. ✅ Existing single-type code continues to work
4. ✅ Types can be queried efficiently (by any or all)
5. ✅ UI displays multiple types clearly
6. ✅ Supertag system aligned with type system
7. ✅ All existing tests pass
8. ✅ No performance regression on item queries

---

## 13. Review Feedback & Additional Considerations

### 13.1 Type-Specific Fields Handling

**Issue**: The current discriminated union allows type-specific fields:
- `checkCommand` for tools
- `startCommand`, `buildCommand` for TypeScript apps
- `clonePath`, `branch` for remote-repos

**Solution**: When transitioning from discriminated union to a merged schema with `types[]`:

1. Create a merged `ItemSchema` with all type-specific fields as **optional**
2. Add Zod refinements to validate that if a type is in `types[]`, its required fields are present:

```typescript
export const ItemSchema = ItemBaseSchema.extend({
  types: z.array(ItemTypeSchema).min(1),
  primaryType: ItemTypeSchema,
  // Type-specific fields (all optional at schema level)
  checkCommand: z.string().optional(),     // Required if 'tool' in types
  startCommand: z.string().optional(),     // Required if 'typescript' in types
  buildCommand: z.string().optional(),     // Required if 'typescript' in types
  clonePath: z.string().optional(),        // Required if 'remote-repo' in types
  branch: z.string().optional(),           // Optional for 'remote-repo'
}).superRefine((data, ctx) => {
  // Validate tool-specific fields
  if (data.types.includes('tool') && !data.checkCommand) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "checkCommand required when 'tool' is in types",
      path: ['checkCommand'],
    })
  }
  // Similar refinements for other type-specific fields...
})
```

### 13.2 Database Schema Gaps

**Issue**: Some Zod schema fields may not exist in the SQLite `items` table:
- `startCommand` and `buildCommand` for TypeScriptItem
- These may be stored in `installConfig` JSON field instead

**Action Required**: During implementation, audit the `items` table columns vs Zod schema fields:
- Verify where `startCommand`, `buildCommand` are actually stored
- If in `installConfig` JSON, update parsing logic accordingly
- If missing entirely, decide: add columns or use JSON storage

### 13.3 UI Filtering Updates

**Issue**: `useAppRegistry` hook's filtering logic uses single `type` field.

**Action Required**: Update filtering to check `types` array:

```typescript
// Before
const filtered = apps.filter(app => app.type === selectedType)

// After
const filtered = apps.filter(app => app.types.includes(selectedType))
```

### 13.4 Node-Based Source of Truth

**Clarification**: When `NODE_BASED_ARCHITECTURE_ENABLED` is true:
- Supertags become the authoritative source for types
- On writes: Update supertags first, then sync to `item_types` table
- On reads: Can read from either (supertags preferred)
- This ensures both systems stay consistent during transition

### 13.5 User Decisions (Resolved)

**1. Primary Type Display**: **Option B - Show all type badges side by side**
- Display all type badges for each item
- No need for "+N" indicators or hover states
- Clear visibility of all item types at a glance

**2. Type Filtering**: **Option C - Both options (advanced filter toggle)**
- Default: ANY selected types (OR logic)
- Advanced toggle: ALL selected types (AND logic)
- Provides flexibility for different use cases

**3. Migration Scope**: **Option C - Full migration to node-based supertags as source of truth**
- Supertags become the authoritative source for item types
- `item_types` junction table synced from supertags
- Legacy `items.type` field kept for backward compatibility only
- This simplifies long-term architecture

**4. Manifest Support**: **Yes - Support `types: []` array in manifests**
- Change from `type: "tool"` to `types: ["tool", "repo"]`
- Migration approach: Export current items to JSON, update format
- Backward compatibility: Still accept single `type` field, convert to `types: [type]`
