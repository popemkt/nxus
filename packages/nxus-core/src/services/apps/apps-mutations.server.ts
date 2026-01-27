/**
 * apps-mutations.server.ts - Server functions for modifying apps
 *
 * Provides mutation operations for apps that are stored in SQLite.
 * Supports gradual migration to node-based architecture via feature toggle.
 */

import { NODE_BASED_ARCHITECTURE_ENABLED } from '@/config/feature-flags'
import {
  getDatabase,
  initDatabase,
  saveDatabase,
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  items,
  itemTags,
  itemTypes,
  type ItemMetadata,
  addPropertyValue,
  clearProperty,
  findNodeBySystemId,
  getSystemNode,
  setProperty,
  and,
  eq,
} from '@nxus/db/server'
import type { ItemType } from '@nxus/db'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// ============================================================================
// Node-based write helpers
// ============================================================================

/**
 * Find tag node by name and return its UUID
 */
function findTagNodeByName(
  db: ReturnType<typeof getDatabase>,
  tagName: string,
): string | null {
  const tagSupertag = getSystemNode(db, SYSTEM_SUPERTAGS.TAG)
  const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
  if (!tagSupertag || !supertagField) return null

  // Find nodes with #Tag supertag
  const tagProps = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, supertagField.id))
    .all()
    .filter((p) => {
      try {
        return JSON.parse(p.value || '') === tagSupertag.id
      } catch {
        return false
      }
    })

  // Find the one with matching content
  for (const prop of tagProps) {
    const node = db.select().from(nodes).where(eq(nodes.id, prop.nodeId)).get()
    if (node && node.content === tagName) {
      return node.id
    }
  }
  return null
}

/**
 * Update tags on item node
 */
function updateItemNodeTags(
  db: ReturnType<typeof getDatabase>,
  itemSystemId: string,
  tagNames: string[],
): boolean {
  const itemNode = findNodeBySystemId(db, itemSystemId)
  if (!itemNode) return false

  // Clear existing tags
  clearProperty(db, itemNode.id, SYSTEM_FIELDS.TAGS)

  // Add new tags
  for (const tagName of tagNames) {
    const tagNodeId = findTagNodeByName(db, tagName)
    if (tagNodeId) {
      addPropertyValue(db, itemNode.id, SYSTEM_FIELDS.TAGS, tagNodeId)
    }
  }
  return true
}

/**
 * Update category on item node
 */
function updateItemNodeCategory(
  db: ReturnType<typeof getDatabase>,
  itemSystemId: string,
  category: string,
): boolean {
  const itemNode = findNodeBySystemId(db, itemSystemId)
  if (!itemNode) return false

  setProperty(db, itemNode.id, SYSTEM_FIELDS.CATEGORY, category)
  return true
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Update an app's tags
 * Uses node-based writes when NODE_BASED_ARCHITECTURE_ENABLED is true
 */
export const updateAppTagsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      appId: z.string(),
      tags: z.array(
        z.object({
          id: z.number(),
          name: z.string(),
        }),
      ),
    }),
  )
  .handler(async (ctx) => {
    const { appId, tags: tagRefs } = ctx.data
    console.log('[updateAppTagsServerFn] Updating:', appId, tagRefs)

    initDatabase()
    const db = getDatabase()

    // Feature toggle: use node-based writes
    if (NODE_BASED_ARCHITECTURE_ENABLED) {
      console.log('[updateAppTagsServerFn] Using node-based architecture')
      const tagNames = tagRefs.map((t) => t.name)
      const success = updateItemNodeTags(db, `item:${appId}`, tagNames)
      if (!success) {
        return { success: false as const, error: 'Item node not found' }
      }
      saveDatabase()
      return { success: true as const, data: { tags: tagRefs } }
    }

    // Legacy: update junction table
    const appRecord = db.select().from(items).where(eq(items.id, appId)).get()
    if (!appRecord) {
      console.log('[updateAppTagsServerFn] App not found:', appId)
      return { success: false as const, error: 'App not found' }
    }

    const tagIds = tagRefs.map((t) => t.id)

    // Delete existing links
    await db.delete(itemTags).where(eq(itemTags.appId, appId)).run()

    // Insert new links
    if (tagIds.length > 0) {
      for (const tagId of tagIds) {
        await db.insert(itemTags).values({ appId, tagId }).run()
      }
    }

    // Update updatedAt
    db.update(items)
      .set({ updatedAt: new Date() })
      .where(eq(items.id, appId))
      .run()

    saveDatabase()
    console.log('[updateAppTagsServerFn] Success:', appId)
    return { success: true as const, data: { tags: tagRefs } }
  })

