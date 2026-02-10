/**
 * apps-mutations.server.ts - Server functions for modifying apps
 *
 * Uses the NodeFacade for all node operations.
 */

import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  nodeFacade,
} from '@nxus/db/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// ============================================================================
// Node-based write helpers
// ============================================================================

/**
 * Find tag node by name and return its UUID
 */
async function findTagNodeByName(tagName: string): Promise<string | null> {
  const tagNodes = await nodeFacade.getNodesBySupertagWithInheritance(
    SYSTEM_SUPERTAGS.TAG,
  )
  const tagNode = tagNodes.find((n) => n.content === tagName)
  return tagNode?.id ?? null
}

/**
 * Update tags on item node
 */
async function updateItemNodeTags(
  itemSystemId: string,
  tagNames: Array<string>,
): Promise<boolean> {
  const itemNode = await nodeFacade.findNodeBySystemId(itemSystemId)
  if (!itemNode) return false

  // Clear existing tags
  await nodeFacade.clearProperty(itemNode.id, SYSTEM_FIELDS.TAGS)

  // Add new tags
  for (const tagName of tagNames) {
    const tagNodeId = await findTagNodeByName(tagName)
    if (tagNodeId) {
      await nodeFacade.addPropertyValue(itemNode.id, SYSTEM_FIELDS.TAGS, tagNodeId)
    }
  }
  return true
}

/**
 * Update category on item node
 */
async function updateItemNodeCategory(
  itemSystemId: string,
  category: string,
): Promise<boolean> {
  const itemNode = await nodeFacade.findNodeBySystemId(itemSystemId)
  if (!itemNode) return false

  await nodeFacade.setProperty(itemNode.id, SYSTEM_FIELDS.CATEGORY, category)
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

    await nodeFacade.init()

    const tagNames = tagRefs.map((t) => t.name)
    const success = await updateItemNodeTags(`item:${appId}`, tagNames)
    if (!success) {
      return { success: false as const, error: 'Item node not found' }
    }
    await nodeFacade.save()
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

    await nodeFacade.init()

    const success = await updateItemNodeCategory(`item:${appId}`, category)
    if (!success) {
      return { success: false as const, error: 'Item node not found' }
    }
    await nodeFacade.save()
    return { success: true as const }
  })
