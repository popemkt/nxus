/**
 * search-nodes.server.ts - Universal node search
 *
 * Provides content-based search across all nodes in the system.
 */

import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull, like } from 'drizzle-orm'
import { z } from 'zod'
import { getDatabase, initDatabase } from '../../db/client'
import { nodeProperties, nodes, SYSTEM_FIELDS } from '../../db/node-schema'
import { assembleNode, type AssembledNode } from './node.service'

/**
 * Search nodes by content (case-insensitive via content_plain)
 */
export const searchNodesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ query: z.string(), limit: z.number().optional() }))
  .handler(async (ctx) => {
    const { query, limit = 50 } = ctx.data
    initDatabase()
    const db = getDatabase()

    if (!query.trim()) {
      return { success: true as const, nodes: [] }
    }

    // Search by content_plain (lowercase indexed field)
    const searchPattern = `%${query.toLowerCase()}%`
    const matchingNodes = db
      .select()
      .from(nodes)
      .where(
        and(like(nodes.contentPlain, searchPattern), isNull(nodes.deletedAt)),
      )
      .limit(limit)
      .all()

    // Assemble each node with full properties
    const assembledNodes: AssembledNode[] = []
    for (const node of matchingNodes) {
      const assembled = assembleNode(db, node.id)
      if (assembled) {
        assembledNodes.push(assembled)
      }
    }

    return { success: true as const, nodes: assembledNodes }
  })

/**
 * Get all supertags (nodes that are themselves supertags)
 * Returns nodes with #Supertag supertag, including inheritance info
 */
export const getSupertagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    initDatabase()
    const db = getDatabase()

    // Find the supertag field node
    const supertagFieldNode = db
      .select()
      .from(nodes)
      .where(eq(nodes.systemId, SYSTEM_FIELDS.SUPERTAG))
      .get()

    if (!supertagFieldNode) {
      return { success: true as const, supertags: [] }
    }

    // Find the #Supertag supertag node
    const supertagSupertag = db
      .select()
      .from(nodes)
      .where(eq(nodes.systemId, 'supertag:supertag'))
      .get()

    if (!supertagSupertag) {
      return { success: true as const, supertags: [] }
    }

    // Find all nodes that have supertag:supertag as their supertag
    const supertagProps = db
      .select()
      .from(nodeProperties)
      .where(eq(nodeProperties.fieldNodeId, supertagFieldNode.id))
      .all()

    const supertagNodeIds = new Set<string>()
    for (const prop of supertagProps) {
      try {
        const value = JSON.parse(prop.value || '')
        if (value === supertagSupertag.id) {
          supertagNodeIds.add(prop.nodeId)
        }
      } catch {
        // Skip invalid JSON
      }
    }

    // Assemble all supertag nodes
    const supertags: AssembledNode[] = []
    for (const nodeId of supertagNodeIds) {
      const assembled = assembleNode(db, nodeId)
      if (assembled) {
        supertags.push(assembled)
      }
    }

    // Also include the #Supertag itself
    const supertagNode = assembleNode(db, supertagSupertag.id)
    if (supertagNode && !supertagNodeIds.has(supertagSupertag.id)) {
      supertags.unshift(supertagNode)
    }

    return { success: true as const, supertags }
  },
)

/**
 * Get all nodes (with optional supertag filter)
 * Used by the Node Browser for listing all nodes
 */
export const getAllNodesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      supertagSystemId: z.string().optional(),
      limit: z.number().optional(),
      includeSystemNodes: z.boolean().optional(),
    }),
  )
  .handler(async (ctx) => {
    const { limit = 200, includeSystemNodes = true } = ctx.data
    initDatabase()
    const db = getDatabase()

    // Get all non-deleted nodes
    let query = db
      .select()
      .from(nodes)
      .where(isNull(nodes.deletedAt))
      .limit(limit)

    const allNodes = query.all()

    // Assemble each node
    const assembledNodes: AssembledNode[] = []
    for (const node of allNodes) {
      // Skip system nodes if not requested
      if (!includeSystemNodes && node.systemId?.startsWith('field:')) {
        continue
      }

      const assembled = assembleNode(db, node.id)
      if (assembled) {
        assembledNodes.push(assembled)
      }
    }

    return { success: true as const, nodes: assembledNodes }
  })

/**
 * Get backlinks for a node (nodes that reference this node)
 */
export const getBacklinksServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const { nodeId } = ctx.data
    initDatabase()
    const db = getDatabase()

    // Find all properties where the value contains this node's ID
    // The value is JSON-encoded, so we search for the UUID string
    const searchPattern = `%${nodeId}%`
    const referencingProps = db
      .select()
      .from(nodeProperties)
      .where(like(nodeProperties.value, searchPattern))
      .all()

    // Get unique referencing node IDs
    const referencingNodeIds = new Set<string>()
    for (const prop of referencingProps) {
      // Verify this is actually a reference (not just a substring match)
      try {
        const value = JSON.parse(prop.value || '')
        if (
          value === nodeId ||
          (Array.isArray(value) && value.includes(nodeId))
        ) {
          referencingNodeIds.add(prop.nodeId)
        }
      } catch {
        // Skip non-JSON values
      }
    }

    // Don't include the node itself
    referencingNodeIds.delete(nodeId)

    // Assemble referencing nodes
    const backlinks: AssembledNode[] = []
    for (const refNodeId of referencingNodeIds) {
      const assembled = assembleNode(db, refNodeId)
      if (assembled) {
        backlinks.push(assembled)
      }
    }

    return { success: true as const, backlinks }
  })