/**
 * Update an app's category
 * Uses node-based writes when NODE_BASED_ARCHITECTURE_ENABLED is true
 */
export const updateAppCategoryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      appId: z.string(),
      category: z.string(),
    }),
  )
  .handler(async (ctx) => {
    const { appId, category } = ctx.data
    console.log('[updateAppCategoryServerFn] Updating:', appId)

    initDatabase()
    const db = getDatabase()

    // Feature toggle: use node-based writes
    if (NODE_BASED_ARCHITECTURE_ENABLED) {
      console.log('[updateAppCategoryServerFn] Using node-based architecture')
      const success = updateItemNodeCategory(db, `item:${appId}`, category)
      if (!success) {
        return { success: false as const, error: 'Item node not found' }
      }
      saveDatabase()
      return { success: true as const }
    }

    // Legacy: update metadata JSON
    const appRecord = db.select().from(items).where(eq(items.id, appId)).get()
    if (!appRecord) {
      return { success: false as const, error: 'App not found' }
    }

    const currentMetadata: ItemMetadata =
      (appRecord.metadata as ItemMetadata) || {
        tags: [],
        category: 'uncategorized',
        createdAt: '',
        updatedAt: '',
      }

    const updatedMetadata: ItemMetadata = {
      ...currentMetadata,
      category,
      updatedAt: new Date().toISOString(),
    }

    db.update(items)
      .set({ metadata: updatedMetadata, updatedAt: new Date() })
      .where(eq(items.id, appId))
      .run()

    saveDatabase()
    console.log('[updateAppCategoryServerFn] Success:', appId)
    return { success: true as const }
  })

// ============================================================================
// Item Type Mutations - Multi-type support
// ============================================================================

const ItemTypeSchema = z.enum(['html', 'typescript', 'remote-repo', 'tool'])

/**
 * Type entry for item types
 * The display type is determined by order (order=0 is the display/first type)
 */
interface TypeEntry {
  type: ItemType
  order: number
}

/**
 * Set all types for an item (replace existing types)
 * Types are ordered by their position in the array (index 0 = first/display type)
 * Also updates items.type to match types[0] for backward compatibility
 */
export const setItemTypesServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      itemId: z.string(),
      types: z
        .array(ItemTypeSchema)
        .min(1, 'At least one type is required'),
    }),
  )
  .handler(async (ctx) => {
    const { itemId, types } = ctx.data
    console.log('[setItemTypesServerFn] Setting types:', itemId, types)

    initDatabase()
    const db = getDatabase()

    // Verify item exists
    const itemRecord = db.select().from(items).where(eq(items.id, itemId)).get()
    if (!itemRecord) {
      console.log('[setItemTypesServerFn] Item not found:', itemId)
      return { success: false as const, error: 'Item not found' }
    }

    // Delete existing types
    db.delete(itemTypes).where(eq(itemTypes.itemId, itemId)).run()

    // Insert new types with order based on array index
    types.forEach((type, index) => {
      db.insert(itemTypes)
        .values({
          itemId,
          type,
          order: index,
        })
        .run()
    })

    // Update items.type to first type for backward compatibility
    const firstType = types[0]
    db.update(items)
      .set({ type: firstType, updatedAt: new Date() })
      .where(eq(items.id, itemId))
      .run()

    saveDatabase()
    console.log('[setItemTypesServerFn] Success:', itemId)
    return {
      success: true as const,
      data: { types: types.map((type, index) => ({ type, order: index })) as TypeEntry[] },
    }
  })

