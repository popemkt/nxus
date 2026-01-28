/**
 * nodes.server.ts - TanStack server functions for node-based architecture
 *
 * Parallel to apps.server.ts - provides node-based queries that can
 * return legacy types via adapters. Use these when you want to leverage
 * the new node system with supertag inheritance.
 *
 * IMPORTANT: All @nxus/db/server imports are done dynamically inside handlers
 * to prevent Vite from bundling better-sqlite3 into the client bundle.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  eq,
  getDatabase,
  initDatabase,
  initDatabaseWithBootstrap,
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  assembleNode,
  findNode,
  getNodesBySupertagWithInheritance,
  getProperty,
  createNode,
  deleteNode,
  setProperty,
  type NodeProperty,
} from '@nxus/db/server'
import type { AssembledNode, Item, ItemCommand, TagRef } from '@nxus/db'
import { nodeToCommand, nodeToItem, nodeToTag } from './adapters.js'

// ============================================================================
// Raw Node Queries (return AssembledNode)
// ============================================================================

/**
 * Get a node by systemId or UUID
 */
export const getNodeServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ identifier: z.string() }))
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, findNode } = await import('@nxus/db/server')
    const { identifier } = ctx.data
    initDatabase()
    const db = getDatabase()
    const node = findNode(db, identifier)

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
    const { initDatabase, getDatabase, getNodesBySupertagWithInheritance } = await import('@nxus/db/server')
    const { supertagSystemId } = ctx.data
    initDatabase()
    const db = getDatabase()
    const nodesList = getNodesBySupertagWithInheritance(db, supertagSystemId)
    return { success: true as const, nodes: nodesList }
  })

/**
 * Update a node's content (for inline editing)
 */
export const updateNodeContentServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string(), content: z.string() }))
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, assembleNode, updateNodeContent: updateFn } = await import('@nxus/db/server')
    const { nodeId, content } = ctx.data
    initDatabase()
    const db = getDatabase()

    updateFn(db, nodeId, content)

    // Return the updated node
    const updatedNode = assembleNode(db, nodeId)
    if (!updatedNode) {
      return { success: false as const, error: 'Node not found after update' }
    }
    return { success: true as const, node: updatedNode }
  })

/**
 * Create a new node
 *
 * Creates a node with optional supertag and owner.
 * Returns the created node's assembled data.
 */
export const createNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      content: z.string(),
      systemId: z.string().optional(),
      supertagSystemId: z.string().optional(),
      ownerId: z.string().optional(),
      properties: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]))
        .optional(),
    })
  )
  .handler(async (ctx) => {
    const { content, systemId, supertagSystemId, ownerId, properties } = ctx.data
    const db = await initDatabaseWithBootstrap()

    // Create the node
    const nodeId = createNode(db, {
      content,
      systemId,
      supertagSystemId,
      ownerId,
    })

    // Set additional properties if provided
    if (properties) {
      for (const [fieldSystemId, value] of Object.entries(properties)) {
        if (value !== null) {
          setProperty(db, nodeId, fieldSystemId, value)
        }
      }
    }

    // Return the assembled node
    const node = assembleNode(db, nodeId)
    if (!node) {
      return { success: false as const, error: 'Failed to assemble created node' }
    }

    return { success: true as const, node, nodeId }
  })

/**
 * Delete a node (soft delete)
 *
 * Sets the deletedAt timestamp on the node.
 */
export const deleteNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const { nodeId } = ctx.data
    initDatabase()
    const db = getDatabase()

    // Verify the node exists
    const existingNode = findNode(db, nodeId)
    if (!existingNode) {
      return { success: false as const, error: 'Node not found' }
    }

    // Soft delete the node
    deleteNode(db, nodeId)

    return { success: true as const }
  })

/**
 * Update node properties
 *
 * Sets one or more properties on a node.
 */
