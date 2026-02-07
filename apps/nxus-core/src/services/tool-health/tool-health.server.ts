/**
 * Tool Health Server Functions
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { toolHealthService } from './tool-health.service'
import type { ToolHealthResult } from './types'

const CheckToolHealthInput = z.object({
  checkCommand: z.string(),
  skipCache: z.boolean().optional(),
})

export const checkToolHealth = createServerFn({ method: 'GET' })
  .inputValidator(CheckToolHealthInput)
  .handler(async ({ data }): Promise<ToolHealthResult> => {
    // Note: skipCache is ignored for now as the service handles caching internally
    return await toolHealthService.checkToolStatus(
      data.checkCommand,
      data.checkCommand,
    )
  })

const BatchCheckToolHealthInput = z.object({
  items: z.array(z.object({ id: z.string(), checkCommand: z.string() })),
})

export interface BatchToolHealthResult {
  results: Record<string, ToolHealthResult>
}

export const batchCheckToolHealth = createServerFn({ method: 'POST' })
  .inputValidator(BatchCheckToolHealthInput)
  .handler(async ({ data }): Promise<BatchToolHealthResult> => {
    const results: Record<string, ToolHealthResult> = {}
    await Promise.all(
      data.items.map(async (item) => {
        results[item.id] = await toolHealthService.checkToolStatus(
          item.id,
          item.checkCommand,
        )
      }),
    )
    return { results }
  })
