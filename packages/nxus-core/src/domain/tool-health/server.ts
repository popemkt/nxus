/**
 * Tool Health Server Functions
 *
 * TanStack Start server functions for checking tool health.
 * These run on the server and use ToolHealthService for caching.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { toolHealthService } from './service'
import type { ToolHealthResult } from './types'

/**
 * Input schema for health check
 */
const CheckToolHealthInput = z.object({
  checkCommand: z
    .string()
    .describe('Shell command to check if tool is installed'),
  skipCache: z
    .boolean()
    .optional()
    .describe('Skip ephemeral DB cache and run fresh check'),
})

/**
 * Server function to check a tool's health status
 *
 * Checks ephemeral DB cache first, runs shell command if cache miss or expired.
 */
export const checkToolHealth = createServerFn({ method: 'GET' })
  .inputValidator(CheckToolHealthInput)
  .handler(async ({ data }): Promise<ToolHealthResult> => {
    const { checkCommand, skipCache } = data

    return await toolHealthService.checkToolStatus(
      checkCommand, // Use checkCommand as toolId for deduplication
      checkCommand,
      { skipCache },
    )
  })

/**
 * Input schema for batch health check
 */
const BatchCheckToolHealthInput = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        checkCommand: z.string(),
      }),
    )
    .describe('Array of tools to check'),
})

/**
 * Result of batch health check
 */
export interface BatchToolHealthResult {
  results: Record<string, ToolHealthResult>
}

/**
 * Server function to check multiple tools at once
 */
export const batchCheckToolHealth = createServerFn({ method: 'POST' })
  .inputValidator(BatchCheckToolHealthInput)
  .handler(async ({ data }): Promise<BatchToolHealthResult> => {
    console.log('[batchCheckToolHealth] Checking items:', data.items.length)
    const { items } = data
    const results: Record<string, ToolHealthResult> = {}

    // Check all items in parallel
    await Promise.all(
      items.map(async (item) => {
        results[item.id] = await toolHealthService.checkToolStatus(
          item.id,
          item.checkCommand,
        )
      }),
    )

    console.log('[batchCheckToolHealth] Completed checks')
    return { results }
  })
