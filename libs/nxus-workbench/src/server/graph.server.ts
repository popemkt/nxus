/**
 * graph.server.ts - Graph-specific server functions
 *
 * Provides optimized endpoints for graph visualization:
 * - Lightweight graph structure for large graphs (500+ nodes)
 * - Recursive backlink queries with depth parameter
 * - Edge-only queries for incremental updates
 *
 * IMPORTANT: All @nxus/db/server imports are done dynamically inside handlers
 * to prevent Vite from bundling better-sqlite3 into the client bundle.
 *
 * ARCHITECTURE NOTE: These functions perform performance-sensitive work for
 * graph visualization with 500+ nodes. They use raw Drizzle queries on the
 * nodes and nodeProperties tables for lightweight data extraction WITHOUT
 * full node assembly. The NodeFacade is used only where it provides value
 * (e.g., getNodesBySupertagWithInheritance) while keeping raw Drizzle access
 * for performance-critical lightweight queries.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// Re-export types from the client-safe types file
export type {
  LightweightGraphNode,
  LightweightGraphEdge,
  GraphStructureResult,
  RecursiveBacklinksResult,
} from './graph.types.js'

// Import types for use in this file
import type {
  LightweightGraphNode,
  LightweightGraphEdge,
  GraphStructureResult,
  RecursiveBacklinksResult,
} from './graph.types.js'

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * UUID pattern for identifying node references in property values.
 */
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Parse node references from a property value.
 */
function parseNodeReferences(value: string | null): string[] {
  if (!value) return []

  try {
    const parsed = JSON.parse(value)

    // Single UUID
    if (typeof parsed === 'string' && UUID_PATTERN.test(parsed)) {
      return [parsed]
    }

    // Array of UUIDs
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (id): id is string => typeof id === 'string' && UUID_PATTERN.test(id),
      )
    }
  } catch {
    // Not valid JSON
  }

  return []
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get lightweight graph structure for efficient visualization.
 *
 * Returns only essential data for rendering:
 * - Node ID, label, supertag (no full property assembly)
 * - Edges as source/target/type tuples
 *
 * This is optimized for graphs with 500+ nodes where full assembly
 * would be too slow.
 */
