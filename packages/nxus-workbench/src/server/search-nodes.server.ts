/**
 * search-nodes.server.ts - Universal node search
 *
 * Provides content-based search across all nodes in the system.
 */

import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull, like } from 'drizzle-orm'
import { z } from 'zod'
import {
  getDatabase,
  initDatabase,
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  assembleNode,
  getNodesBySupertagWithInheritance,
  type AssembledNode,
} from '@nxus/db/server'

// ============================================================================
// Result Types
// ============================================================================

type SearchNodesResult = { success: true; nodes: AssembledNode[] }
type SupertagsResult = { success: true; supertags: AssembledNode[] }
type AllNodesResult = { success: true; nodes: AssembledNode[] }
type BacklinksResult = { success: true; backlinks: AssembledNode[] }
type OwnerChainResult = {
  success: true
  chain: Array<{ id: string; content: string | null; systemId: string | null }>
}
type ChildNodesResult = { success: true; children: AssembledNode[] }

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Search nodes by content (case-insensitive via content_plain)
 */
export const searchNodesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ query: z.string(), limit: z.number().optional() }))
  .handler(async (ctx): Promise<SearchNodesResult> => {
    const { query, limit = 50 } = ctx.data
    initDatabase()
    const db = getDatabase()

    if (!query.trim()) {
      return { success: true, nodes: [] }
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

    return { success: true, nodes: assembledNodes }
  })

/**
 * Get all supertags (nodes that are themselves supertags)
 * Returns nodes with #Supertag supertag, including inheritance info
 */
export const getSupertagsServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SupertagsResult> => {
    initDatabase()
    const db = getDatabase()

    // Find the supertag field node
    const supertagFieldNode = db
      .select()
      .from(nodes)
      .where(eq(nodes.systemId, SYSTEM_FIELDS.SUPERTAG))
      .get()

    if (!supertagFieldNode) {
      return { success: true, supertags: [] }
    }

    // Find the #Supertag supertag node
    const supertagSupertag = db
      .select()
      .from(nodes)
      .where(eq(nodes.systemId, 'supertag:supertag'))
      .get()

    if (!supertagSupertag) {
      return { success: true, supertags: [] }
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

    return { success: true, supertags }
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
  .handler(async (ctx): Promise<AllNodesResult> => {
    const {
      supertagSystemId,
      limit = 200,
      includeSystemNodes = true,
    } = ctx.data
    initDatabase()
    const db = getDatabase()

    // If supertag filter is provided, use inheritance-aware query
    if (supertagSystemId) {
      const filteredNodes = getNodesBySupertagWithInheritance(
        db,
        supertagSystemId,
      )
      return {
        success: true,
        nodes: filteredNodes.slice(0, limit),
      }
    }

    // Otherwise get all non-deleted nodes
    const allNodes = db
      .select()
      .from(nodes)
      .where(isNull(nodes.deletedAt))
      .limit(limit)
      .all()

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

    return { success: true, nodes: assembledNodes }
  })

/**
 * Get backlinks for a node (nodes that reference this node)
 */
export const getBacklinksServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx): Promise<BacklinksResult> => {
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

    return { success: true, backlinks }
  })

/**
 * Get the owner chain (breadcrumbs) for a node
 * Traverses up the ownerId chain until reaching the root
 */
export const getOwnerChainServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx): Promise<OwnerChainResult> => {
    const { nodeId } = ctx.data
    initDatabase()
    const db = getDatabase()

    const chain: Array<{
      id: string
      content: string | null
      systemId: string | null
    }> = []
    const visited = new Set<string>()
    let currentId: string | null = nodeId

    // Walk up the owner chain (max 20 levels to prevent infinite loops)
    while (currentId && chain.length < 20) {
      if (visited.has(currentId)) break
      visited.add(currentId)

      const node = db.select().from(nodes).where(eq(nodes.id, currentId)).get()

      if (!node) break

      chain.unshift({
        id: node.id,
        content: node.content,
        systemId: node.systemId,
      })

      currentId = node.ownerId
    }

    return { success: true, chain }
  })

/**
 * Get child nodes of a parent node (nodes where ownerId === parentId)
 * Optionally filter by supertag (e.g., 'supertag:command')
 */
export const getChildNodesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      parentId: z.string(),
      supertagSystemId: z.string().optional(),
      limit: z.number().optional(),
    }),
  )
  .handler(async (ctx): Promise<ChildNodesResult> => {
    const { parentId, supertagSystemId, limit = 50 } = ctx.data
    initDatabase()
    const db = getDatabase()

    // Get all nodes owned by parent
    const childNodes = db
      .select()
      .from(nodes)
      .where(and(eq(nodes.ownerId, parentId), isNull(nodes.deletedAt)))
      .limit(limit)
      .all()

    // Assemble each node
    const assembledNodes: AssembledNode[] = []
    for (const node of childNodes) {
      const assembled = assembleNode(db, node.id)
      if (assembled) {
        // Filter by supertag if specified
        if (supertagSystemId) {
          const hasSupertag = assembled.supertags.some(
            (st) => st.systemId === supertagSystemId,
          )
          if (hasSupertag) {
            assembledNodes.push(assembled)
          }
        } else {
          assembledNodes.push(assembled)
        }
      }
    }

    return { success: true, children: assembledNodes }
  })
