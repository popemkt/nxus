/**
 * apps-mutations.server.ts - Server functions for modifying apps
 *
 * Provides mutation operations for apps that are stored in SQLite.
 * Separated from apps.server.ts which handles read operations.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { initDatabase, getDatabase, saveDatabase } from '@/db/client'
import { items, itemTags } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { AppMetadata, TagRef } from '@/types/app'

/**
 * Update an app's tags
 * Updates BOTH the metadata.tags array in the apps table AND the app_tags junction table
 * Now accepts tag objects with id and name instead of slug strings
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
    console.log(
      '[updateAppTagsServerFn] Updating:',
      ctx.data.appId,
      ctx.data.tags,
    )

    initDatabase()
    const db = getDatabase()

    // 1. Get current app
    const appRecord = db
      .select()
      .from(items)
      .where(eq(items.id, ctx.data.appId))
      .get()

    if (!appRecord) {
      console.log('[updateAppTagsServerFn] App not found:', ctx.data.appId)
      return { success: false as const, error: 'App not found' }
    }

    // 2. Get tag IDs directly from input
    const tagRefs = ctx.data.tags
    const tagIds = tagRefs.map((t) => t.id)

    // 3. Update junction table (this is now the ONLY source of truth for tags)
    // Delete existing links
    await db.delete(itemTags).where(eq(itemTags.appId, ctx.data.appId)).run()

    // Insert new links
    if (tagIds.length > 0) {
      for (const tagId of tagIds) {
        await db
          .insert(itemTags)
          .values({
            appId: ctx.data.appId,
            tagId: tagId,
          })
          .run()
      }
    }

    // 4. Update updatedAt in apps table (but NOT metadata.tags - that's deprecated)
    db.update(items)
      .set({
        updatedAt: new Date(),
      })
      .where(eq(items.id, ctx.data.appId))
      .run()

    saveDatabase()
    console.log('[updateAppTagsServerFn] Success:', ctx.data.appId)

    return { success: true as const, data: { tags: tagRefs } }
  })

/**
 * Update an app's category
 */
export const updateAppCategoryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      appId: z.string(),
      category: z.string(),
    }),
  )
  .handler(async (ctx) => {
    console.log('[updateAppCategoryServerFn] Updating:', ctx.data.appId)

    initDatabase()
    const db = getDatabase()

    const appRecord = db
      .select()
      .from(items)
      .where(eq(items.id, ctx.data.appId))
      .get()

    if (!appRecord) {
      return { success: false as const, error: 'App not found' }
    }

    // Note: Drizzle json() column already returns parsed object, no need to JSON.parse
    const currentMetadata: AppMetadata =
      (appRecord.metadata as AppMetadata) || {
        tags: [],
        category: 'uncategorized',
        createdAt: '',
        updatedAt: '',
      }

    const updatedMetadata: AppMetadata = {
      ...currentMetadata,
      category: ctx.data.category,
      updatedAt: new Date().toISOString(),
    }

    db.update(items)
      .set({
        metadata: JSON.stringify(updatedMetadata),
        updatedAt: new Date(),
      })
      .where(eq(items.id, ctx.data.appId))
      .run()

    saveDatabase()
    console.log('[updateAppCategoryServerFn] Success:', ctx.data.appId)

    return { success: true as const }
  })
