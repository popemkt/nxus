/**
 * apps-mutations.server.ts - Server functions for modifying apps
 *
 * Provides mutation operations for apps that are stored in SQLite.
 * Separated from apps.server.ts which handles read operations.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { initDatabase, getDatabase, saveDatabase } from '@/db/client'
import { apps } from '@/db/schema'
import { eq } from 'drizzle-orm'
import type { AppMetadata } from '@/types/app'

/**
 * Update an app's tags
 * Updates the metadata.tags array in the apps table
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

    // Get current app
    const appRecord = db
      .select()
      .from(apps)
      .where(eq(apps.id, ctx.data.appId))
      .get()

    if (!appRecord) {
      console.log('[updateAppTagsServerFn] App not found:', ctx.data.appId)
      return { success: false as const, error: 'App not found' }
    }

    // Parse current metadata
    const currentMetadata: AppMetadata = appRecord.metadata
      ? JSON.parse(appRecord.metadata)
      : { tags: [], category: 'uncategorized', createdAt: '', updatedAt: '' }

    // Update tags
    const updatedMetadata: AppMetadata = {
      ...currentMetadata,
      tags: ctx.data.tags,
      updatedAt: new Date().toISOString(),
    }

    // Save
    db.update(apps)
      .set({
        metadata: JSON.stringify(updatedMetadata),
        updatedAt: new Date(),
      })
      .where(eq(apps.id, ctx.data.appId))
      .run()

    saveDatabase()
    console.log('[updateAppTagsServerFn] Success:', ctx.data.appId)

    return { success: true as const, data: { tags: ctx.data.tags } }
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