export const getGraphStructureServerFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      supertagSystemId: z.string().optional(),
      limit: z.number().optional(),
      includeHierarchy: z.boolean().optional(),
      includeReferences: z.boolean().optional(),
    }),
  )
  .handler(async (ctx): Promise<GraphStructureResult> => {
    // Import facade for high-level operations
    const { nodeFacade } = await import('@nxus/db/server')

    // Import raw Drizzle access for lightweight queries
    const {
      getDatabase,
      nodes,
      nodeProperties,
      eq,
      and,
      isNull,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')

    const {
      supertagSystemId,
      limit = 1000,
      includeHierarchy = true,
      includeReferences = true,
    } = ctx.data

    // Initialize facade (idempotent, ensures DB is ready)
    await nodeFacade.init()

    // Get raw Drizzle DB for lightweight queries
    const db = getDatabase()

    // Build EXPLICIT_RELATIONSHIP_FIELDS set dynamically
    const EXPLICIT_RELATIONSHIP_FIELDS = new Set([
      SYSTEM_FIELDS.DEPENDENCIES,
      SYSTEM_FIELDS.PARENT,
      SYSTEM_FIELDS.TAGS,
      SYSTEM_FIELDS.SUPERTAG,
      SYSTEM_FIELDS.EXTENDS,
    ])

    // Get field node IDs for lookups
    const supertagFieldNode = db
      .select()
      .from(nodes)
      .where(eq(nodes.systemId, SYSTEM_FIELDS.SUPERTAG))
      .get()

    const dependenciesFieldNode = db
      .select()
      .from(nodes)
      .where(eq(nodes.systemId, SYSTEM_FIELDS.DEPENDENCIES))
      .get()

    const supertagFieldId = supertagFieldNode?.id

    // Helper to get primary supertag ID
    function getPrimarySupertagId(nodeId: string): string | null {
      if (!supertagFieldId) return null

      const supertagProp = db
        .select()
        .from(nodeProperties)
        .where(
          and(
            eq(nodeProperties.nodeId, nodeId),
            eq(nodeProperties.fieldNodeId, supertagFieldId),
          ),
        )
        .get()

      if (!supertagProp) return null

      try {
        const value = JSON.parse(supertagProp.value || '')
        return typeof value === 'string' ? value : null
      } catch {
        return null
      }
    }

    // Fetch nodes based on filter
    type RawNode = {
      id: string
      content: string | null
      systemId: string | null
      ownerId: string | null
      createdAt: Date
      updatedAt: Date
      deletedAt: Date | null
      contentPlain: string | null
    }

    let rawNodes: RawNode[]
    if (supertagSystemId) {
      // Use facade for supertag-based filtering with inheritance
      const filteredNodes = await nodeFacade.getNodesBySupertagWithInheritance(
        supertagSystemId,
      )
      rawNodes = filteredNodes.slice(0, limit).map((an) => ({
        id: an.id,
        content: an.content,
        systemId: an.systemId,
        ownerId: an.ownerId,
        createdAt: an.createdAt,
        updatedAt: an.updatedAt,
        deletedAt: an.deletedAt,
        contentPlain: null,
      }))
    } else {
      rawNodes = db
        .select()
        .from(nodes)
        .where(isNull(nodes.deletedAt))
        .limit(limit)
        .all()
    }

    // Build node ID set for edge validation
    const nodeIdSet = new Set(rawNodes.map((n) => n.id))

    // Build supertag cache and nodes
    const supertagNames: Record<string, string> = {}
    const graphNodes: LightweightGraphNode[] = []

    for (const node of rawNodes) {
      // Get primary supertag
      let supertagId: string | null = null
      let supertagName: string | null = null

      if (supertagFieldId) {
        supertagId = getPrimarySupertagId(node.id)
        if (supertagId && !supertagNames[supertagId]) {
          // Fetch supertag name
          const stNode = db
            .select()
            .from(nodes)
            .where(eq(nodes.id, supertagId))
            .get()
          if (stNode) {
            supertagNames[supertagId] = stNode.content ?? stNode.systemId ?? 'Unknown'
          }
        }
        supertagName = supertagId ? (supertagNames[supertagId] || null) : null
      }

      graphNodes.push({
        id: node.id,
        label: node.content ?? node.systemId ?? 'Untitled',
        systemId: node.systemId,
        supertagId,
        supertagName,
        ownerId: node.ownerId,
      })
    }

    // Extract edges
    const edges: LightweightGraphEdge[] = []
    const seenEdges = new Set<string>()

    function addEdge(
      source: string,
      target: string,
      type: LightweightGraphEdge['type'],
    ) {
      // Only add edges between nodes in our graph
      if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) return
      // Skip self-references
      if (source === target) return

      const key = `${source}-${type}-${target}`
      if (seenEdges.has(key)) return
      seenEdges.add(key)

      edges.push({ source, target, type })
    }

    // Get all properties for our nodes in one query (more efficient)
    const allProps = db
      .select()
      .from(nodeProperties)
      .all()
      .filter((p: { nodeId: string }) => nodeIdSet.has(p.nodeId))

    // Group properties by node
    const propsByNode = new Map<string, typeof allProps>()
    for (const prop of allProps) {
      const existing = propsByNode.get(prop.nodeId) || []
      existing.push(prop)
      propsByNode.set(prop.nodeId, existing)
    }

    // Extract edges from properties
    for (const node of rawNodes) {
      const props = propsByNode.get(node.id) || []

      for (const prop of props) {
        // Handle dependencies
        if (
          dependenciesFieldNode &&
          prop.fieldNodeId === dependenciesFieldNode.id
        ) {
          const targetIds = parseNodeReferences(prop.value)
          for (const targetId of targetIds) {
            addEdge(node.id, targetId, 'dependency')
          }
          continue
        }

        // Skip explicit relationship fields for generic reference extraction
        // (We handle them separately or skip them)
        if (EXPLICIT_RELATIONSHIP_FIELDS.has(prop.fieldNodeId)) {
          continue
        }

        // Extract generic references if enabled
        if (includeReferences) {
          const refIds = parseNodeReferences(prop.value)
          for (const refId of refIds) {
            addEdge(node.id, refId, 'reference')
          }
        }
      }

      // Extract hierarchy edges if enabled
      if (includeHierarchy && node.ownerId && nodeIdSet.has(node.ownerId)) {
        addEdge(node.ownerId, node.id, 'hierarchy')
      }
    }

    return {
      success: true,
      nodes: graphNodes,
      edges,
      supertagNames,
    }
  })

