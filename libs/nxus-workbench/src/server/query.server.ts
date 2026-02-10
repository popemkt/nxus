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
      supertagId: SYSTEM_SUPERTAGS.QUERY,
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
      findNodeById,
      updateNodeContent,
      setProperty,
      SYSTEM_FIELDS,
    } = await import('@nxus/db/server')
    const { queryId, name, definition } = ctx.data

    initDatabase()
    const db = getDatabase()

    const existingNode = findNodeById(db, queryId)
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
    const { initDatabase, getDatabase, findNodeById, deleteNode } = await import(
      '@nxus/db/server'
    )
    const { queryId } = ctx.data

    initDatabase()
    const db = getDatabase()

    const existingNode = findNodeById(db, queryId)
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
      FIELD_NAMES,
    } = await import('@nxus/db/server')

    const db = await initDatabaseWithBootstrap()

    const queryNodes = getNodesBySupertagWithInheritance(
      db,
      SYSTEM_SUPERTAGS.QUERY
    )

    const queries = queryNodes.map((node) => {
      // Field names must match the 'content' property in bootstrap.ts
      // (e.g., 'queryDefinition' not 'query_definition')
      const definition = getProperty(node, FIELD_NAMES.QUERY_DEFINITION) ?? {
        filters: [],
        limit: 500,
      }
      const resultCache = getProperty<string[]>(node, FIELD_NAMES.QUERY_RESULT_CACHE)
      const evaluatedAtStr = getProperty<string>(node, FIELD_NAMES.QUERY_EVALUATED_AT)

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
export const executeSavedQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      queryId: z.string(),
      cacheResults: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const {
      initDatabaseWithBootstrap,
      findNodeById,
      evaluateQuery,
      getProperty,
      setProperty,
      SYSTEM_FIELDS,
      FIELD_NAMES,
    } = await import('@nxus/db/server')
    const { queryId, cacheResults } = ctx.data

    const db = await initDatabaseWithBootstrap()

    const queryNode = findNodeById(db, queryId)
    if (!queryNode) {
      throw new Error(`Query not found: ${queryId}`)
    }

    // Get query definition - ensure it has required fields for evaluateQuery
    // Field names must match the 'content' property in bootstrap.ts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const storedDefinition = getProperty(queryNode, FIELD_NAMES.QUERY_DEFINITION) as any
    const definition = {
      filters: Array.isArray(storedDefinition?.filters) ? storedDefinition.filters : [],
      limit: typeof storedDefinition?.limit === 'number' ? storedDefinition.limit : 500,
      sort: storedDefinition?.sort,
    } as Parameters<typeof evaluateQuery>[1]
    const resultCache = getProperty<string[]>(queryNode, FIELD_NAMES.QUERY_RESULT_CACHE)
    const evaluatedAtStr = getProperty<string>(queryNode, FIELD_NAMES.QUERY_EVALUATED_AT)

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

/**
 * Get all supertags (for filter editor)
 */
export const getQuerySupertagsServerFn = createServerFn({ method: 'GET' }).handler(
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
