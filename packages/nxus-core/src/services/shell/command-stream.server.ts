import { spawn } from 'child_process'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

/**
 * Types for streaming command output chunks
 */
export type StreamChunk =
  | { type: 'stdout'; data: string }
  | { type: 'stderr'; data: string }
  | { type: 'exit'; exitCode: number; signal: string | null }
  | { type: 'error'; message: string }

const StreamCommandInputSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
})

/**
 * Streaming command execution using async generator.
 * Yields typed chunks as stdout/stderr data arrives from the spawned process.
 *
 * @example
 * ```typescript
 * for await (const chunk of await streamCommandServerFn({ data: { command: 'npm', args: ['install'] } })) {
 *   if (chunk.type === 'stdout') console.log(chunk.data)
 *   if (chunk.type === 'exit') console.log('Exit code:', chunk.exitCode)
 * }
 * ```
 */
export const streamCommandServerFn = createServerFn({ method: 'POST' })
  .inputValidator(StreamCommandInputSchema)
  .handler(async function* (ctx) {
    console.log('[streamCommandServerFn] Input:', ctx.data)
    const { command, args = [], cwd, env } = ctx.data

    // Queue for incoming chunks
    const chunks: StreamChunk[] = []
    let resolveChunk: (() => void) | null = null
    let done = false

    const child = spawn(command, args, {
      cwd: cwd || process.cwd(),
      env: env ? { ...process.env, ...env } : process.env,
      shell: true,
    })

    child.stdout?.on('data', (data) => {
      chunks.push({ type: 'stdout', data: data.toString() })
      resolveChunk?.()
    })

    child.stderr?.on('data', (data) => {
      chunks.push({ type: 'stderr', data: data.toString() })
      resolveChunk?.()
    })

    child.on('close', (exitCode, signal) => {
      console.log('[streamCommandServerFn] Success:', command, exitCode)
      chunks.push({ type: 'exit', exitCode: exitCode || 0, signal })
      done = true
      resolveChunk?.()
    })

    child.on('error', (error) => {
      console.error('[streamCommandServerFn] Error:', command, error.message)
      chunks.push({ type: 'error', message: error.message })
      done = true
      resolveChunk?.()
    })

    // Yield chunks as they arrive
    while (!done || chunks.length > 0) {
      if (chunks.length > 0) {
        yield chunks.shift()!
      } else {
        await new Promise<void>((resolve) => {
          resolveChunk = resolve
        })
      }
    }
  })