/**
 * Get backlinks for a node with optional recursive depth.
 *
 * When depth > 1, performs BFS to find indirect backlinks
 * (nodes that reference nodes that reference this node).
 */
export const getBacklinksWithDepthServerFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      depth: z.number().min(1).max(3).optional(),
    }),
  )
  .handler(async (ctx): Promise<RecursiveBacklinksResult> => {
    // Import facade for initialization
    const { nodeFacade } = await import('@nxus/db/server')

    // Import raw Drizzle access for lightweight queries
    const {
      getDatabase,
      nodes,
      nodeProperties,
      eq,
      and,
      like,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')

    const { nodeId, depth = 1 } = ctx.data

    // Initialize facade (idempotent, ensures DB is ready)
    await nodeFacade.init()

    // Get raw Drizzle DB for lightweight queries
    const db = getDatabase()

    // Get supertag field for looking up supertag IDs
    const supertagFieldNode = db
      .select()
      .from(nodes)
      .where(eq(nodes.systemId, SYSTEM_FIELDS.SUPERTAG))
      .get()
    const supertagFieldId = supertagFieldNode?.id

    // Helper to get primary supertag ID
    function getPrimarySupertagId(nId: string): string | null {
      if (!supertagFieldId) return null

      const supertagProp = db
        .select()
        .from(nodeProperties)
        .where(
          and(
            eq(nodeProperties.nodeId, nId),
            eq(nodeProperties.fieldNodeId, supertagFieldId),
          ),
        )
        .get()

      if (!supertagProp) return null

      try {
        const value = JSON.parse(supertagProp.value || '')
        return typeof value === 'string' ? value : null
      } catch {
        return null
      }
    }

    const backlinks: RecursiveBacklinksResult['backlinks'] = []
    const visited = new Set<string>([nodeId]) // Don't include the target node
    const queue: Array<{ targetId: string; currentDepth: number }> = [
      { targetId: nodeId, currentDepth: 0 },
    ]

    while (queue.length > 0) {
      const { targetId, currentDepth } = queue.shift()!

      if (currentDepth >= depth) continue

      // Find all properties containing this node's ID
      const searchPattern = `%${targetId}%`
      const referencingProps = db
        .select()
        .from(nodeProperties)
        .where(like(nodeProperties.value, searchPattern))
        .all()

      // Get unique referencing node IDs
      for (const prop of referencingProps) {
        // Verify it's actually a reference
        try {
          const value = JSON.parse(prop.value || '')
          const isReference =
            value === targetId ||
            (Array.isArray(value) && value.includes(targetId))

          if (!isReference) continue

          const refNodeId = prop.nodeId
          if (visited.has(refNodeId)) continue
          visited.add(refNodeId)

          // Get node info
          const refNode = db
            .select()
            .from(nodes)
            .where(eq(nodes.id, refNodeId))
            .get()

          if (!refNode || refNode.deletedAt) continue

          // Get supertag
          let supertagId: string | null = null
          if (supertagFieldId) {
            supertagId = getPrimarySupertagId(refNodeId)
          }

          backlinks.push({
            nodeId: refNodeId,
            label: refNode.content ?? refNode.systemId ?? 'Untitled',
            supertagId,
            depth: currentDepth + 1,
          })

          // Queue for next depth level
          if (currentDepth + 1 < depth) {
            queue.push({ targetId: refNodeId, currentDepth: currentDepth + 1 })
          }
        } catch {
          // Skip non-JSON values
        }
      }
    }

    return {
      success: true,
      backlinks,
      totalCount: backlinks.length,
    }
  })

/**
 * Get edges between a set of nodes.
 *
 * Useful for incremental graph updates when adding nodes
 * without re-fetching the entire graph.
 */
export const getEdgesBetweenNodesServerFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      nodeIds: z.array(z.string()),
      includeReferences: z.boolean().optional(),
    }),
  )
  .handler(
    async (
      ctx,
    ): Promise<{ success: true; edges: LightweightGraphEdge[] }> => {
      // Import facade for initialization
      const { nodeFacade } = await import('@nxus/db/server')

      // Import raw Drizzle access for lightweight queries
      const {
        getDatabase,
        nodes,
        nodeProperties,
        eq,
        SYSTEM_FIELDS,
      } = await import('@nxus/db/server')

      const { nodeIds, includeReferences = true } = ctx.data

      // Initialize facade (idempotent, ensures DB is ready)
      await nodeFacade.init()

      // Get raw Drizzle DB for lightweight queries
      const db = getDatabase()

      if (nodeIds.length === 0) {
        return { success: true, edges: [] }
      }

      // Build EXPLICIT_RELATIONSHIP_FIELDS set dynamically
      const EXPLICIT_RELATIONSHIP_FIELDS = new Set([
        SYSTEM_FIELDS.DEPENDENCIES,
        SYSTEM_FIELDS.PARENT,
        SYSTEM_FIELDS.TAGS,
        SYSTEM_FIELDS.SUPERTAG,
        SYSTEM_FIELDS.EXTENDS,
      ])

      const nodeIdSet = new Set(nodeIds)
      const edges: LightweightGraphEdge[] = []
      const seenEdges = new Set<string>()

      function addEdge(
        source: string,
        target: string,
        type: LightweightGraphEdge['type'],
      ) {
        if (!nodeIdSet.has(source) || !nodeIdSet.has(target)) return
        if (source === target) return

        const key = `${source}-${type}-${target}`
        if (seenEdges.has(key)) return
        seenEdges.add(key)

        edges.push({ source, target, type })
      }

      // Get dependencies field
      const dependenciesFieldNode = db
        .select()
        .from(nodes)
        .where(eq(nodes.systemId, SYSTEM_FIELDS.DEPENDENCIES))
        .get()

      // Get all properties for specified nodes
      const allProps: Array<{
        nodeId: string
        fieldNodeId: string
        value: string | null
      }> = []

      for (const nodeId of nodeIds) {
        const props = db
          .select()
          .from(nodeProperties)
          .where(eq(nodeProperties.nodeId, nodeId))
          .all()
        allProps.push(...props)
      }

      // Extract edges
      for (const prop of allProps) {
        // Handle dependencies
        if (
          dependenciesFieldNode &&
          prop.fieldNodeId === dependenciesFieldNode.id
        ) {
          const targetIds = parseNodeReferences(prop.value)
          for (const targetId of targetIds) {
            addEdge(prop.nodeId, targetId, 'dependency')
          }
          continue
        }

        // Skip explicit relationship fields
        if (EXPLICIT_RELATIONSHIP_FIELDS.has(prop.fieldNodeId)) {
          continue
        }

        // Extract generic references if enabled
        if (includeReferences) {
          const refIds = parseNodeReferences(prop.value)
          for (const refId of refIds) {
            addEdge(prop.nodeId, refId, 'reference')
          }
        }
      }

      // Extract hierarchy edges
      for (const nodeId of nodeIds) {
        const node = db
          .select()
          .from(nodes)
          .where(eq(nodes.id, nodeId))
          .get()

        if (node?.ownerId && nodeIdSet.has(node.ownerId)) {
          addEdge(node.ownerId, nodeId, 'hierarchy')
        }
      }

      return { success: true, edges }
    },
  )
