/**
 * query.server.ts - Local server function wrappers for query operations
 *
 * This file creates local server functions that wrap the external @nxus/workbench
 * functions. This is necessary because TanStack Start's bundler only properly
 * handles server functions that are defined within the same application.
 *
 * The wrappers use dynamic imports inside the handlers to prevent the bundler
 * from following the import chain at build time.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// ============================================================================
// Query Evaluation Server Functions
// ============================================================================

/**
 * Evaluate a query definition - local wrapper
 */
export const evaluateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      definition: z.any(), // QueryDefinition
      limit: z.number().optional(),
    })
  )
  .handler(async (ctx) => {
    const { evaluateQueryServerFn: fn } = await import('@nxus/workbench/server')
    return fn({ data: ctx.data })
  })

/**
 * Create a saved query - local wrapper
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
    const { createQueryServerFn: fn } = await import('@nxus/workbench/server')
    return fn({ data: ctx.data })
  })

/**
 * Update a saved query - local wrapper
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
    const { updateQueryServerFn: fn } = await import('@nxus/workbench/server')
    return fn({ data: ctx.data })
  })

/**
 * Delete a saved query - local wrapper
 */
export const deleteQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ queryId: z.string() }))
  .handler(async (ctx) => {
    const { deleteQueryServerFn: fn } = await import('@nxus/workbench/server')
    return fn({ data: ctx.data })
  })

/**
 * Get all saved queries - local wrapper
 */
export const getSavedQueriesServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getSavedQueriesServerFn: fn } = await import(
      '@nxus/workbench/server'
    )
    return fn()
  }
)

/**
 * Execute a saved query - local wrapper
 */
export const executeSavedQueryServerFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({
      queryId: z.string(),
      cacheResults: z.boolean().optional(),
    })
  )
  .handler(async (ctx) => {
    const { executeSavedQueryServerFn: fn } = await import(
      '@nxus/workbench/server'
    )
    return fn({ data: ctx.data })
  })

// ============================================================================
// Node Mutation Server Functions
// ============================================================================

/**
 * Create a node - local wrapper
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
    const { createNodeServerFn: fn } = await import('@nxus/workbench/server')
    return fn({ data: ctx.data })
  })

/**
 * Delete a node - local wrapper
 */
export const deleteNodeServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const { deleteNodeServerFn: fn } = await import('@nxus/workbench/server')
    return fn({ data: ctx.data })
  })

/**
 * Update node content - local wrapper
 */
export const updateNodeContentServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      content: z.string(),
    })
  )
  .handler(async (ctx) => {
    const { updateNodeContentServerFn: fn } = await import(
      '@nxus/workbench/server'
    )
    return fn({ data: ctx.data })
  })

/**
 * Set node properties - local wrapper
 */
export const setNodePropertiesServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      nodeId: z.string(),
      properties: z.record(z.any()),
    })
  )
  .handler(async (ctx) => {
    const { setNodePropertiesServerFn: fn } = await import(
      '@nxus/workbench/server'
    )
    return fn({ data: ctx.data })
  })

// ============================================================================
// Search Server Functions
// ============================================================================

/**
 * Get all supertags - local wrapper
 */
export const getSupertagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { getSupertagsServerFn: fn } = await import('@nxus/workbench/server')
    return fn()
  }
)

/**
 * Get backlinks for a node - local wrapper
 */
export const getBacklinksServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ nodeId: z.string() }))
  .handler(async (ctx) => {
    const { getBacklinksServerFn: fn } = await import('@nxus/workbench/server')
    return fn({ nodeId: ctx.data.nodeId })
  })
