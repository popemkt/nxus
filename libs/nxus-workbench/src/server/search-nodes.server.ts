/**
 * search-nodes.server.ts - Universal node search
 *
 * Provides content-based search across all nodes in the system.
 *
 * IMPORTANT: All @nxus/db/server imports are done dynamically inside handlers
 * to prevent Vite from bundling better-sqlite3 into the client bundle.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import type { AssembledNode } from '@nxus/db'

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
 * MIGRATED: Uses NodeFacade.evaluateQuery with content filter
 */
export const searchNodesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ query: z.string(), limit: z.number().optional() }))
  .handler(async (ctx): Promise<SearchNodesResult> => {
    const { nodeFacade } = await import('@nxus/db/server')

    const { query, limit = 50 } = ctx.data

    if (!query.trim()) {
      return { success: true, nodes: [] }
    }

    await nodeFacade.init()

    // Use facade's evaluateQuery with content filter
    const result = await nodeFacade.evaluateQuery({
      filters: [{ type: 'content', value: query }],
      limit,
    })

    return { success: true, nodes: result.nodes }
  })

/**
 * Get all supertags (nodes that are themselves supertags)
 * Returns nodes with #Supertag supertag, including inheritance info
 * MIGRATED: Uses NodeFacade.getNodesBySupertagWithInheritance
 */
export const getSupertagsServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SupertagsResult> => {
    const { nodeFacade } = await import('@nxus/db/server')

    await nodeFacade.init()

    // Use facade to get all supertag nodes
    const supertags = await nodeFacade.getNodesBySupertagWithInheritance(
      'supertag:supertag',
    )

    return { success: true, supertags }
  },
)

/**
 * Get all nodes (with optional supertag filter)
 * Used by the Node Browser for listing all nodes
 * PARTIALLY MIGRATED: Uses NodeFacade for supertag filtering; keeps Drizzle for all-nodes case
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

    // If supertag filter is provided, use facade
    if (supertagSystemId) {
      const { nodeFacade } = await import('@nxus/db/server')
      await nodeFacade.init()

      const filteredNodes = await nodeFacade.getNodesBySupertagWithInheritance(
        supertagSystemId,
      )
      return {
        success: true,
        nodes: filteredNodes.slice(0, limit),
      }
    }

    // Otherwise use raw Drizzle for efficiency (full table scan)
    const {
      initDatabase,
      getDatabase,
      nodes,
      assembleNode,
      isNull,
    } = await import('@nxus/db/server')

    initDatabase()
    const db = getDatabase()

    // Get all non-deleted nodes
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
 * NOT MIGRATED: Uses raw Drizzle for property value pattern search (facade doesn't support this)
 */
export const getBacklinksServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx): Promise<BacklinksResult> => {
    const {
      initDatabase,
      getDatabase,
      nodeProperties,
      assembleNode,
      like,
    } = await import('@nxus/db/server')

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
 * NOT MIGRATED: Uses raw Drizzle for efficiency (simple ownerId chain traversal)
 */
export const getOwnerChainServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx): Promise<OwnerChainResult> => {
    const { initDatabase, getDatabase, nodes, eq } = await import('@nxus/db/server')

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
 * NOT MIGRATED: Uses raw Drizzle (child node query by ownerId not in facade)
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
    const {
      initDatabase,
      getDatabase,
      nodes,
      assembleNode,
      eq,
      and,
      isNull,
    } = await import('@nxus/db/server')

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
            (st: { id: string; content: string; systemId: string | null }) => st.systemId === supertagSystemId,
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
