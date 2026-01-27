/**
 * query.server.ts - TanStack server functions for query and node operations
 *
 * This file creates server functions that wrap the pure database functions
 * from @nxus/db. The dynamic imports inside handlers prevent Vite from
 * bundling better-sqlite3 into the client.
 *
 * Architecture:
 * - @nxus/db/server: Pure functions (evaluateQuery, createNode, etc.)
 * - This file: TanStack createServerFn wrappers with validation
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// ============================================================================
// Query Evaluation Server Functions
// ============================================================================

/**
 * Evaluate a query definition and return matching nodes
 */
export const evaluateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      definition: z.any(), // QueryDefinition
      limit: z.number().optional(),
    })
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, evaluateQuery } = await import(
      '@nxus/db/server'
    )
    const { definition, limit } = ctx.data

    const db = await initDatabaseWithBootstrap()

    const effectiveDefinition = {
      ...definition,
      limit: limit ?? definition.limit ?? 500,
    }

    const result = evaluateQuery(db, effectiveDefinition)

    return {
      success: true as const,
      nodes: result.nodes,
      totalCount: result.totalCount,
      evaluatedAt: result.evaluatedAt,
    }
  })

/**
 * Create a new saved query (stored as a node with supertag:query)
 */
export const createQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      name: z.string(),
      definition: z.any(), // QueryDefinition
      ownerId: z.string().optional(),
    })
  )
  .handler(async (ctx) => {
    const {
      initDatabaseWithBootstrap,
      createNode,
      setProperty,
      SYSTEM_SUPERTAGS,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')
    const { name, definition, ownerId } = ctx.data

    const db = await initDatabaseWithBootstrap()

    const queryId = createNode(db, {
      content: name,
      supertagSystemId: SYSTEM_SUPERTAGS.QUERY,
      ownerId,
    })

    setProperty(db, queryId, SYSTEM_FIELDS.QUERY_DEFINITION, definition)

    if (definition.sort) {
      setProperty(db, queryId, SYSTEM_FIELDS.QUERY_SORT, definition.sort)
    }

    if (definition.limit !== undefined) {
      setProperty(db, queryId, SYSTEM_FIELDS.QUERY_LIMIT, definition.limit)
    }

    return {
      success: true as const,
      queryId,
    }
  })

/**
 * Update an existing saved query
 */
export const updateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      queryId: z.string(),
      name: z.string().optional(),
      definition: z.any().optional(), // QueryDefinition
    })
  )
  .handler(async (ctx) => {
    const {
      initDatabase,
      getDatabase,
      findNode,
      updateNodeContent,
      setProperty,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')
    const { queryId, name, definition } = ctx.data

    initDatabase()
    const db = getDatabase()

    const existingNode = findNode(db, queryId)
    if (!existingNode) {
      throw new Error(`Query not found: ${queryId}`)
    }

    if (name !== undefined) {
      updateNodeContent(db, queryId, name)
    }

    if (definition !== undefined) {
      setProperty(db, queryId, SYSTEM_FIELDS.QUERY_DEFINITION, definition)

      if (definition.sort) {
        setProperty(db, queryId, SYSTEM_FIELDS.QUERY_SORT, definition.sort)
      }

      if (definition.limit !== undefined) {
        setProperty(db, queryId, SYSTEM_FIELDS.QUERY_LIMIT, definition.limit)
      }

      // Clear cached results when definition changes
      setProperty(db, queryId, SYSTEM_FIELDS.QUERY_RESULT_CACHE, null)
      setProperty(db, queryId, SYSTEM_FIELDS.QUERY_EVALUATED_AT, null)
    }

    return {
      success: true as const,
      queryId,
    }
  })

/**
 * Delete a saved query (soft delete)
 */
export const deleteQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ queryId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, findNode, deleteNode } = await import(
      '@nxus/db/server'
    )
    const { queryId } = ctx.data

    initDatabase()
    const db = getDatabase()

    const existingNode = findNode(db, queryId)
    if (!existingNode) {
      throw new Error(`Query not found: ${queryId}`)
    }

    deleteNode(db, queryId)

    return {
      success: true as const,
    }
  })

/**
 * Get all saved queries
 */
export const getSavedQueriesServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const {
      initDatabaseWithBootstrap,
      getNodesBySupertagWithInheritance,
      getProperty,
      SYSTEM_SUPERTAGS,
    } = await import('@nxus/db/server')

    const db = await initDatabaseWithBootstrap()

    const queryNodes = getNodesBySupertagWithInheritance(
      db,
      SYSTEM_SUPERTAGS.QUERY
    )

    const queries = queryNodes.map((node) => {
      const definition = getProperty(node, 'query_definition') ?? {
        filters: [],
        limit: 500,
      }
      const resultCache = getProperty<string[]>(node, 'query_result_cache')
      const evaluatedAtStr = getProperty<string>(node, 'query_evaluated_at')

      return {
        id: node.id,
        content: node.content || 'Untitled Query',
        definition,
        resultCache: resultCache ?? undefined,
        evaluatedAt: evaluatedAtStr ? new Date(evaluatedAtStr) : undefined,
        createdAt: node.createdAt,
        updatedAt: node.updatedAt,
      }
    })

    return {
      success: true as const,
      queries,
    }
  }
)

/**
 * Execute a saved query by ID
 */
