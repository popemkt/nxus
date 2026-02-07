import { spawn } from 'child_process'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export type CommandResult = {
  exitCode: number
  signal: string | null
  stdout: string
  stderr: string
}

const ExecuteCommandInputSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
})

/**
 * Execute a command and return the complete result
 * For non-streaming use cases
 *
 * @deprecated Use streamCommandServerFn instead for real-time output feedback.
 */
export const executeCommandServerFn = createServerFn({ method: 'POST' })
  .inputValidator(ExecuteCommandInputSchema)
  .handler(
    async (
      ctx,
    ): Promise<
      { success: true; data: CommandResult } | { success: false; error: string }
    > => {
      console.log('[executeCommandServerFn] Input:', ctx.data)
      try {
        const { command, args = [], cwd, env } = ctx.data

        return new Promise((resolve) => {
          let stdout = ''
          let stderr = ''

          const child = spawn(command, args, {
            cwd: cwd || process.cwd(),
            env: env ? { ...process.env, ...env } : process.env,
            shell: true,
          })

          child.stdout?.on('data', (data) => {
            stdout += data.toString()
          })

          child.stderr?.on('data', (data) => {
            stderr += data.toString()
          })

          child.on('close', (exitCode, signal) => {
            console.log('[executeCommandServerFn] Success:', command, exitCode)
            resolve({
              success: true,
              data: {
                exitCode: exitCode || 0,
                signal: signal || null,
                stdout,
                stderr,
              },
            })
          })

          child.on('error', (error) => {
            console.error(
              '[executeCommandServerFn] Error:',
              command,
              error.message,
            )
            resolve({
              success: false,
              error: `Failed to execute command: ${error.message}`,
            })
          })
        })
      } catch (error) {
        console.error('[executeCommandServerFn] Catch:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
  )