/**
 * Add a type to an item (if not already present)
 * By default appends to the end. Use `asFirst: true` to make it the first/display type.
 */
export const addItemTypeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      itemId: z.string(),
      type: ItemTypeSchema,
      asFirst: z.boolean().default(false),
    }),
  )
  .handler(async (ctx) => {
    const { itemId, type, asFirst } = ctx.data
    console.log('[addItemTypeServerFn] Adding type:', itemId, type, { asFirst })

    initDatabase()
    const db = getDatabase()

    // Verify item exists
    const itemRecord = db.select().from(items).where(eq(items.id, itemId)).get()
    if (!itemRecord) {
      console.log('[addItemTypeServerFn] Item not found:', itemId)
      return { success: false as const, error: 'Item not found' }
    }

    // Check if type already exists
    const existingType = db
      .select()
      .from(itemTypes)
      .where(and(eq(itemTypes.itemId, itemId), eq(itemTypes.type, type)))
      .get()

    if (existingType) {
      console.log('[addItemTypeServerFn] Type already exists:', itemId, type)
      return { success: false as const, error: 'Type already exists for item' }
    }

    // Get current types
    const currentTypes = db
      .select()
      .from(itemTypes)
      .where(eq(itemTypes.itemId, itemId))
      .all()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    if (asFirst) {
      // Shift all existing types up by 1
      for (const t of currentTypes) {
        db.update(itemTypes)
          .set({ order: (t.order ?? 0) + 1 })
          .where(and(eq(itemTypes.itemId, itemId), eq(itemTypes.type, t.type)))
          .run()
      }
      // Insert new type at order 0
      db.insert(itemTypes)
        .values({ itemId, type, order: 0 })
        .run()
      // Update items.type for backward compatibility
      db.update(items)
        .set({ type, updatedAt: new Date() })
        .where(eq(items.id, itemId))
        .run()
    } else {
      // Append to end
      const maxOrder = Math.max(-1, ...currentTypes.map((t) => t.order ?? 0))
      db.insert(itemTypes)
        .values({ itemId, type, order: maxOrder + 1 })
        .run()
      // If this is the first type, update items.type
      if (currentTypes.length === 0) {
        db.update(items)
          .set({ type, updatedAt: new Date() })
          .where(eq(items.id, itemId))
          .run()
      } else {
        db.update(items)
          .set({ updatedAt: new Date() })
          .where(eq(items.id, itemId))
          .run()
      }
    }

    saveDatabase()
    console.log('[addItemTypeServerFn] Success:', itemId, type)
    return { success: true as const }
  })

/**
 * Remove a type from an item
 * Cannot remove the last type (items must have at least one type)
 * If removing the first type (order=0), the next type becomes first
 */