export const executeSavedQueryServerFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      queryId: z.string(),
      cacheResults: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const {
      initDatabaseWithBootstrap,
      findNode,
      evaluateQuery,
      getProperty,
      setProperty,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')
    const { queryId, cacheResults } = ctx.data

    const db = await initDatabaseWithBootstrap()

    const queryNode = findNode(db, queryId)
    if (!queryNode) {
      throw new Error(`Query not found: ${queryId}`)
    }

    // Get query definition
    const definition = getProperty(queryNode, 'query_definition') ?? {
      filters: [],
      limit: 500,
    }
    const resultCache = getProperty<string[]>(queryNode, 'query_result_cache')
    const evaluatedAtStr = getProperty<string>(queryNode, 'query_evaluated_at')

    const query = {
      id: queryNode.id,
      content: queryNode.content || 'Untitled Query',
      definition,
      resultCache: resultCache ?? undefined,
      evaluatedAt: evaluatedAtStr ? new Date(evaluatedAtStr) : undefined,
      createdAt: queryNode.createdAt,
      updatedAt: queryNode.updatedAt,
    }

    // Evaluate the query
    const result = evaluateQuery(db, definition)

    // Optionally cache results
    if (cacheResults) {
      const cachedIds = result.nodes.map((n: { id: string }) => n.id)
      setProperty(db, queryId, SYSTEM_FIELDS.QUERY_RESULT_CACHE, cachedIds)
      setProperty(
        db,
        queryId,
        SYSTEM_FIELDS.QUERY_EVALUATED_AT,
        result.evaluatedAt.toISOString()
      )
    }

    return {
      success: true as const,
      query,
      nodes: result.nodes,
      totalCount: result.totalCount,
      evaluatedAt: result.evaluatedAt,
    }
  })

// ============================================================================
// Node Mutation Server Functions
// ============================================================================

/**
 * Create a new node
 */
export const createNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      content: z.string(),
      systemId: z.string().optional(),
      supertagSystemId: z.string().optional(),
      ownerId: z.string().optional(),
      properties: z.record(z.any()).optional(),
    })
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, createNode, setProperty } = await import(
      '@nxus/db/server'
    )
    const { content, systemId, supertagSystemId, ownerId, properties } =
      ctx.data

    const db = await initDatabaseWithBootstrap()

    const nodeId = createNode(db, {
      content,
      systemId,
      supertagSystemId,
      ownerId,
    })

    // Set additional properties if provided
    if (properties) {
      for (const [fieldSystemId, value] of Object.entries(properties)) {
        setProperty(db, nodeId, fieldSystemId, value)
      }
    }

    return {
      success: true as const,
      nodeId,
    }
  })

/**
 * Delete a node (soft delete)
 */
export const deleteNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, deleteNode } = await import(
      '@nxus/db/server'
    )
    const { nodeId } = ctx.data

    initDatabase()
    const db = getDatabase()

    deleteNode(db, nodeId)

    return {
      success: true as const,
    }
  })

/**
 * Update node content
 */
export const updateNodeContentServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      content: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, updateNodeContent } = await import(
      '@nxus/db/server'
    )
    const { nodeId, content } = ctx.data

    initDatabase()
    const db = getDatabase()

    updateNodeContent(db, nodeId, content)

    return {
      success: true as const,
    }
  })

/**
 * Set node properties
 */
export const setNodePropertiesServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      properties: z.record(z.any()),
    })
  )
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, setProperty } = await import(
      '@nxus/db/server'
    )
    const { nodeId, properties } = ctx.data

    initDatabase()
    const db = getDatabase()

    for (const [fieldSystemId, value] of Object.entries(properties)) {
      setProperty(db, nodeId, fieldSystemId, value)
    }

    return {
      success: true as const,
    }
  })

// ============================================================================
// Search Server Functions
// ============================================================================

/**
 * Get all supertags
 */
export const getSupertagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const {
      initDatabaseWithBootstrap,
      getNodesBySupertagWithInheritance,
      SYSTEM_SUPERTAGS,
    } = await import('@nxus/db/server')

    const db = await initDatabaseWithBootstrap()

    const supertags = getNodesBySupertagWithInheritance(
      db,
      SYSTEM_SUPERTAGS.SUPERTAG
    )

    return {
      success: true as const,
      supertags,
    }
  }
)

/**
 * Get backlinks for a node
 */
export const getBacklinksServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabase, getDatabase, assembleNode } = await import(
      '@nxus/db/server'
    )
    const { nodeProperties } = await import('@nxus/db/server')
    const { nodeId } = ctx.data

    initDatabase()
    const db = getDatabase()

    // Find all properties that reference this node
    const allProps = db.select().from(nodeProperties).all()
    const backlinks: string[] = []

    for (const prop of allProps) {
      try {
        const value = JSON.parse(prop.value || '')
        if (value === nodeId) {
          backlinks.push(prop.nodeId)
        } else if (Array.isArray(value) && value.includes(nodeId)) {
          backlinks.push(prop.nodeId)
        }
      } catch {
        // Skip malformed values
      }
    }

    // Get unique backlinks and assemble nodes
    const uniqueBacklinks = [...new Set(backlinks)]
    const backlinkNodes = uniqueBacklinks
      .map((id) => assembleNode(db, id))
      .filter((n): n is NonNullable<typeof n> => n !== null)

    return {
      success: true as const,
      backlinks: backlinkNodes,
    }
  })
