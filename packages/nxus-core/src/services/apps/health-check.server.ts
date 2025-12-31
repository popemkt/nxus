import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

/**
 * Input schema for checking tool installation status
 */
const CheckToolInputSchema = z.object({
  checkCommand: z.string().describe('Command to check if tool is installed'),
})

/**
 * Result of a tool health check
 */
export interface ToolHealthCheckResult {
  isInstalled: boolean
  version?: string
  error?: string
}

/**
 * Server function to check if a tool is installed
 * Runs the checkCommand and parses the result
 */
export const checkToolInstallation = createServerFn({ method: 'GET' })
  .inputValidator(CheckToolInputSchema)
  .handler(async ({ data }): Promise<ToolHealthCheckResult> => {
    const { checkCommand } = data

    try {
      const { stdout, stderr } = await execAsync(checkCommand, {
        timeout: 5000, // 5 second timeout
      })

      // If the command succeeds, the tool is installed
      const output = stdout.trim() || stderr.trim()

      return {
        isInstalled: true,
        version: output,
      }
    } catch (error: any) {
      // Command failed - tool is not installed or not in PATH
      return {
        isInstalled: false,
        error: error.message,
      }
    }
  })

/**
 * Input schema for batch checking multiple tools
 */
const BatchCheckToolsInputSchema = z.object({
  tools: z
    .array(
      z.object({
        id: z.string(),
        checkCommand: z.string(),
      }),
    )
    .describe('Array of tools to check'),
})

/**
 * Result of batch tool health checks
 */
export interface BatchToolHealthCheckResult {
  results: Record<string, ToolHealthCheckResult>
}

/**
 * Server function to check multiple tools at once
 * More efficient than checking one by one
 */
export const batchCheckToolInstallation = createServerFn({ method: 'POST' })
  .inputValidator(BatchCheckToolsInputSchema)
  .handler(async ({ data }): Promise<BatchToolHealthCheckResult> => {
    const { tools } = data
    const results: Record<string, ToolHealthCheckResult> = {}

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