export const setNodePropertiesServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      properties: z.record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())])
      ),
    })
  )
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, findNode, assembleNode, setProperty } = await import('@nxus/db/server')
    const { nodeId, properties } = ctx.data
    initDatabase()
    const db = getDatabase()

    // Verify the node exists
    const existingNode = findNode(db, nodeId)
    if (!existingNode) {
      return { success: false as const, error: 'Node not found' }
    }

    // Set each property
    for (const [fieldSystemId, value] of Object.entries(properties)) {
      setProperty(db, nodeId, fieldSystemId, value)
    }

    // Return the updated node
    const updatedNode = assembleNode(db, nodeId)
    if (!updatedNode) {
      return { success: false as const, error: 'Failed to assemble updated node' }
    }

    return { success: true as const, node: updatedNode }
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
  const {
    initDatabaseWithBootstrap,
    getNodesBySupertagWithInheritance,
    getProperty,
    SYSTEM_SUPERTAGS,
  } = await import('@nxus/db/server')

  // Auto-bootstrap system nodes on first access (idempotent)
  const db = await initDatabaseWithBootstrap()

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

  // Build item lookup for dependency resolution (node ID → legacy ID)
  const itemLookup = new Map<string, string>()
  for (const itemNode of itemNodes) {
    const legacyId =
      getProperty<string>(itemNode, 'legacyId') ||
      itemNode.systemId?.replace('item:', '') ||
      itemNode.id
    itemLookup.set(itemNode.id, legacyId)
  }

  // Get all commands to group by parent item
  const commandNodes = getNodesBySupertagWithInheritance(
    db,
    SYSTEM_SUPERTAGS.COMMAND,
  )
  const commandsByItemId = new Map<string, ItemCommand[]>()

  for (const cmdNode of commandNodes) {
    // Commands use ownerId to link to their parent item
    const parentId = cmdNode.ownerId
    if (parentId) {
      const cmds = commandsByItemId.get(parentId) ?? []
      cmds.push(nodeToCommand(cmdNode))
      commandsByItemId.set(parentId, cmds)
    }
  }

  // Convert to legacy Item type
  const items: Item[] = itemNodes.map((node: AssembledNode) =>
    nodeToItem(node, {
      resolveTagRefs: (tagNodeIds) =>
        tagNodeIds
          .map((id) => tagLookup.get(id))
          .filter((t): t is TagRef => !!t),
      resolveCommands: (itemId) => commandsByItemId.get(itemId) ?? [],
      resolveDependencies: (depNodeIds) =>
        depNodeIds
          .map((id) => itemLookup.get(id))
          .filter((id): id is string => !!id),
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
    const {
      initDatabase,
      getDatabase,
      findNode,
      assembleNode,
      getNodesBySupertagWithInheritance,
      getProperty,
      nodes,
      nodeProperties,
      eq,
      SYSTEM_SUPERTAGS,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')
    const { id } = ctx.data
    initDatabase()
    const db = getDatabase()

    // Try to find by systemId first (item:xxx)
    let node = findNode(db, `item:${id}`)

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
          .find((p: { value: string | null }) => {
            try {
              return JSON.parse(p.value || '') === id
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
      return { success: false as const, error: `Item ${id} not found` }
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

    // Build item lookup for dependency resolution
    const allItemNodes = getNodesBySupertagWithInheritance(
      db,
      SYSTEM_SUPERTAGS.ITEM,
    )
    const itemLookup = new Map<string, string>()
    for (const itemNode of allItemNodes) {
      const legacyId =
        getProperty<string>(itemNode, 'legacyId') ||
        itemNode.systemId?.replace('item:', '') ||
        itemNode.id
      itemLookup.set(itemNode.id, legacyId)
    }

    // Get commands for this item (commands use ownerId to link to their parent item)
    const commandNodes = getNodesBySupertagWithInheritance(
      db,
      SYSTEM_SUPERTAGS.COMMAND,
    )
    const commands = commandNodes
      .filter((cmd: AssembledNode) => cmd.ownerId === node!.id)
      .map(nodeToCommand)

    const item = nodeToItem(node, {
      resolveTagRefs: (tagNodeIds) =>
        tagNodeIds
          .map((id) => tagLookup.get(id))
          .filter((t): t is TagRef => !!t),
      resolveCommands: () => commands,
      resolveDependencies: (depNodeIds) =>
        depNodeIds
          .map((id) => itemLookup.get(id))
          .filter((id): id is string => !!id),
    })

    return { success: true as const, item }
  })

/**
 * Get all tags from node system (returns legacy Tag type)
 */
export const getAllTagsFromNodesServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const {
    initDatabase,
    getDatabase,
    getNodesBySupertagWithInheritance,
    getProperty,
    SYSTEM_SUPERTAGS,
  } = await import('@nxus/db/server')

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

  const tags = tagNodes.map((node: AssembledNode) =>
    nodeToTag(node, {
      resolveParentId: (nodeId) => nodeIdToLegacyId.get(nodeId) ?? null,
    }),
  )

  return { success: true as const, tags }
})
