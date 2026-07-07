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
import {
  getAllNodes,
  getBacklinks,
  getChildNodes,
  getOwnerChain,
  getSupertags,
  searchNodes,
} from './operations.js'

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
    const result = await searchNodes(ctx.data)
    return { success: true, nodes: result.nodes }
  })

/**
 * Get all supertags (nodes that are themselves supertags)
 * Returns nodes with #Supertag supertag, including inheritance info
 * MIGRATED: Uses NodeFacade.getNodesBySupertagWithInheritance
 */
export const getSupertagsServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<SupertagsResult> => {
    const result = await getSupertags()
    return { success: true, supertags: result.supertags }
  },
)

/**
 * Get all nodes (with optional supertag filter)
 * Used by the Node Browser for listing all nodes
 * Uses NodeFacade through operations.ts for both filtered and all-nodes cases.
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
    const result = await getAllNodes(ctx.data)
    return { success: true, nodes: result.nodes }
  })

/**
 * Get backlinks for a node (nodes that reference this node)
 * Uses NodeFacade relation-query evaluation through operations.ts.
 */
export const getBacklinksServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx): Promise<BacklinksResult> => {
    const result = await getBacklinks(ctx.data)
    return { success: true, backlinks: result.backlinks }
  })

/**
 * Get the owner chain (breadcrumbs) for a node
 * Traverses up the ownerId chain until reaching the root
 * Uses NodeFacade owner-chain traversal through operations.ts.
 */
export const getOwnerChainServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx): Promise<OwnerChainResult> => {
    const result = await getOwnerChain(ctx.data)
    return { success: true, chain: result.chain }
  })

/**
 * Get child nodes of a parent node (nodes where ownerId === parentId)
 * Optionally filter by supertag (e.g., 'supertag:command')
 * Uses NodeFacade relation-query evaluation through operations.ts.
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
    const result = await getChildNodes(ctx.data)
    return { success: true, children: result.children }
  })
