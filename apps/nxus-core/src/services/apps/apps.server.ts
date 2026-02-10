/**
 * apps.server.ts - Server functions for loading apps
 *
 * Delegates to node-items.server.ts which uses the NodeFacade.
 * The facade handles backend selection (SQLite vs SurrealDB) internally.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

/**
 * Get all apps
 */
export const getAllAppsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getAllItemsFromNodesServerFn } = await import(
      './node-items.server'
    )
    const result = await getAllItemsFromNodesServerFn()
    if (result.success) {
      return { success: true as const, apps: result.items }
    }
    return { success: false as const, error: 'Query failed' }
  },
)

const GetAppByIdSchema = z.object({
  id: z.string(),
})

/**
 * Get a single app by ID
 */
export const getAppByIdServerFn = createServerFn({ method: 'GET' })
  .inputValidator(GetAppByIdSchema)
  .handler(async (ctx) => {
    const { id } = ctx.data

    const { getItemByIdFromNodesServerFn } = await import(
      './node-items.server'
    )
    const result = await getItemByIdFromNodesServerFn({ data: { id } })
    if (result.success) {
      return { success: true as const, app: result.item }
    }
    return {
      success: false as const,
      error: result.error || 'Item not found',
    }
  })

/**
 * Get all categories from apps
 */
export const getCategoriesServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    // Delegate to getAllAppsServerFn and extract categories
    const result = await getAllAppsServerFn()
    if (!result.success) {
      return { success: true as const, categories: [] }
    }

    const categories = new Set<string>()
    for (const app of result.apps) {
      if (app.metadata?.category) {
        categories.add(app.metadata.category)
      }
    }

    return { success: true as const, categories: Array.from(categories).sort() }
  },
)

/**
 * Get all tags from apps
 */
export const getTagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    // Delegate to getAllAppsServerFn and extract tags
    const result = await getAllAppsServerFn()
    if (!result.success) {
      return { success: true as const, tags: [] }
    }

    const allTags = new Set<string>()
    for (const app of result.apps) {
      if (app.metadata?.tags) {
        for (const tag of app.metadata.tags) {
          allTags.add(tag.name)
        }
      }
    }

    return { success: true as const, tags: Array.from(allTags).sort() }
  },
)
