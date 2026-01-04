import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { initDatabase, saveDatabase } from '@/db/client'
import { tags } from '@/db/schema'
import { eq } from 'drizzle-orm'

// Input schemas
const CreateTagInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  parentId: z.string().nullable().default(null),
  order: z.number().default(0),
  color: z.string().optional(),
  icon: z.string().optional(),
})

const UpdateTagInputSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  parentId: z.string().nullable().optional(),
  order: z.number().optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
})

const DeleteTagInputSchema = z.object({
  id: z.string(),
  cascade: z.boolean().default(false),
})

const MoveTagInputSchema = z.object({
  id: z.string(),
  newParentId: z.string().nullable(),
  newOrder: z.number(),
})

/**
 * Create a new tag in SQLite
 */
export const createTagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(CreateTagInputSchema)
  .handler(async (ctx) => {
    console.log('[createTagServerFn] Input:', ctx.data)
    const db = await initDatabase()
    const now = new Date()

    await db.insert(tags).values({
      id: ctx.data.id,
      name: ctx.data.name,
      parentId: ctx.data.parentId,
      order: ctx.data.order,
      color: ctx.data.color ?? null,
      icon: ctx.data.icon ?? null,
      createdAt: now,
      updatedAt: now,
    })

    saveDatabase()
    console.log('[createTagServerFn] Success:', ctx.data.id)

    return { success: true, id: ctx.data.id }
  })

/**
 * Update an existing tag in SQLite
 */
export const updateTagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(UpdateTagInputSchema)
  .handler(async (ctx) => {
    console.log('[updateTagServerFn] Input:', ctx.data)
    const db = await initDatabase()
    const { id, ...updates } = ctx.data

    await db
      .update(tags)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, id))

    saveDatabase()
    console.log('[updateTagServerFn] Success:', id)

    return { success: true }
  })

/**
 * Delete a tag from SQLite
 */
export const deleteTagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(DeleteTagInputSchema)
  .handler(async (ctx) => {
    console.log('[deleteTagServerFn] Input:', ctx.data)
    const db = await initDatabase()

    // TODO: Handle cascade deletion of children

    await db.delete(tags).where(eq(tags.id, ctx.data.id))

    saveDatabase()
    console.log('[deleteTagServerFn] Success:', ctx.data.id)

    return { success: true }
  })

/**
 * Move a tag (change parent and/or order) in SQLite
 */
export const moveTagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(MoveTagInputSchema)
  .handler(async (ctx) => {
    console.log('[moveTagServerFn] Received:', ctx.data)

    const db = await initDatabase()

    const result = await db
      .update(tags)
      .set({
        parentId: ctx.data.newParentId,
        order: ctx.data.newOrder,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, ctx.data.id))

    console.log('[moveTagServerFn] Update result:', result)

    saveDatabase()
    console.log('[moveTagServerFn] Database saved')

    return { success: true }
  })

/**
 * Get all tags from SQLite
 */
export const getTagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    console.log('[getTagsServerFn] Fetching all tags')
    const db = await initDatabase()
    const allTags = await db.select().from(tags)
    console.log('[getTagsServerFn] Found:', allTags.length)
    return { success: true, data: allTags }
  },
)
