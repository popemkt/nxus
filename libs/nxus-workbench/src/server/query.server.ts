/**
 * query.server.ts - TanStack server functions for query and node operations
 *
 * This file creates server functions that wrap the NodeFacade API
 * from @nxus/db. The dynamic imports inside handlers prevent Vite from
 * bundling better-sqlite3 into the client.
 *
 * Architecture:
 * - @nxus/db/server: NodeFacade API (evaluateQuery, createNode, etc.)
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
    const { nodeFacade } = await import('@nxus/db/server')
    const { definition, limit } = ctx.data

    await nodeFacade.init()

    const effectiveDefinition = {
      ...definition,
      limit: limit ?? definition.limit ?? 500,
    }

    const result = await nodeFacade.evaluateQuery(effectiveDefinition)

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
    const { nodeFacade, SYSTEM_SUPERTAGS, SYSTEM_FIELDS } = await import(
      '@nxus/db/server'
    )
    const { name, definition, ownerId } = ctx.data

    await nodeFacade.init()

    const queryId = await nodeFacade.createNode({
      content: name,
      supertagId: SYSTEM_SUPERTAGS.QUERY,
      ownerId,
    })

    await nodeFacade.setProperty(queryId, SYSTEM_FIELDS.QUERY_DEFINITION, definition)

    if (definition.sort) {
      await nodeFacade.setProperty(queryId, SYSTEM_FIELDS.QUERY_SORT, definition.sort)
    }

    if (definition.limit !== undefined) {
      await nodeFacade.setProperty(queryId, SYSTEM_FIELDS.QUERY_LIMIT, definition.limit)
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
    const { nodeFacade, SYSTEM_FIELDS } = await import('@nxus/db/server')
    const { queryId, name, definition } = ctx.data

    await nodeFacade.init()

    const existingNode = await nodeFacade.findNodeById(queryId)
    if (!existingNode) {
      throw new Error(`Query not found: ${queryId}`)
    }

    if (name !== undefined) {
      await nodeFacade.updateNodeContent(queryId, name)
    }

    if (definition !== undefined) {
      await nodeFacade.setProperty(queryId, SYSTEM_FIELDS.QUERY_DEFINITION, definition)

      if (definition.sort) {
        await nodeFacade.setProperty(queryId, SYSTEM_FIELDS.QUERY_SORT, definition.sort)
      }

      if (definition.limit !== undefined) {
        await nodeFacade.setProperty(queryId, SYSTEM_FIELDS.QUERY_LIMIT, definition.limit)
      }

      // Clear cached results when definition changes
      await nodeFacade.setProperty(queryId, SYSTEM_FIELDS.QUERY_RESULT_CACHE, null)
      await nodeFacade.setProperty(queryId, SYSTEM_FIELDS.QUERY_EVALUATED_AT, null)
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
    const { nodeFacade } = await import('@nxus/db/server')
    const { queryId } = ctx.data

    await nodeFacade.init()

    const existingNode = await nodeFacade.findNodeById(queryId)
    if (!existingNode) {
      throw new Error(`Query not found: ${queryId}`)
    }

    await nodeFacade.deleteNode(queryId)

    return {
      success: true as const,
    }
  })

/**
 * Get all saved queries
 */
export const getSavedQueriesServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { nodeFacade, getProperty, SYSTEM_SUPERTAGS, FIELD_NAMES } = await import(
      '@nxus/db/server'
    )

    await nodeFacade.init()

    const queryNodes = await nodeFacade.getNodesBySupertagWithInheritance(
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
    const { nodeFacade, getProperty, SYSTEM_FIELDS, FIELD_NAMES } = await import(
      '@nxus/db/server'
    )
    const { queryId, cacheResults } = ctx.data

    await nodeFacade.init()

    const queryNode = await nodeFacade.findNodeById(queryId)
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
    }
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
    const result = await nodeFacade.evaluateQuery(definition)

    // Optionally cache results
    if (cacheResults) {
      const cachedIds = result.nodes.map((n: { id: string }) => n.id)
      await nodeFacade.setProperty(queryId, SYSTEM_FIELDS.QUERY_RESULT_CACHE, cachedIds)
      await nodeFacade.setProperty(
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
 * Get all fields (for filter editor)
 */
export const getQueryFieldsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { nodeFacade, SYSTEM_SUPERTAGS } = await import('@nxus/db/server')

    await nodeFacade.init()

    const fieldNodes = await nodeFacade.getNodesBySupertagWithInheritance(
      SYSTEM_SUPERTAGS.FIELD
    )

    const fields = fieldNodes
      .map((node) => ({
        systemId: node.systemId || node.id,
        label: node.content || node.systemId || node.id,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))

    return {
      success: true as const,
      fields,
    }
  }
)

/**
 * Get all supertags (for filter editor)
 */
export const getQuerySupertagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { nodeFacade, SYSTEM_SUPERTAGS } = await import('@nxus/db/server')

    await nodeFacade.init()

    const supertags = await nodeFacade.getNodesBySupertagWithInheritance(
      SYSTEM_SUPERTAGS.SUPERTAG
    )

    return {
      success: true as const,
      supertags,
    }
  }
)
