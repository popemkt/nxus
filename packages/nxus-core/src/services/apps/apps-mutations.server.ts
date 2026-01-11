/**
 * apps-mutations.server.ts - Server functions for modifying apps
 *
 * Provides mutation operations for apps that are stored in SQLite.
 * Separated from apps.server.ts which handles read operations.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { initDatabase, getDatabase, saveDatabase } from '@/db/client'
import { apps, appTags, tags } from '@/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import type { AppMetadata } from '@/types/app'

/**
 * Update an app's tags
 * Updates BOTH the metadata.tags array in the apps table AND the app_tags junction table
 */
export const updateAppTagsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      appId: z.string(),
      tags: z.array(z.string()),
    }),
  )
  .handler(async (ctx) => {
    console.log(
      '[updateAppTagsServerFn] Updating:',
      ctx.data.appId,
      ctx.data.tags,
    )

    await initDatabase()
    const db = getDatabase()

    // 1. Get current app
    const appRecord = db
      .select()
      .from(apps)
      .where(eq(apps.id, ctx.data.appId))
      .get()

    if (!appRecord) {
      console.log('[updateAppTagsServerFn] App not found:', ctx.data.appId)
      return { success: false as const, error: 'App not found' }
    }

    // 2. Resolve tag slugs to IDs
    const tagSlugs = ctx.data.tags
    let tagIds: number[] = []

    if (tagSlugs.length > 0) {
      const resolvedTags = await db
        .select({ id: tags.id })
        .from(tags)
        .where(inArray(tags.slug, tagSlugs))
        .all()
      tagIds = resolvedTags.map((t) => t.id)
    }

    // 3. Update junction table
    // Delete existing links
    await db.delete(appTags).where(eq(appTags.appId, ctx.data.appId)).run()

    // Insert new links
    if (tagIds.length > 0) {
      for (const tagId of tagIds) {
        await db
          .insert(appTags)
          .values({
            appId: ctx.data.appId,
            tagId: tagId,
          })
          .run()
      }
    }

    // 4. Update JSON metadata in apps table (for backward compatibility)
    const currentMetadata: AppMetadata = appRecord.metadata
      ? JSON.parse(appRecord.metadata)
      : { tags: [], category: 'uncategorized', createdAt: '', updatedAt: '' }

    const updatedMetadata: AppMetadata = {
      ...currentMetadata,
      tags: tagSlugs,
      updatedAt: new Date().toISOString(),
    }

    db.update(apps)
      .set({
        metadata: JSON.stringify(updatedMetadata),
        updatedAt: new Date(),
      })
      .where(eq(apps.id, ctx.data.appId))
      .run()

    saveDatabase()
    console.log('[updateAppTagsServerFn] Success:', ctx.data.appId)

    return { success: true as const, data: { tags: tagSlugs } }
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

    await initDatabase()
    const db = getDatabase()

    const appRecord = db
      .select()
      .from(apps)
      .where(eq(apps.id, ctx.data.appId))
      .get()

    if (!appRecord) {
      return { success: false as const, error: 'App not found' }
    }

    const currentMetadata: AppMetadata = appRecord.metadata
      ? JSON.parse(appRecord.metadata)
      : { tags: [], category: 'uncategorized', createdAt: '', updatedAt: '' }

    const updatedMetadata: AppMetadata = {
      ...currentMetadata,
      category: ctx.data.category,
      updatedAt: new Date().toISOString(),
    }

    db.update(apps)
      .set({
        metadata: JSON.stringify(updatedMetadata),
        updatedAt: new Date(),
      })
      .where(eq(apps.id, ctx.data.appId))
      .run()

    saveDatabase()
    console.log('[updateAppCategoryServerFn] Success:', ctx.data.appId)

    return { success: true as const }
  })
