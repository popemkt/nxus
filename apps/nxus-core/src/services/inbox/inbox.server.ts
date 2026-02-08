/**
 * inbox.server.ts - Server functions for inbox CRUD operations
 *
 * Supports gradual migration to node-based architecture via feature toggle.
 */

import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  assembleNode,
  createNode,
  deleteNode,
  desc,
  
  eq,
  getNodesBySupertagWithInheritance,
  getProperty,
  getSystemNode,
  inbox,
  initDatabase,
  nodeProperties,
  saveDatabase, setProperty, updateNodeContent 
} from '@nxus/db/server'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type {InboxEntry,
  getDatabase} from '@nxus/db/server';
import { isNodeArchitecture } from '@/config/feature-flags'

// ============================================================================
// Node Helpers
// ============================================================================

/**
 * Convert inbox node to legacy InboxEntry format
 */
function nodeToInboxEntry(
  node: ReturnType<typeof assembleNode>,
): InboxEntry | null {
  if (!node) return null

  const legacyId = getProperty<number>(node, 'legacyId')
  const status = getProperty<string>(node, 'status') as
    | 'pending'
    | 'processing'
    | 'done'

  return {
    id: legacyId || 0,
    title: node.content || '',
    notes: getProperty<string>(node, 'notes') ?? null,
    status: status || 'pending',
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }
}

/**
 * Find inbox node by legacy ID
 */
function findInboxNodeByLegacyId(
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

/**
 * Get next legacy ID for inbox (auto-increment simulation)
 */
function getNextInboxLegacyId(db: ReturnType<typeof getDatabase>): number {
  const inboxNodes = getNodesBySupertagWithInheritance(
    db,
    SYSTEM_SUPERTAGS.INBOX,
  )
  let maxId = 0
  for (const node of inboxNodes) {
    const legacyId = getProperty<number>(node, 'legacyId')
    if (legacyId && legacyId > maxId) maxId = legacyId
  }
  return maxId + 1
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

    // Feature toggle: get from nodes
    if (isNodeArchitecture()) {
      console.log('[getInboxItemsServerFn] Using node-based architecture')
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
        .map(nodeToInboxEntry)
        .filter((e): e is InboxEntry => e !== null)

      console.log('[getInboxItemsServerFn] Found:', data.length)
      return { success: true, data }
    }

    // Legacy: get from inbox table
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
  const db = initDatabase()

  // Feature toggle: get from nodes
  if (isNodeArchitecture()) {
    console.log('[getPendingInboxItemsServerFn] Using node-based architecture')
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
      .map(nodeToInboxEntry)
      .filter((e): e is InboxEntry => e !== null)

    console.log('[getPendingInboxItemsServerFn] Found:', data.length)
    return { success: true, data }
  }

  // Legacy
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

    // Feature toggle: create in nodes
    if (isNodeArchitecture()) {
      console.log('[addInboxItemServerFn] Using node-based architecture')

      const nodeId = createNode(db, {
        content: title,
        supertagSystemId: SYSTEM_SUPERTAGS.INBOX,
      })

      // Assign legacy ID
      const legacyId = getNextInboxLegacyId(db)
      setProperty(db, nodeId, SYSTEM_FIELDS.LEGACY_ID, legacyId)

      // Set status to pending
      setProperty(db, nodeId, SYSTEM_FIELDS.STATUS, 'pending')

      // Set notes if provided
      if (notes) {
        setProperty(db, nodeId, SYSTEM_FIELDS.NOTES, notes)
      }

      saveDatabase()

      const newEntry: InboxEntry = {
        id: legacyId,
        title,
        notes: notes ?? null,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
      }

      console.log('[addInboxItemServerFn] Success:', legacyId)
      return { success: true, data: newEntry }
    }

    // Legacy: insert into inbox table
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
    const entry = result[0]
    if (!entry) throw new Error('Failed to create inbox item')
    console.log('[addInboxItemServerFn] Success:', entry.id)
    return { success: true, data: entry }
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

    // Feature toggle: update in nodes
    if (isNodeArchitecture()) {
      console.log('[updateInboxItemServerFn] Using node-based architecture')
      const nodeId = findInboxNodeByLegacyId(db, id)
      if (!nodeId) {
        return { success: false as const, error: 'Item not found' }
      }

      if (updates.title) {
        updateNodeContent(db, nodeId, updates.title)
      }
      if (updates.notes !== undefined) {
        setProperty(db, nodeId, SYSTEM_FIELDS.NOTES, updates.notes)
      }
      if (updates.status) {
        setProperty(db, nodeId, SYSTEM_FIELDS.STATUS, updates.status)
      }

      saveDatabase()

      // Return updated entry
      const node = assembleNode(db, nodeId)
      const entry = nodeToInboxEntry(node)
      console.log('[updateInboxItemServerFn] Success:', id)
      return { success: true as const, data: entry }
    }

    // Legacy: update inbox table
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

    // Feature toggle: delete from nodes
    if (isNodeArchitecture()) {
      console.log('[deleteInboxItemServerFn] Using node-based architecture')
      const nodeId = findInboxNodeByLegacyId(db, id)
      if (!nodeId) {
        return { success: false as const, error: 'Item not found' }
      }

      deleteNode(db, nodeId)
      saveDatabase()
      console.log('[deleteInboxItemServerFn] Success:', id)
      return { success: true as const }
    }

    // Legacy: delete from inbox table
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

    // Feature toggle: update in nodes
    if (isNodeArchitecture()) {
      console.log('[markAsProcessingServerFn] Using node-based architecture')
      const nodeId = findInboxNodeByLegacyId(db, ctx.data.id)
      if (!nodeId) {
        return { success: false as const, error: 'Item not found' }
      }

      setProperty(db, nodeId, SYSTEM_FIELDS.STATUS, 'processing')
      saveDatabase()

      const node = assembleNode(db, nodeId)
      const entry = nodeToInboxEntry(node)
      console.log('[markAsProcessingServerFn] Success:', ctx.data.id)
      return { success: true, data: entry }
    }

    // Legacy
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

    // Feature toggle: update in nodes
    if (isNodeArchitecture()) {
      console.log('[markAsDoneServerFn] Using node-based architecture')
      const nodeId = findInboxNodeByLegacyId(db, ctx.data.id)
      if (!nodeId) {
        return { success: false as const, error: 'Item not found' }
      }

      setProperty(db, nodeId, SYSTEM_FIELDS.STATUS, 'done')
      saveDatabase()

      const node = assembleNode(db, nodeId)
      const entry = nodeToInboxEntry(node)
      console.log('[markAsDoneServerFn] Success:', ctx.data.id)
      return { success: true, data: entry }
    }

    // Legacy
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
