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

/** @deprecated Use ItemStatusResult instead */
export type ToolHealthCheckResult = ItemStatusResult

/**
 * Server function to check if an item is installed
 * Runs the checkCommand and parses the result
 */
export const checkToolInstallation = createServerFn({ method: 'GET' })
  .inputValidator(CheckItemStatusInputSchema)
  .handler(async ({ data }): Promise<ItemStatusResult> => {
    const { checkCommand } = data

    try {
      const { stdout, stderr } = await execAsync(checkCommand, {
        timeout: 5000, // 5 second timeout
      })

      // If the command succeeds, the item is installed
      const output = stdout.trim() || stderr.trim()

      return {
        isInstalled: true,
        version: output,
      }
    } catch (error: any) {
      // Command failed - item is not installed or not in PATH
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
  tools: z
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

/** @deprecated Use BatchItemStatusResult instead */
export type BatchToolHealthCheckResult = BatchItemStatusResult

/**
 * Server function to check multiple items at once
 * More efficient than checking one by one
 */
export const batchCheckToolInstallation = createServerFn({ method: 'POST' })
  .inputValidator(BatchCheckItemsInputSchema)
  .handler(async ({ data }): Promise<BatchItemStatusResult> => {
    const { tools } = data
    const results: Record<string, ItemStatusResult> = {}

    // Check all tools in parallel
    await Promise.all(
      tools.map(async (tool) => {
        try {
          const { stdout, stderr } = await execAsync(tool.checkCommand, {
            timeout: 5000,
          })

          const output = stdout.trim() || stderr.trim()
          results[tool.id] = {
            isInstalled: true,
            version: output,
          }
        } catch (error: any) {
          results[tool.id] = {
            isInstalled: false,
            error: error.message,
          }
        }
      }),
    )

    return { results }
  })
