/**
 * apps.server.ts - Server functions for loading apps
 *
 * Delegates to node-based or graph-based architecture.
 * Legacy table paths have been removed.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { isGraphArchitecture } from '../../config/feature-flags'

/**
 * Get all apps
 * Uses graph or node-based queries
 */
export const getAllAppsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    if (isGraphArchitecture()) {
      console.log('[getAllAppsServerFn] Using graph architecture (SurrealDB)')
      const { getAllItemsFromGraphServerFn } = await import(
        '../graph/graph.server'
      )
      const result = await getAllItemsFromGraphServerFn()
      if (result.success) {
        return { success: true as const, apps: result.items }
      }
      return {
        success: false as const,
        error: result.error || 'Graph query failed',
      }
    }

    // Node-based architecture (default)
    console.log('[getAllAppsServerFn] Using node-based architecture')
    const { getAllItemsFromNodesServerFn } = await import(
      './node-items.server'
    )
    const result = await getAllItemsFromNodesServerFn()
    if (result.success) {
      return { success: true as const, apps: result.items }
    }
    return { success: false as const, error: 'Node query failed' }
  },
)

const GetAppByIdSchema = z.object({
  id: z.string(),
})

/**
 * Get a single app by ID
 * Uses graph or node-based queries
 */
export const getAppByIdServerFn = createServerFn({ method: 'GET' })
  .inputValidator(GetAppByIdSchema)
  .handler(async (ctx) => {
    const { id } = ctx.data

    if (isGraphArchitecture()) {
      // TODO: implement graph getItemById if needed
      return { success: false as const, error: 'Graph getById not implemented' }
    }

    // Node-based architecture (default)
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
