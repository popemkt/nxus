/**
 * nodes.server.ts - TanStack server functions for node-based architecture
 *
 * Parallel to apps.server.ts - provides node-based queries that can
 * return legacy types via adapters. Use these when you want to leverage
 * the new node system with supertag inheritance.
 */

import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { getDatabase, initDatabase } from '../../db/client'
import {
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
} from '../../db/node-schema'
import type { Item, ItemCommand, TagRef } from '../../types/item'
import { nodeToCommand, nodeToItem, nodeToTag } from './adapters'
import {
  assembleNode,
  findNode,
  getNodesBySupertagWithInheritance,
  getProperty,
} from './node.service'

// ============================================================================
// Raw Node Queries (return AssembledNode)
// ============================================================================

/**
 * Get a node by systemId or UUID
 */
export const getNodeServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ identifier: z.string() }))
  .handler(async (ctx) => {
    initDatabase()
    const db = getDatabase()
    const node = findNode(db, ctx.data.identifier)

    if (!node) {
      return { success: false as const, error: 'Node not found' }
    }
    return { success: true as const, node }
  })

/**
 * Get all nodes with a supertag (with inheritance)
 */
export const getNodesBySupertagServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ supertagSystemId: z.string() }))
  .handler(async (ctx) => {
    initDatabase()
    const db = getDatabase()
    const nodesList = getNodesBySupertagWithInheritance(
      db,
      ctx.data.supertagSystemId,
    )
    return { success: true as const, nodes: nodesList }
  })

// ============================================================================
// Legacy-Compatible Queries (return Item, Tag, Command)
// ============================================================================

/**
 * Get all items from node system (returns legacy Item type)
 *
 * This mirrors getAllAppsServerFn but uses the node architecture.
 * Includes #Tool and #Repo via inheritance from #Item.
 */
export const getAllItemsFromNodesServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  initDatabase()
  const db = getDatabase()

  // Get all items (with inheritance: #Item, #Tool, #Repo)
  const itemNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)

  // Get all tags for lookup
  const tagNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.TAG)
  const tagLookup = new Map<string, TagRef>()
  for (const tagNode of tagNodes) {
    const legacyId = getProperty<number>(tagNode, 'legacyId')
    tagLookup.set(tagNode.id, {
      id: legacyId || 0,
      name: tagNode.content || '',
    })
  }

  // Get all commands to group by parent item
  const commandNodes = getNodesBySupertagWithInheritance(
    db,
    SYSTEM_SUPERTAGS.COMMAND,
  )
  const commandsByItemId = new Map<string, ItemCommand[]>()

  for (const cmdNode of commandNodes) {
    const parentId = getProperty<string>(cmdNode, 'parent')
    if (parentId) {
      const cmds = commandsByItemId.get(parentId) ?? []
      cmds.push(nodeToCommand(cmdNode))
      commandsByItemId.set(parentId, cmds)
    }
  }

  // Convert to legacy Item type
  const items: Item[] = itemNodes.map((node) =>
    nodeToItem(node, {
      resolveTagRefs: (tagNodeIds) =>
        tagNodeIds
          .map((id) => tagLookup.get(id))
          .filter((t): t is TagRef => !!t),
      resolveCommands: (itemId) => commandsByItemId.get(itemId) ?? [],
    }),
  )

  return { success: true as const, items }
})

/**
 * Get a single item by legacy ID from node system
 */
export const getItemByIdFromNodesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ id: z.string() }))
  .handler(async (ctx) => {
    initDatabase()
    const db = getDatabase()

    // Try to find by systemId first (item:xxx)
    let node = findNode(db, `item:${ctx.data.id}`)

    // If not found, search by legacyId property
    if (!node) {
      const legacyIdField = db
        .select()
        .from(nodes)
        .where(eq(nodes.systemId, SYSTEM_FIELDS.LEGACY_ID))
        .get()

      if (legacyIdField) {
        const prop = db
          .select()
          .from(nodeProperties)
          .where(eq(nodeProperties.fieldNodeId, legacyIdField.id))
          .all()
          .find((p) => {
            try {
              return JSON.parse(p.value || '') === ctx.data.id
            } catch {
              return false
            }
          })

        if (prop) {
          node = assembleNode(db, prop.nodeId)
        }
      }
    }

    if (!node) {
      return { success: false as const, error: `Item ${ctx.data.id} not found` }
    }

    // Get tags for this item
    const tagNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.TAG)
    const tagLookup = new Map<string, TagRef>()
    for (const tagNode of tagNodes) {
      const legacyId = getProperty<number>(tagNode, 'legacyId')
      tagLookup.set(tagNode.id, {
        id: legacyId || 0,
        name: tagNode.content || '',
      })
    }

    // Get commands for this item
    const commandNodes = getNodesBySupertagWithInheritance(
      db,
      SYSTEM_SUPERTAGS.COMMAND,
    )
    const commands = commandNodes
      .filter((cmd) => getProperty<string>(cmd, 'parent') === node!.id)
      .map(nodeToCommand)

    const item = nodeToItem(node, {
      resolveTagRefs: (tagNodeIds) =>
        tagNodeIds
          .map((id) => tagLookup.get(id))
          .filter((t): t is TagRef => !!t),
      resolveCommands: () => commands,
    })

    return { success: true as const, item }
  })

/**
 * Get all tags from node system (returns legacy Tag type)
 */
export const getAllTagsFromNodesServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  initDatabase()
  const db = getDatabase()

  const tagNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.TAG)

  // Build parent lookup
  const nodeIdToLegacyId = new Map<string, number>()
  for (const node of tagNodes) {
    const legacyId = getProperty<number>(node, 'legacyId')
    if (legacyId) {
      nodeIdToLegacyId.set(node.id, legacyId)
    }
  }

  const tags = tagNodes.map((node) =>
    nodeToTag(node, {
      resolveParentId: (nodeId) => nodeIdToLegacyId.get(nodeId) ?? null,
    }),
  )

  return { success: true as const, tags }
})
