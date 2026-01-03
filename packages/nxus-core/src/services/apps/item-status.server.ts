import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

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
 * Runs the checkCommand and parses the result
 */
export const checkItemStatus = createServerFn({ method: 'GET' })
  .inputValidator(CheckItemStatusInputSchema)
  .handler(async ({ data }): Promise<ItemStatusResult> => {
    const { checkCommand } = data

    try {
      const { stdout, stderr } = await execAsync(checkCommand, {
        timeout: 5000, // 5 second timeout
      })

      const output = stdout.trim() || stderr.trim()

      return {
        isInstalled: true,
        version: output,
      }
    } catch (error: any) {
      return {
        isInstalled: false,
        error: error.message,
      }
    }
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
 */
export const batchCheckItemStatus = createServerFn({ method: 'POST' })
  .inputValidator(BatchCheckItemsInputSchema)
  .handler(async ({ data }): Promise<BatchItemStatusResult> => {
    const { items } = data
    const results: Record<string, ItemStatusResult> = {}

    // Check all items in parallel
    await Promise.all(
      items.map(async (item) => {
        try {
          const { stdout, stderr } = await execAsync(item.checkCommand, {
            timeout: 5000,
          })

          const output = stdout.trim() || stderr.trim()
          results[item.id] = {
            isInstalled: true,
            version: output,
          }
        } catch (error: any) {
          results[item.id] = {
            isInstalled: false,
            error: error.message,
          }
        }
      }),
    )

    return { results }
  })
