# Migrate Tag System from Integer IDs to Node UUIDs

## Problem

The tag system is broken under `NODE_BASED_ARCHITECTURE_ENABLED = true` (the default).
`createTagServerFn` returns `id: -1`, so all tags collide in the `Map<number, Tag>` cache.
`updateTag/moveTag/deleteTag` use `findTagNodeByLegacyId()` which always returns null because no `legacyId` property is ever set on created nodes.

## Approach

Remove the integer ID layer entirely. Tags are already nodes — the system should use the node's string UUID as the tag ID everywhere.

## Changes

### 1. Type definitions — `apps/nxus-core/src/types/tag.ts`
- `Tag.id`: `z.number()` → `z.string()` (node UUID)
- `Tag.parentId`: `z.number().nullable()` → `z.string().nullable()` (parent node UUID)
- `CreateTagInput.parentId`: same change
- `UpdateTagInput.id` and `.parentId`: same change

### 2. Server functions — `apps/nxus-core/src/services/tag.server.ts`
- **Remove `findTagNodeByLegacyId` entirely** — no more legacy ID lookups
- **Remove all legacy table paths** (the `else` branches). Only keep the node-based path.
- Input schema `id` fields: `z.number()` → `z.string()`
- Input schema `parentId` fields: `z.number().nullable()` → `z.string().nullable()`
- `createTagServerFn`: return `{ success: true, id: nodeId }` (the actual UUID)
- `updateTagServerFn`: look up node directly by `ctx.data.id` (it's the UUID now)
- `deleteTagServerFn`: same — `deleteNode(db, ctx.data.id)` directly
- `moveTagServerFn`: same — set parent property using `ctx.data.id` and `ctx.data.newParentId` directly
- `getTagsServerFn`: return `node.id` as the tag ID, resolve parent via node property → node UUID

### 3. Store — `apps/nxus-core/src/stores/tag-data.store.ts`
- `Map<number, Tag>` → `Map<string, Tag>`
- All method signatures: `id: number` → `id: string`, `parentId: number | null` → `string | null`
- `addTag`: use `result.id` (now a UUID string) directly
- Remove parseInt conversions

### 4. System tags — `apps/nxus-core/src/lib/system-tags.ts`
- `SystemTag.id`: `number` → `string`
- `SYSTEM_TAGS.AI_PROVIDER.id`: hardcoded `14` → a stable string ID (e.g. `'system:ai-provider'`)
- `isSystemTag(tagId: string)`

### 5. Tag tree UI — `apps/nxus-core/src/components/features/gallery/tag-tree/tag-tree.tsx`
- Props `onSelect`, `onViewSchema`: `(tagId: number)` → `(tagId: string)`
- `configurableTagIds`: `Set<number>` → `Set<string>`
- Remove `String(tag.id)` / `parseInt(...)` conversions — IDs are already strings

### 6. Drag & drop — `use-tag-dnd.tsx`
- Remove `parseInt(activeTagIdStr, 10)` / `parseInt(overTagIdStr, 10)` — use string IDs directly

### 7. Tag filter bar — `tag-filter-bar.tsx`
- Remove `parseInt(idStr, 10)` conversions

### 8. Tag editor modal — `tag-editor-modal.tsx`
- Tag references use `id: string` instead of `id: number`

### 9. Tag config modal — `tag-config-modal.tsx`
- `tagId: number` → `tagId: string`

### 10. App detail tags — `app-detail-tags.tsx`
- Tag ID types from number to string

### 11. DB types — `libs/nxus-db/src/types/item.ts`
- `TagRefSchema.id`: `z.number()` → `z.string()`

### 12. DB schema — `libs/nxus-db/src/schemas/item-schema.ts`
- `itemTags.tagId`: `integer('tag_id')` → `text('tag_id')`
- `tagSchemas.tagId`: `integer('tag_id')` → `text('tag_id')`
- `itemTagConfigs.tagId`: `integer('tag_id')` → `text('tag_id')`
- Keep `tags` table as-is (legacy, unused by node path)

### 13. DB init — `libs/nxus-db/src/client/master-client.ts`
- Add migration: ALTER TABLE `item_tags` to change `tag_id` from INTEGER to TEXT
  (SQLite doesn't support ALTER COLUMN — need to recreate the table or accept that existing dev DBs need reset)

### 14. Apps server — `apps/nxus-core/src/services/apps/apps.server.ts`
- Tag joins: `tags.id` is now string-based. Under node architecture, should read tags from nodes.
- `apps-mutations.server.ts`: `tagId` in `itemTags` insert is now string

### 15. Tag config server — `apps/nxus-core/src/services/tag-config.server.ts`
- All `tagId: z.number()` → `z.string()`
- System tag ID matching: use string IDs

### 16. Routes — `apps/nxus-core/src/routes/index.tsx`
- Remove `parseInt(tagIdStr, 10)` — tag IDs are already strings

### 17. Hooks — `apps/nxus-core/src/hooks/use-app-registry.ts`
- `filterTags` array: `id: number` → `id: string`

### 18. Seed script — `apps/nxus-core/scripts/seed-tables.ts`
- System tags should be seeded as nodes, not into the legacy `tags` table
- Or keep seeding legacy table but with string IDs for the junction tables

## Order of implementation

1. Types first (tag.ts, item.ts TagRefSchema)
2. Server functions (tag.server.ts — remove legacy paths, use UUID)
3. Store (tag-data.store.ts)
4. System tags (system-tags.ts)
5. DB schema + init migration (item-schema.ts, master-client.ts)
6. App server functions (apps.server.ts, apps-mutations.server.ts, tag-config.server.ts)
7. UI components (tag-tree, tag-filter-bar, tag-editor-modal, tag-config-modal, app-detail-tags, routes)
8. Typecheck and fix remaining references
