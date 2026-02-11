/**
 * inbox.server.ts - Server functions for inbox CRUD operations
 *
 * Uses node-based architecture exclusively. Legacy table paths removed.
 */

import {
  FIELD_NAMES,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  getProperty,
  nodeFacade,
  type AssembledNode,
} from '@nxus/db/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// ============================================================================
// Types
// ============================================================================

export interface InboxItem {
  id: string // Node UUID
  title: string
  notes: string | null
  status: 'pending' | 'processing' | 'done'
  createdAt: Date
  updatedAt: Date
}

// ============================================================================
// Node Helpers
// ============================================================================

/**
 * Convert inbox node to InboxItem
 */
function nodeToInboxItem(
  node: AssembledNode | null,
): InboxItem | null {
  if (!node) return null

  const status = getProperty<string>(node, FIELD_NAMES.STATUS) as
    | 'pending'
    | 'processing'
    | 'done'

  return {
    id: node.id,
    title: node.content || '',
    notes: getProperty<string>(node, FIELD_NAMES.NOTES) ?? null,
    status: status || 'pending',
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get all inbox items
 */
export const getInboxItemsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    console.log('[getInboxItemsServerFn] Fetching all items')
    await nodeFacade.init()

    const inboxNodes = await nodeFacade.getNodesBySupertagWithInheritance(
      SYSTEM_SUPERTAGS.INBOX,
    )

    // Sort by createdAt descending
    const sortedNodes = inboxNodes.sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    )

    const data = sortedNodes
      .filter((n) => !n.deletedAt)
      .map(nodeToInboxItem)
      .filter((e): e is InboxItem => e !== null)

    console.log('[getInboxItemsServerFn] Found:', data.length)
    return { success: true, data }
  },
)

/**
 * Get pending inbox items only
 */
export const getPendingInboxItemsServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  console.log('[getPendingInboxItemsServerFn] Fetching pending items')
  await nodeFacade.init()

  const inboxNodes = await nodeFacade.getNodesBySupertagWithInheritance(
    SYSTEM_SUPERTAGS.INBOX,
  )

  const pendingNodes = inboxNodes
    .filter(
      (n) => !n.deletedAt && getProperty<string>(n, 'status') === 'pending',
    )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

  const data = pendingNodes
    .map(nodeToInboxItem)
    .filter((e): e is InboxItem => e !== null)

  console.log('[getPendingInboxItemsServerFn] Found:', data.length)
  return { success: true, data }
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
    await nodeFacade.init()
    const now = new Date()

    const nodeId = await nodeFacade.createNode({
      content: title,
      supertagId: SYSTEM_SUPERTAGS.INBOX,
    })

    // Set status to pending
    await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.STATUS, 'pending')

    // Set notes if provided
    if (notes) {
      await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.NOTES, notes)
    }

    await nodeFacade.save()

    const newEntry: InboxItem = {
      id: nodeId,
      title,
      notes: notes ?? null,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }

    console.log('[addInboxItemServerFn] Success:', nodeId)
    return { success: true, data: newEntry }
  })

/**
 * Update an inbox item
 */
export const updateInboxItemServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      id: z.string(),
      title: z.string().min(1).optional(),
      notes: z.string().optional(),
      status: z.enum(['pending', 'processing', 'done']).optional(),
    }),
  )
  .handler(async (ctx) => {
    console.log('[updateInboxItemServerFn] Input:', ctx.data)
    const { id, ...updates } = ctx.data
    await nodeFacade.init()

    if (updates.title) {
      await nodeFacade.updateNodeContent(id, updates.title)
    }
    if (updates.notes !== undefined) {
      await nodeFacade.setProperty(id, SYSTEM_FIELDS.NOTES, updates.notes)
    }
    if (updates.status) {
      await nodeFacade.setProperty(id, SYSTEM_FIELDS.STATUS, updates.status)
    }

    await nodeFacade.save()

    // Return updated entry
    const node = await nodeFacade.assembleNode(id)
    const entry = nodeToInboxItem(node)
    if (!entry) {
      return { success: false as const, error: 'Item not found' }
    }
    console.log('[updateInboxItemServerFn] Success:', id)
    return { success: true as const, data: entry }
  })

/**
 * Delete an inbox item
 */
export const deleteInboxItemServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    console.log('[deleteInboxItemServerFn] Input:', ctx.data)
    const { id } = ctx.data
    await nodeFacade.init()

    await nodeFacade.deleteNode(id)
    await nodeFacade.save()
    console.log('[deleteInboxItemServerFn] Success:', id)
    return { success: true as const }
  })

/**
 * Mark item as processing (when add-item workflow starts)
 */
export const markAsProcessingServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    console.log('[markAsProcessingServerFn] Input:', ctx.data)
    await nodeFacade.init()

    await nodeFacade.setProperty(ctx.data.id, SYSTEM_FIELDS.STATUS, 'processing')
    await nodeFacade.save()

    const node = await nodeFacade.assembleNode(ctx.data.id)
    const entry = nodeToInboxItem(node)
    if (!entry) {
      return { success: false as const, error: 'Item not found' }
    }
    console.log('[markAsProcessingServerFn] Success:', ctx.data.id)
    return { success: true as const, data: entry }
  })

/**
 * Mark item as done (when add-item workflow completes)
 */
export const markAsDoneServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    console.log('[markAsDoneServerFn] Input:', ctx.data)
    await nodeFacade.init()

    await nodeFacade.setProperty(ctx.data.id, SYSTEM_FIELDS.STATUS, 'done')
    await nodeFacade.save()

    const node = await nodeFacade.assembleNode(ctx.data.id)
    const entry = nodeToInboxItem(node)
    if (!entry) {
      return { success: false as const, error: 'Item not found' }
    }
    console.log('[markAsDoneServerFn] Success:', ctx.data.id)
    return { success: true as const, data: entry }
  })
