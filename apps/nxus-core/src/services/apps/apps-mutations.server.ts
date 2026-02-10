/**
 * apps-mutations.server.ts - Server functions for modifying apps
 *
 * Uses node-based architecture exclusively. Legacy table paths removed.
 */

import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  addPropertyValue,
  clearProperty,
  eq,
  findNodeBySystemId,
  getDatabase,
  getSystemNode,
  initDatabase,
  nodeProperties,
  nodes,
  saveDatabase,
  setProperty
} from '@nxus/db/server'
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
  tagNames: Array<string>,
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
 * Update an app's tags via node-based architecture
 */
export const updateAppTagsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      appId: z.string(),
      tags: z.array(
        z.object({
          id: z.string(),
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

    const tagNames = tagRefs.map((t) => t.name)
    const success = updateItemNodeTags(db, `item:${appId}`, tagNames)
    if (!success) {
      return { success: false as const, error: 'Item node not found' }
    }
    saveDatabase()
    return { success: true as const, data: { tags: tagRefs } }
  })

/**
 * Update an app's category via node-based architecture
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

    const success = updateItemNodeCategory(db, `item:${appId}`, category)
    if (!success) {
      return { success: false as const, error: 'Item node not found' }
    }
    saveDatabase()
    return { success: true as const }
  })
