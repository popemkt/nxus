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
  createNode,
  deleteNode,
  getNode,
  getNodesBySupertag,
  setNodeProperties,
  updateNodeContent,
} from './operations.js'

// ============================================================================
// Raw Node Queries (return AssembledNode)
// ============================================================================

/**
 * Get a node by systemId or UUID
 */
export const getNodeServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ identifier: z.string() }))
  .handler(async (ctx) => {
    const node = await getNode(ctx.data)
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
    const nodesList = await getNodesBySupertag(ctx.data)
    return { success: true as const, nodes: nodesList }
  })

/**
 * Update a node's content (for inline editing)
 */
export const updateNodeContentServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string(), content: z.string() }))
  .handler(async (ctx) => {
    try {
      const result = await updateNodeContent(ctx.data)
      return { success: true as const, node: result.node }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
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
    try {
      const result = await createNode(ctx.data)
      return { success: true as const, node: result.node, nodeId: result.nodeId }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })

/**
 * Delete a node (soft delete)
 *
 * Sets the deletedAt timestamp on the node.
 */
export const deleteNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    try {
      await deleteNode(ctx.data.nodeId)
      return { success: true as const }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
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
    try {
      const result = await setNodeProperties(ctx.data)
      return { success: true as const, node: result.node }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  })