export const removeItemTypeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      itemId: z.string(),
      type: ItemTypeSchema,
    }),
  )
  .handler(async (ctx) => {
    const { itemId, type } = ctx.data
    console.log('[removeItemTypeServerFn] Removing type:', itemId, type)

    initDatabase()
    const db = getDatabase()

    // Verify item exists
    const itemRecord = db.select().from(items).where(eq(items.id, itemId)).get()
    if (!itemRecord) {
      console.log('[removeItemTypeServerFn] Item not found:', itemId)
      return { success: false as const, error: 'Item not found' }
    }

    // Get current types sorted by order
    const currentTypes = db
      .select()
      .from(itemTypes)
      .where(eq(itemTypes.itemId, itemId))
      .all()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    // Cannot remove if only one type
    if (currentTypes.length <= 1) {
      console.log(
        '[removeItemTypeServerFn] Cannot remove last type:',
        itemId,
        type,
      )
      return {
        success: false as const,
        error: 'Cannot remove the last type from an item',
      }
    }

    // Check if type exists
    const typeToRemove = currentTypes.find((t) => t.type === type)
    if (!typeToRemove) {
      console.log('[removeItemTypeServerFn] Type not found:', itemId, type)
      return { success: false as const, error: 'Type not found for item' }
    }

    const isFirstType = (typeToRemove.order ?? 0) === 0

    // Delete the type
    db.delete(itemTypes)
      .where(and(eq(itemTypes.itemId, itemId), eq(itemTypes.type, type)))
      .run()

    // Reorder remaining types to close the gap
    const remainingTypes = currentTypes
      .filter((t) => t.type !== type)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    remainingTypes.forEach((t, index) => {
      db.update(itemTypes)
        .set({ order: index })
        .where(and(eq(itemTypes.itemId, itemId), eq(itemTypes.type, t.type)))
        .run()
    })

    // If we removed the first type, update items.type to new first
    if (isFirstType && remainingTypes.length > 0) {
      const newFirst = remainingTypes[0]
      db.update(items)
        .set({ type: newFirst.type, updatedAt: new Date() })
        .where(eq(items.id, itemId))
        .run()
    } else {
      db.update(items)
        .set({ updatedAt: new Date() })
        .where(eq(items.id, itemId))
        .run()
    }

    saveDatabase()
    console.log('[removeItemTypeServerFn] Success:', itemId, type)
    return { success: true as const }
  })

/**
 * Move a type to the first position (making it the display type)
 * The type must already be assigned to the item
 */
export const setFirstTypeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      itemId: z.string(),
      type: ItemTypeSchema,
    }),
  )
  .handler(async (ctx) => {
    const { itemId, type } = ctx.data
    console.log('[setFirstTypeServerFn] Setting first type:', itemId, type)

    initDatabase()
    const db = getDatabase()

    // Verify item exists
    const itemRecord = db.select().from(items).where(eq(items.id, itemId)).get()
    if (!itemRecord) {
      console.log('[setFirstTypeServerFn] Item not found:', itemId)
      return { success: false as const, error: 'Item not found' }
    }

    // Get all types for this item sorted by order
    const currentTypes = db
      .select()
      .from(itemTypes)
      .where(eq(itemTypes.itemId, itemId))
      .all()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

    // Check if type exists for this item
    const typeToMove = currentTypes.find((t) => t.type === type)
    if (!typeToMove) {
      console.log('[setFirstTypeServerFn] Type not found:', itemId, type)
      return { success: false as const, error: 'Type not assigned to item' }
    }

    // Already first? Nothing to do
    if ((typeToMove.order ?? 0) === 0) {
      return { success: true as const }
    }

    // Reorder: move target to 0, shift others up
    const otherTypes = currentTypes.filter((t) => t.type !== type)

    // Set target type to order 0
    db.update(itemTypes)
      .set({ order: 0 })
      .where(and(eq(itemTypes.itemId, itemId), eq(itemTypes.type, type)))
      .run()

    // Shift other types (order 1, 2, 3, ...)
    otherTypes.forEach((t, index) => {
      db.update(itemTypes)
        .set({ order: index + 1 })
        .where(and(eq(itemTypes.itemId, itemId), eq(itemTypes.type, t.type)))
        .run()
    })

    // Update items.type for backward compatibility
    db.update(items)
      .set({ type, updatedAt: new Date() })
      .where(eq(items.id, itemId))
      .run()

    saveDatabase()
    console.log('[setFirstTypeServerFn] Success:', itemId, type)
    return { success: true as const }
  })

/**
 * @deprecated Use setFirstTypeServerFn instead
 */
export const setPrimaryTypeServerFn = setFirstTypeServerFn
