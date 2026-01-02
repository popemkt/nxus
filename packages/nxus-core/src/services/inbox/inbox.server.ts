import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { initDatabase, saveDatabase } from '@/db/client'
import { inboxItems, type InboxItem } from '@/db/schema'
import { eq, desc } from 'drizzle-orm'

/**
 * Get all inbox items
 */
export const getInboxItemsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const db = await initDatabase()
    const items = await db
      .select()
      .from(inboxItems)
      .orderBy(desc(inboxItems.createdAt))
    return { success: true, data: items }
  },
)

/**
 * Get pending inbox items only
 */
export const getPendingInboxItemsServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const db = await initDatabase()
  const items = await db
    .select()
    .from(inboxItems)
    .where(eq(inboxItems.status, 'pending'))
    .orderBy(desc(inboxItems.createdAt))
  return { success: true, data: items }
})

/**
 * Add a new inbox item
 */
export const addInboxItemServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      title: z.string().min(1),
      notes: z.string().optional(),
    }),
  )
  .handler(async (ctx) => {
    const { title, notes } = ctx.data
    const db = await initDatabase()
    const now = new Date()

    const result = await db
      .insert(inboxItems)
      .values({
        title,
        notes: notes ?? null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    saveDatabase()
    return { success: true, data: result[0] }
  })

/**
 * Update an inbox item
 */
export const updateInboxItemServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.number(),
      title: z.string().min(1).optional(),
      notes: z.string().optional(),
      status: z.enum(['pending', 'processing', 'done']).optional(),
    }),
  )
  .handler(async (ctx) => {
    const { id, ...updates } = ctx.data
    const db = await initDatabase()

    const result = await db
      .update(inboxItems)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(inboxItems.id, id))
      .returning()

    if (result.length === 0) {
      return { success: false as const, error: 'Item not found' }
    }

    saveDatabase()
    return { success: true as const, data: result[0] }
  })

/**
 * Delete an inbox item
 */
export const deleteInboxItemServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async (ctx) => {
    const { id } = ctx.data
    const db = await initDatabase()

    const result = await db
      .delete(inboxItems)
      .where(eq(inboxItems.id, id))
      .returning()

    if (result.length === 0) {
      return { success: false as const, error: 'Item not found' }
    }

    saveDatabase()
    return { success: true as const }
  })

/**
 * Mark item as processing (when add-item workflow starts)
 */
export const markAsProcessingServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async (ctx) => {
    const db = await initDatabase()
    const result = await db
      .update(inboxItems)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(inboxItems.id, ctx.data.id))
      .returning()

    saveDatabase()
    return { success: true, data: result[0] }
  })

/**
 * Mark item as done (when add-item workflow completes)
 */
export const markAsDoneServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async (ctx) => {
    const db = await initDatabase()
    const result = await db
      .update(inboxItems)
      .set({ status: 'done', updatedAt: new Date() })
      .where(eq(inboxItems.id, ctx.data.id))
      .returning()

    saveDatabase()
    return { success: true, data: result[0] }
  })

export type { InboxItem }
