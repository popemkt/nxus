/**
 * nodes.server.ts - TanStack server functions for node operations
 *
 * Generic node CRUD operations (get, create, update, delete, set properties).
 * These work with AssembledNode directly — no app-specific type conversions.
 *
 * IMPORTANT: All @nxus/db/server imports are done dynamically inside handlers
 * to prevent Vite from bundling better-sqlite3 into the client bundle.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  getDatabase,
  initDatabase,
  initDatabaseWithBootstrap,
  assembleNode,
  findNodeById,
  createNode,
  deleteNode,
  setProperty,
} from '@nxus/db/server'

// ============================================================================
// Raw Node Queries (return AssembledNode)
// ============================================================================

/**
 * Get a node by systemId or UUID
 */
export const getNodeServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ identifier: z.string() }))
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, isSystemId, findNodeById, findNodeBySystemId } = await import('@nxus/db/server')
    const { identifier } = ctx.data
    initDatabase()
    const db = getDatabase()
    // Use explicit lookup based on identifier type
    const node = isSystemId(identifier)
      ? findNodeBySystemId(db, identifier)
      : findNodeById(db, identifier)

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
    const existingNode = findNodeById(db, nodeId)
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
    const { initDatabase, getDatabase, findNodeById, assembleNode, setProperty } = await import('@nxus/db/server')
    const { nodeId, properties } = ctx.data
    initDatabase()
    const db = getDatabase()

    // Verify the node exists
    const existingNode = findNodeById(db, nodeId)
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

