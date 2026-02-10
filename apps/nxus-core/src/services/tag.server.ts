/**
 * tag.server.ts - Server functions for tag CRUD operations
 *
 * Tags are nodes in the node-based architecture.
 * IDs are node UUIDs (strings).
 */

import {
  FIELD_NAMES,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  getProperty,
  nodeFacade,
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
    await nodeFacade.init()

    const nodeId = await nodeFacade.createNode({
      content: ctx.data.name,
      supertagId: SYSTEM_SUPERTAGS.TAG,
    })

    if (ctx.data.color)
      await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.COLOR, ctx.data.color)
    if (ctx.data.icon)
      await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.ICON, ctx.data.icon)
    if (ctx.data.parentId) {
      await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.PARENT, ctx.data.parentId)
    }
    if (ctx.data.order !== undefined) {
      await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.ORDER, ctx.data.order)
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
    await nodeFacade.init()
    const { id, ...updates } = ctx.data

    const node = await nodeFacade.findNodeBySystemId(id)
    if (!node) {
      return { success: false, error: 'Tag node not found' }
    }

    if (updates.name) await nodeFacade.updateNodeContent(id, updates.name)
    if (updates.color !== undefined) {
      if (updates.color)
        await nodeFacade.setProperty(id, SYSTEM_FIELDS.COLOR, updates.color)
      else await nodeFacade.clearProperty(id, SYSTEM_FIELDS.COLOR)
    }
    if (updates.icon !== undefined) {
      if (updates.icon)
        await nodeFacade.setProperty(id, SYSTEM_FIELDS.ICON, updates.icon)
      else await nodeFacade.clearProperty(id, SYSTEM_FIELDS.ICON)
    }
    if (updates.parentId !== undefined) {
      if (updates.parentId) {
        await nodeFacade.setProperty(id, SYSTEM_FIELDS.PARENT, updates.parentId)
      } else {
        await nodeFacade.clearProperty(id, SYSTEM_FIELDS.PARENT)
      }
    }
    if (updates.order !== undefined) {
      await nodeFacade.setProperty(id, SYSTEM_FIELDS.ORDER, updates.order)
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
    await nodeFacade.init()

    await nodeFacade.deleteNode(ctx.data.id)
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
    await nodeFacade.init()

    if (ctx.data.newParentId) {
      await nodeFacade.setProperty(ctx.data.id, SYSTEM_FIELDS.PARENT, ctx.data.newParentId)
    } else {
      await nodeFacade.clearProperty(ctx.data.id, SYSTEM_FIELDS.PARENT)
    }

    await nodeFacade.setProperty(ctx.data.id, SYSTEM_FIELDS.ORDER, ctx.data.newOrder)

    return { success: true }
  })

/**
 * Get all tags
 */
export const getTagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    console.log('[getTagsServerFn] Fetching all tags')
    await nodeFacade.init()

    const tagNodes = await nodeFacade.getNodesBySupertagWithInheritance(
      SYSTEM_SUPERTAGS.TAG,
    )

    const data = tagNodes.map((node) => ({
      id: node.id,
      name: node.content || '',
      parentId: getProperty<string>(node, FIELD_NAMES.PARENT) ?? null,
      order: getProperty<number>(node, FIELD_NAMES.ORDER) ?? 0,
      color: getProperty<string>(node, FIELD_NAMES.COLOR) ?? null,
      icon: getProperty<string>(node, FIELD_NAMES.ICON) ?? null,
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
    await nodeFacade.init()

    const node = await nodeFacade.findNodeBySystemId(ctx.data.id)
    if (!node) {
      return { success: false as const, error: 'Tag not found' }
    }

    return {
      success: true as const,
      data: {
        id: node.id,
        name: node.content || '',
        parentId: getProperty<string>(node, FIELD_NAMES.PARENT) ?? null,
        order: getProperty<number>(node, FIELD_NAMES.ORDER) ?? 0,
        color: getProperty<string>(node, FIELD_NAMES.COLOR) ?? null,
        icon: getProperty<string>(node, FIELD_NAMES.ICON) ?? null,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      },
    }
  })
