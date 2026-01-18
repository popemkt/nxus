import { initDatabase, saveDatabase } from '@/db/client'
import { inbox, type InboxEntry } from '@/db/schema'
import { createServerFn } from '@tanstack/react-start'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'

/**
 * Get all inbox items
 */
export const getInboxItemsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    console.log('[getInboxItemsServerFn] Fetching all items')
    const db = initDatabase()
    const items = await db.select().from(inbox).orderBy(desc(inbox.createdAt))
    console.log('[getInboxItemsServerFn] Found:', items.length)
    return { success: true, data: items }
  },
)

/**
 * Get pending inbox items only
 */
export const getPendingInboxItemsServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  console.log('[getPendingInboxItemsServerFn] Fetching pending items')
  const db = await initDatabase()
  const items = await db
    .select()
    .from(inbox)
    .where(eq(inbox.status, 'pending'))
    .orderBy(desc(inbox.createdAt))
  console.log('[getPendingInboxItemsServerFn] Found:', items.length)
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
    console.log('[addInboxItemServerFn] Input:', ctx.data)
    const { title, notes } = ctx.data
    const db = initDatabase()
    const now = new Date()

    const result = await db
      .insert(inbox)
      .values({
        title,
        notes: notes ?? null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      })
      .returning()

    saveDatabase()
    console.log('[addInboxItemServerFn] Success:', result[0].id)
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
    console.log('[updateInboxItemServerFn] Input:', ctx.data)
    const { id, ...updates } = ctx.data
    const db = initDatabase()

    const result = await db
      .update(inbox)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(inbox.id, id))
      .returning()

    if (result.length === 0) {
      console.log('[updateInboxItemServerFn] Not found:', id)
      return { success: false as const, error: 'Item not found' }
    }

    saveDatabase()
    console.log('[updateInboxItemServerFn] Success:', id)
    return { success: true as const, data: result[0] }
  })

/**
 * Delete an inbox item
 */
export const deleteInboxItemServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async (ctx) => {
    console.log('[deleteInboxItemServerFn] Input:', ctx.data)
    const { id } = ctx.data
    const db = initDatabase()

    const result = await db.delete(inbox).where(eq(inbox.id, id)).returning()

    if (result.length === 0) {
      console.log('[deleteInboxItemServerFn] Not found:', id)
      return { success: false as const, error: 'Item not found' }
    }

    saveDatabase()
    console.log('[deleteInboxItemServerFn] Success:', id)
    return { success: true as const }
  })

/**
 * Mark item as processing (when add-item workflow starts)
 */
export const markAsProcessingServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async (ctx) => {
    console.log('[markAsProcessingServerFn] Input:', ctx.data)
    const db = initDatabase()
    const result = await db
      .update(inbox)
      .set({ status: 'processing', updatedAt: new Date() })
      .where(eq(inbox.id, ctx.data.id))
      .returning()

    saveDatabase()
    console.log('[markAsProcessingServerFn] Success:', ctx.data.id)
    return { success: true, data: result[0] }
  })

/**
 * Mark item as done (when add-item workflow completes)
 */
export const markAsDoneServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async (ctx) => {
    console.log('[markAsDoneServerFn] Input:', ctx.data)
    const db = initDatabase()
    const result = await db
      .update(inbox)
      .set({ status: 'done', updatedAt: new Date() })
      .where(eq(inbox.id, ctx.data.id))
      .returning()

    saveDatabase()
    console.log('[markAsDoneServerFn] Success:', ctx.data.id)
    return { success: true, data: result[0] }
  })

export type InboxItem = InboxEntry
export type { InboxEntry }
