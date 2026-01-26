/**
 * query.server.ts - TanStack server functions for query operations
 *
 * Provides server-side API for:
 * - Evaluating ad-hoc query definitions
 * - Creating, updating, deleting saved queries
 * - Listing and executing saved queries
 *
 * All queries are stored as nodes with supertag:query.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  getDatabase,
  initDatabase,
  initDatabaseWithBootstrap,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  createNode,
  setProperty,
  updateNodeContent,
  deleteNode,
  findNode,
  getNodesBySupertagWithInheritance,
  getProperty,
  evaluateQuery,
  type AssembledNode,
} from '@nxus/db/server'
import {
  EvaluateQueryInputSchema,
  CreateQueryInputSchema,
  UpdateQueryInputSchema,
  type QueryDefinition,
} from '@nxus/db'

// ============================================================================
// Query Evaluation
// ============================================================================

/**
 * Evaluate a query definition and return matching nodes
 *
 * This is the main entry point for executing ad-hoc queries from the frontend.
 * The query is evaluated on demand without being saved.
 */
export const evaluateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(EvaluateQueryInputSchema)
  .handler(async (ctx) => {
    const { definition, limit } = ctx.data

    // Initialize database with bootstrap (ensures system nodes exist)
    const db = await initDatabaseWithBootstrap()

    // Apply optional limit override
    const effectiveDefinition: QueryDefinition = {
      ...definition,
      limit: limit ?? definition.limit ?? 500,
    }

    // Evaluate the query
    const result = evaluateQuery(db, effectiveDefinition)

    return {
      success: true as const,
      nodes: result.nodes,
      totalCount: result.totalCount,
      evaluatedAt: result.evaluatedAt,
    }
  })

// ============================================================================
// Saved Query CRUD
// ============================================================================

/**
 * Create a new saved query
 *
 * Creates a node with supertag:query and stores the query definition
 * as a property. The query name is stored in the node's content field.
 */
export const createQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(CreateQueryInputSchema)
  .handler(async (ctx) => {
    const { name, definition, ownerId } = ctx.data

    // Initialize database with bootstrap
    const db = await initDatabaseWithBootstrap()

    // Create the query node
    const queryId = createNode(db, {
      content: name,
      supertagSystemId: SYSTEM_SUPERTAGS.QUERY,
      ownerId,
    })

    // Store the query definition
    setProperty(db, queryId, SYSTEM_FIELDS.QUERY_DEFINITION, definition)

    // Store sort if provided
    if (definition.sort) {
      setProperty(db, queryId, SYSTEM_FIELDS.QUERY_SORT, definition.sort)
    }

    // Store limit if provided
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
 *
 * Updates the name and/or definition of a saved query node.
 */
export const updateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(UpdateQueryInputSchema)
  .handler(async (ctx) => {
    const { queryId, name, definition } = ctx.data

    initDatabase()
    const db = getDatabase()

    // Verify the query exists
    const existingNode = findNode(db, queryId)
    if (!existingNode) {
      throw new Error(`Query not found: ${queryId}`)
    }

    // Update name if provided
    if (name !== undefined) {
      updateNodeContent(db, queryId, name)
    }

    // Update definition if provided
    if (definition !== undefined) {
      setProperty(db, queryId, SYSTEM_FIELDS.QUERY_DEFINITION, definition)

      // Update sort
      if (definition.sort) {
        setProperty(db, queryId, SYSTEM_FIELDS.QUERY_SORT, definition.sort)
      }

      // Update limit
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
 * Delete a saved query
 *
 * Soft-deletes the query node.
 */
export const deleteQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ queryId: z.string() }))
  .handler(async (ctx) => {
    const { queryId } = ctx.data

    initDatabase()
    const db = getDatabase()

    // Verify the query exists
    const existingNode = findNode(db, queryId)
    if (!existingNode) {
      throw new Error(`Query not found: ${queryId}`)
    }

    // Soft delete the query
    deleteNode(db, queryId)

    return {
      success: true as const,
    }
  })

// ============================================================================
// Query Listing & Execution
// ============================================================================

/**
 * Get all saved queries
 *
 * Returns all nodes with supertag:query, assembled with their properties.
 */
export const getSavedQueriesServerFn = createServerFn({ method: 'GET' })
  .handler(async (): Promise<{ success: true; queries: SavedQueryResponse[] }> => {
    // Initialize database with bootstrap
    const db = await initDatabaseWithBootstrap()

    // Get all query nodes
    const queryNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.QUERY)

    // Convert to SavedQuery format
    const queries = queryNodes.map((node) => nodeToSavedQuery(node))

    return {
      success: true,
      queries,
    }
  })

/**
 * Execute saved query result type
 */
type ExecuteSavedQueryResult = {
  success: true
  query: SavedQueryResponse
  nodes: AssembledNode[]
  totalCount: number
  evaluatedAt: Date
}

/**
 * Execute a saved query by ID
 *
 * Loads the query definition from the saved query node and evaluates it.
 * Optionally caches the results in the query node.
 */
export const executeSavedQueryServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({
    queryId: z.string(),
    cacheResults: z.boolean().optional().default(false),
  }))
  .handler(async (ctx): Promise<ExecuteSavedQueryResult> => {
    const { queryId, cacheResults } = ctx.data

    // Initialize database with bootstrap
    const db = await initDatabaseWithBootstrap()

    // Load the query node
    const queryNode = findNode(db, queryId)
    if (!queryNode) {
      throw new Error(`Query not found: ${queryId}`)
    }

    // Convert to SavedQuery
    const query = nodeToSavedQuery(queryNode)

    // Evaluate the query
    const result = evaluateQuery(db, query.definition)

    // Optionally cache results
    if (cacheResults) {
      const cachedIds = result.nodes.map((n: AssembledNode) => n.id)
      setProperty(db, queryId, SYSTEM_FIELDS.QUERY_RESULT_CACHE, cachedIds)
      setProperty(db, queryId, SYSTEM_FIELDS.QUERY_EVALUATED_AT, result.evaluatedAt.toISOString())
    }

    return {
      success: true,
      query,
      nodes: result.nodes,
      totalCount: result.totalCount,
      evaluatedAt: result.evaluatedAt,
    }
  })

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Saved query structure returned from server functions
 *
 * Note: We use a simplified definition type here to avoid TypeScript issues
 * with recursive types in TanStack server function return types.
 * The actual value is a QueryDefinition but we type it loosely for serialization.
 */
interface SavedQueryResponse {
  id: string
  content: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  definition: any // QueryDefinition - typed loosely for TanStack serialization
  resultCache?: string[]
  evaluatedAt?: Date
  createdAt: Date
  updatedAt: Date
}

/**
 * Convert an AssembledNode to a SavedQuery response
 */
function nodeToSavedQuery(node: AssembledNode): SavedQueryResponse {
  // Get query definition from properties
  const definitionProp = getProperty<QueryDefinition>(node, 'query_definition')
  const definition: QueryDefinition = definitionProp ?? {
    filters: [],
    limit: 500,
  }

  // Get cached results if any
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
}
