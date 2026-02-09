/**
 * inbox.server.ts - Server functions for inbox CRUD operations
 *
 * Uses node-based architecture exclusively. Legacy table paths removed.
 */

import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  assembleNode,
  createNode,
  deleteNode,
  getNodesBySupertagWithInheritance,
  getProperty,
  initDatabase,
  saveDatabase, setProperty, updateNodeContent
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
  node: ReturnType<typeof assembleNode>,
): InboxItem | null {
  if (!node) return null

  const status = getProperty<string>(node, 'status') as
    | 'pending'
    | 'processing'
    | 'done'

  return {
    id: node.id,
    title: node.content || '',
    notes: getProperty<string>(node, 'notes') ?? null,
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
    const db = initDatabase()

    const inboxNodes = getNodesBySupertagWithInheritance(
      db,
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
  const db = initDatabase()

  const inboxNodes = getNodesBySupertagWithInheritance(
    db,
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
    const db = initDatabase()
    const now = new Date()

    const nodeId = createNode(db, {
      content: title,
      supertagSystemId: SYSTEM_SUPERTAGS.INBOX,
    })

    // Set status to pending
    setProperty(db, nodeId, SYSTEM_FIELDS.STATUS, 'pending')

    // Set notes if provided
    if (notes) {
      setProperty(db, nodeId, SYSTEM_FIELDS.NOTES, notes)
    }

    saveDatabase()

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
    const db = initDatabase()

    if (updates.title) {
      updateNodeContent(db, id, updates.title)
    }
    if (updates.notes !== undefined) {
      setProperty(db, id, SYSTEM_FIELDS.NOTES, updates.notes)
    }
    if (updates.status) {
      setProperty(db, id, SYSTEM_FIELDS.STATUS, updates.status)
    }

    saveDatabase()

    // Return updated entry
    const node = assembleNode(db, id)
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
    const db = initDatabase()

    deleteNode(db, id)
    saveDatabase()
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
    const db = initDatabase()

    setProperty(db, ctx.data.id, SYSTEM_FIELDS.STATUS, 'processing')
    saveDatabase()

    const node = assembleNode(db, ctx.data.id)
    const entry = nodeToInboxItem(node)
    console.log('[markAsProcessingServerFn] Success:', ctx.data.id)
    return { success: true, data: entry }
  })

/**
 * Mark item as done (when add-item workflow completes)
 */
export const markAsDoneServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    console.log('[markAsDoneServerFn] Input:', ctx.data)
    const db = initDatabase()

    setProperty(db, ctx.data.id, SYSTEM_FIELDS.STATUS, 'done')
    saveDatabase()

    const node = assembleNode(db, ctx.data.id)
    const entry = nodeToInboxItem(node)
    console.log('[markAsDoneServerFn] Success:', ctx.data.id)
    return { success: true, data: entry }
  })
