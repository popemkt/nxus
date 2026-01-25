/**
 * tag.server.ts - Server functions for tag CRUD operations
 *
 * Supports gradual migration to node-based architecture via feature toggle.
 */

import { NODE_BASED_ARCHITECTURE_ENABLED } from '@/config/feature-flags'
import {
  getDatabase,
  initDatabase,
  saveDatabase,
  nodeProperties,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  tags,
  clearProperty,
  createNode,
  deleteNode,
  findNodeBySystemId,
  getNodesBySupertagWithInheritance,
  getProperty,
  getSystemNode,
  setProperty,
  updateNodeContent,
} from '@nxus/db/server'
import { createServerFn } from '@tanstack/react-start'
import { eq } from '@nxus/db/server'
import { z } from 'zod'

// Input schemas
const CreateTagInputSchema = z.object({
  name: z.string().min(1),
  parentId: z.number().nullable().default(null),
  order: z.number().default(0),
  color: z.string().optional(),
  icon: z.string().optional(),
})

const UpdateTagInputSchema = z.object({
  id: z.number(),
  name: z.string().min(1).optional(),
  parentId: z.number().nullable().optional(),
  order: z.number().optional(),
  color: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
})

const DeleteTagInputSchema = z.object({
  id: z.number(),
  cascade: z.boolean().default(false),
})

const MoveTagInputSchema = z.object({
  id: z.number(),
  newParentId: z.number().nullable(),
  newOrder: z.number(),
})

// ============================================================================
// Node helpers
// ============================================================================

function findTagNodeByLegacyId(
  db: ReturnType<typeof getDatabase>,
  legacyId: number,
): string | null {
  const legacyIdField = getSystemNode(db, SYSTEM_FIELDS.LEGACY_ID)
  if (!legacyIdField) return null

  const prop = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.fieldNodeId, legacyIdField.id))
    .all()
    .find((p) => {
      try {
        return JSON.parse(p.value || '') === legacyId
      } catch {
        return false
      }
    })

  return prop?.nodeId ?? null
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Create a new tag
 */
export const createTagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(CreateTagInputSchema)
  .handler(async (ctx) => {
    console.log('[createTagServerFn] Input:', ctx.data)
    const db = initDatabase()
    const now = new Date()

    // Feature toggle: create in nodes
    if (NODE_BASED_ARCHITECTURE_ENABLED) {
      console.log('[createTagServerFn] Using node-based architecture')

      const nodeId = createNode(db, {
        content: ctx.data.name,
        supertagSystemId: SYSTEM_SUPERTAGS.TAG,
      })

      if (ctx.data.color)
        setProperty(db, nodeId, SYSTEM_FIELDS.COLOR, ctx.data.color)
      if (ctx.data.icon)
        setProperty(db, nodeId, SYSTEM_FIELDS.ICON, ctx.data.icon)

      // Handle parent reference (need to find parent node by legacy ID)
      if (ctx.data.parentId) {
        const parentNodeId = findTagNodeByLegacyId(db, ctx.data.parentId)
        if (parentNodeId) {
          setProperty(db, nodeId, SYSTEM_FIELDS.PARENT, parentNodeId)
        }
      }

      saveDatabase()
      // Return a synthetic ID for backwards compat (node system uses UUIDs)
      return { success: true, id: -1, nodeId }
    }

    // Legacy: insert into tags table
    const result = await db
      .insert(tags)
      .values({
        name: ctx.data.name,
        parentId: ctx.data.parentId,
        order: ctx.data.order,
        color: ctx.data.color ?? null,
        icon: ctx.data.icon ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: tags.id })

    saveDatabase()
    const newId = result[0]?.id
    console.log('[createTagServerFn] Success, new ID:', newId)
    return { success: true, id: newId }
  })

/**
 * Update an existing tag
 */
export const updateTagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(UpdateTagInputSchema)
  .handler(async (ctx) => {
    console.log('[updateTagServerFn] Input:', ctx.data)
    const db = initDatabase()
    const { id, ...updates } = ctx.data

    // Feature toggle: update in nodes
    if (NODE_BASED_ARCHITECTURE_ENABLED) {
      console.log('[updateTagServerFn] Using node-based architecture')
      const nodeId = findTagNodeByLegacyId(db, id)
      if (!nodeId) {
        return { success: false, error: 'Tag node not found' }
      }

      if (updates.name) updateNodeContent(db, nodeId, updates.name)
      if (updates.color !== undefined) {
        if (updates.color)
          setProperty(db, nodeId, SYSTEM_FIELDS.COLOR, updates.color)
        else clearProperty(db, nodeId, SYSTEM_FIELDS.COLOR)
      }
      if (updates.icon !== undefined) {
        if (updates.icon)
          setProperty(db, nodeId, SYSTEM_FIELDS.ICON, updates.icon)
        else clearProperty(db, nodeId, SYSTEM_FIELDS.ICON)
      }
      if (updates.parentId !== undefined) {
        if (updates.parentId) {
          const parentNodeId = findTagNodeByLegacyId(db, updates.parentId)
          if (parentNodeId)
            setProperty(db, nodeId, SYSTEM_FIELDS.PARENT, parentNodeId)
        } else {
          clearProperty(db, nodeId, SYSTEM_FIELDS.PARENT)
        }
      }

      saveDatabase()
      return { success: true }
    }

    // Legacy: update tags table
    await db
      .update(tags)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(tags.id, id))

    saveDatabase()
    console.log('[updateTagServerFn] Success:', id)
    return { success: true }
  })

