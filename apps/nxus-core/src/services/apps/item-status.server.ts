import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { toolHealthService } from '../tool-health/tool-health.service'

/**
 * Input schema for checking item installation status
 */
const CheckItemStatusInputSchema = z.object({
  checkCommand: z.string().describe('Command to check if item is ready'),
})

/**
 * Result of an item status check
 */
export interface ItemStatusResult {
  isInstalled: boolean
  version?: string
  error?: string
}

/**
 * Server function to check if an item is ready
 * Uses ToolHealthService for caching with 5-minute TTL
 */
export const checkItemStatus = createServerFn({ method: 'GET' })
  .inputValidator(CheckItemStatusInputSchema)
  .handler(async ({ data }): Promise<ItemStatusResult> => {
    const { checkCommand } = data

    // Use checkCommand as toolId (unique identifier)
    // This allows deduplication across tools with same check command
    return await toolHealthService.checkToolStatus(checkCommand, checkCommand)
  })

/**
 * Input schema for batch checking multiple items
 */
const BatchCheckItemsInputSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string(),
        checkCommand: z.string(),
      }),
    )
    .describe('Array of items to check'),
})

/**
 * Result of batch item status checks
 */
export interface BatchItemStatusResult {
  results: Record<string, ItemStatusResult>
}

/**
 * Server function to check multiple items at once
 * Uses ToolHealthService for cached checks
 */
export const batchCheckItemStatus = createServerFn({ method: 'POST' })
  .inputValidator(BatchCheckItemsInputSchema)
  .handler(async ({ data }): Promise<BatchItemStatusResult> => {
    console.log('[batchCheckItemStatus] Checking items:', data.items.length)
    const { items } = data
    const results: Record<string, ItemStatusResult> = {}

    // Check all items in parallel using the service
    await Promise.all(
      items.map(async (item) => {
        results[item.id] = await toolHealthService.checkToolStatus(
          item.id,
          item.checkCommand,
        )
      }),
    )

    console.log('[batchCheckItemStatus] Completed checks')
    return { results }
  })
