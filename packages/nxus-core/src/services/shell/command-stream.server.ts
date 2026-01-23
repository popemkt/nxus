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

// Cache for project root (computed once per server instance)
let _projectRoot: string | null = null

/**
 * Find the monorepo root by traversing up to find pnpm-workspace.yaml
 * Must be called inside handler (uses require for fs)
 */
function getProjectRoot(): string {
  if (_projectRoot) return _projectRoot

  const fs = require('fs')
  const path = require('path')
  const url = require('url')

  const __filename = url.fileURLToPath(import.meta.url)
  let dir = path.dirname(__filename)

  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) {
      _projectRoot = dir
      return dir
    }
    const pkgPath = path.join(dir, 'package.json')
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
        if (pkg.workspaces) {
          _projectRoot = dir
          return dir
        }
      } catch {}
    }
    dir = path.dirname(dir)
  }
  _projectRoot = process.cwd()
  return _projectRoot
}

/**
 * Streaming command execution using async generator.
 * Yields typed chunks as stdout/stderr data arrives from the spawned process.
 */
export const streamCommandServerFn = createServerFn({ method: 'POST' })
  .inputValidator(StreamCommandInputSchema)
  .handler(async function* (ctx) {
    const { spawn } = require('child_process')
    const path = require('path')

    console.log('[streamCommandServerFn] Input:', ctx.data)
    const { command, args = [], cwd, env } = ctx.data

    // Get project root and resolve cwd
    const projectRoot = getProjectRoot()
    let resolvedCwd = process.cwd()
    if (cwd) {
      resolvedCwd = path.isAbsolute(cwd) ? cwd : path.join(projectRoot, cwd)
    }
    console.log('[streamCommandServerFn] Project root:', projectRoot)
    console.log('[streamCommandServerFn] Resolved cwd:', resolvedCwd)

    // Queue for incoming chunks
    const chunks: StreamChunk[] = []
    let resolveChunk: (() => void) | null = null
    let done = false

    const child = spawn(command, args, {
      cwd: resolvedCwd,
      env: env ? { ...process.env, ...env } : process.env,
      shell: true,
    })

    child.stdout?.on('data', (data: Buffer) => {
      chunks.push({ type: 'stdout', data: data.toString() })
      resolveChunk?.()
    })

    child.stderr?.on('data', (data: Buffer) => {
      chunks.push({ type: 'stderr', data: data.toString() })
      resolveChunk?.()
    })

    child.on('close', (exitCode: number | null, signal: string | null) => {
      console.log('[streamCommandServerFn] Success:', command, exitCode)
      chunks.push({ type: 'exit', exitCode: exitCode || 0, signal })
      done = true
      resolveChunk?.()
    })

    child.on('error', (error: Error) => {
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