/**
 * Delete a tag
 */
export const deleteTagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(DeleteTagInputSchema)
  .handler(async (ctx) => {
    console.log('[deleteTagServerFn] Input:', ctx.data)
    const db = initDatabase()

    // Feature toggle: delete from nodes
    if (NODE_BASED_ARCHITECTURE_ENABLED) {
      console.log('[deleteTagServerFn] Using node-based architecture')
      const nodeId = findTagNodeByLegacyId(db, ctx.data.id)
      if (nodeId) {
        deleteNode(db, nodeId)
        // TODO: Handle cascade deletion of children
      }
      saveDatabase()
      return { success: true }
    }

    // Legacy: delete from tags table
    await db.delete(tags).where(eq(tags.id, ctx.data.id))
    saveDatabase()
    console.log('[deleteTagServerFn] Success:', ctx.data.id)
    return { success: true }
  })

/**
 * Move a tag (change parent and/or order)
 */
export const moveTagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(MoveTagInputSchema)
  .handler(async (ctx) => {
    console.log('[moveTagServerFn] Received:', ctx.data)
    const db = initDatabase()

    // Feature toggle: move in nodes
    if (NODE_BASED_ARCHITECTURE_ENABLED) {
      console.log('[moveTagServerFn] Using node-based architecture')
      const nodeId = findTagNodeByLegacyId(db, ctx.data.id)
      if (!nodeId) {
        return { success: false, error: 'Tag node not found' }
      }

      if (ctx.data.newParentId) {
        const parentNodeId = findTagNodeByLegacyId(db, ctx.data.newParentId)
        if (parentNodeId)
          setProperty(db, nodeId, SYSTEM_FIELDS.PARENT, parentNodeId)
      } else {
        clearProperty(db, nodeId, SYSTEM_FIELDS.PARENT)
      }
      // Note: order is not tracked in nodes currently

      saveDatabase()
      return { success: true }
    }

    // Legacy: update tags table
    await db
      .update(tags)
      .set({
        parentId: ctx.data.newParentId,
        order: ctx.data.newOrder,
        updatedAt: new Date(),
      })
      .where(eq(tags.id, ctx.data.id))

    saveDatabase()
    console.log('[moveTagServerFn] Database saved')
    return { success: true }
  })

/**
 * Get all tags
 */
export const getTagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    console.log('[getTagsServerFn] Fetching all tags')
    const db = initDatabase()

    // Feature toggle: get from nodes
    if (NODE_BASED_ARCHITECTURE_ENABLED) {
      console.log('[getTagsServerFn] Using node-based architecture')
      const tagNodes = getNodesBySupertagWithInheritance(
        db,
        SYSTEM_SUPERTAGS.TAG,
      )

      const nodeIdToLegacyId = new Map<string, number>()
      for (const node of tagNodes) {
        const legacyId = getProperty<number>(node, 'legacyId')
        if (legacyId) nodeIdToLegacyId.set(node.id, legacyId)
      }

      const data = tagNodes.map((node) => ({
        id: getProperty<number>(node, 'legacyId') || 0,
        name: node.content || '',
        parentId: (() => {
          const parentNodeId = getProperty<string>(node, 'parent')
          return parentNodeId
            ? (nodeIdToLegacyId.get(parentNodeId) ?? null)
            : null
        })(),
        order: 0,
        color: getProperty<string>(node, 'color') ?? null,
        icon: getProperty<string>(node, 'icon') ?? null,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      }))

      return { success: true, data }
    }

    // Legacy: get from tags table
    const allTags = await db.select().from(tags)
    console.log('[getTagsServerFn] Found:', allTags.length)
    return { success: true, data: allTags }
  },
)

/**
 * Get a tag by ID
 */
export const getTagByIdServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.number() }))
  .handler(async (ctx) => {
    const db = initDatabase()

    // Feature toggle: get from nodes
    if (NODE_BASED_ARCHITECTURE_ENABLED) {
      const nodeId = findTagNodeByLegacyId(db, ctx.data.id)
      if (!nodeId) {
        return { success: false as const, error: 'Tag not found' }
      }
      const node = findNodeBySystemId(db, nodeId)
      if (!node) {
        return { success: false as const, error: 'Tag not found' }
      }
      return {
        success: true as const,
        data: {
          id: ctx.data.id,
          name: node.content || '',
          parentId: null, // Would need to resolve
          order: 0,
          color: getProperty<string>(node, 'color') ?? null,
          icon: getProperty<string>(node, 'icon') ?? null,
          createdAt: node.createdAt,
          updatedAt: node.updatedAt,
        },
      }
    }

    // Legacy
    const tag = await db
      .select()
      .from(tags)
      .where(eq(tags.id, ctx.data.id))
      .get()
    if (!tag) {
      return { success: false as const, error: 'Tag not found' }
    }
    return { success: true as const, data: tag }
  })
