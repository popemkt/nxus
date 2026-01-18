/**
 * apps-mutations.server.ts - Server functions for modifying apps
 *
 * Provides mutation operations for apps that are stored in SQLite.
 * Supports gradual migration to node-based architecture via feature toggle.
 */

import { NODE_BASED_ARCHITECTURE_ENABLED } from '@/config/feature-flags'
import { getDatabase, initDatabase, saveDatabase } from '@/db/client'
import {
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
} from '@/db/node-schema'
import { items, itemTags } from '@/db/schema'
import type { ItemMetadata } from '@/types/item'
import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import {
  addPropertyValue,
  clearProperty,
  findNodeBySystemId,
  getSystemNode,
  setProperty,
} from '../nodes/node.service'

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
