/**
 * tag.server.ts - Server functions for tag CRUD operations
 *
 * Tags are nodes in the node-based architecture.
 * IDs are node UUIDs (strings).
 */

import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  clearProperty,
  createNode,
  deleteNode,
  findNodeBySystemId,
  getNodesBySupertagWithInheritance,
  getProperty,
  initDatabase,
  setProperty,
  updateNodeContent,
} from '@nxus/db/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// Input schemas
const CreateTagInputSchema = z.object({
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

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Create a new tag (node with TAG supertag)
 */
export const createTagServerFn = createServerFn({ method: 'POST' })
  .inputValidator(CreateTagInputSchema)
  .handler(async (ctx) => {
    console.log('[createTagServerFn] Input:', ctx.data)
    const db = initDatabase()

    const nodeId = createNode(db, {
      content: ctx.data.name,
      supertagSystemId: SYSTEM_SUPERTAGS.TAG,
    })

    if (ctx.data.color)
      setProperty(db, nodeId, SYSTEM_FIELDS.COLOR, ctx.data.color)
    if (ctx.data.icon)
      setProperty(db, nodeId, SYSTEM_FIELDS.ICON, ctx.data.icon)
    if (ctx.data.parentId) {
      setProperty(db, nodeId, SYSTEM_FIELDS.PARENT, ctx.data.parentId)
    }
    if (ctx.data.order !== undefined) {
      setProperty(db, nodeId, SYSTEM_FIELDS.ORDER, ctx.data.order)
    }

    console.log('[createTagServerFn] Created node:', nodeId)
    return { success: true, id: nodeId }
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

    const node = findNodeBySystemId(db, id)
    if (!node) {
      return { success: false, error: 'Tag node not found' }
    }

    if (updates.name) updateNodeContent(db, id, updates.name)
    if (updates.color !== undefined) {
      if (updates.color)
        setProperty(db, id, SYSTEM_FIELDS.COLOR, updates.color)
      else clearProperty(db, id, SYSTEM_FIELDS.COLOR)
    }
    if (updates.icon !== undefined) {
      if (updates.icon)
        setProperty(db, id, SYSTEM_FIELDS.ICON, updates.icon)
      else clearProperty(db, id, SYSTEM_FIELDS.ICON)
    }
    if (updates.parentId !== undefined) {
      if (updates.parentId) {
        setProperty(db, id, SYSTEM_FIELDS.PARENT, updates.parentId)
      } else {
        clearProperty(db, id, SYSTEM_FIELDS.PARENT)
      }
    }
    if (updates.order !== undefined) {
      setProperty(db, id, SYSTEM_FIELDS.ORDER, updates.order)
    }

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

    deleteNode(db, ctx.data.id)
    // TODO: Handle cascade deletion of children

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

    if (ctx.data.newParentId) {
      setProperty(db, ctx.data.id, SYSTEM_FIELDS.PARENT, ctx.data.newParentId)
    } else {
      clearProperty(db, ctx.data.id, SYSTEM_FIELDS.PARENT)
    }

    setProperty(db, ctx.data.id, SYSTEM_FIELDS.ORDER, ctx.data.newOrder)

    return { success: true }
  })

/**
 * Get all tags
 */
export const getTagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    console.log('[getTagsServerFn] Fetching all tags')
    const db = initDatabase()

    const tagNodes = getNodesBySupertagWithInheritance(
      db,
      SYSTEM_SUPERTAGS.TAG,
    )

    const data = tagNodes.map((node) => ({
      id: node.id,
      name: node.content || '',
      parentId: getProperty<string>(node, SYSTEM_FIELDS.PARENT) ?? null,
      order: getProperty<number>(node, SYSTEM_FIELDS.ORDER) ?? 0,
      color: getProperty<string>(node, SYSTEM_FIELDS.COLOR) ?? null,
      icon: getProperty<string>(node, SYSTEM_FIELDS.ICON) ?? null,
      createdAt: node.createdAt,
      updatedAt: node.updatedAt,
    }))

    return { success: true, data }
  },
)

/**
 * Get a tag by ID
 */
export const getTagByIdServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    const db = initDatabase()

    const node = findNodeBySystemId(db, ctx.data.id)
    if (!node) {
      return { success: false as const, error: 'Tag not found' }
    }

    return {
      success: true as const,
      data: {
        id: node.id,
        name: node.content || '',
        parentId: getProperty<string>(node, SYSTEM_FIELDS.PARENT) ?? null,
        order: getProperty<number>(node, SYSTEM_FIELDS.ORDER) ?? 0,
        color: getProperty<string>(node, SYSTEM_FIELDS.COLOR) ?? null,
        icon: getProperty<string>(node, SYSTEM_FIELDS.ICON) ?? null,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      },
    }
  })
