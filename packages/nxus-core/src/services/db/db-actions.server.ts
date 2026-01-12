/**
 * db-actions.server.ts - Server functions for database operations
 *
 * Exposes db:seed, db:export, db:migrate commands to the UI.
 */

import { createServerFn } from '@tanstack/react-start'
import { spawn } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Path to nxus-core package root
const packageRoot = dirname(dirname(__dirname))

type DbCommand = 'seed' | 'export' | 'migrate'

const commandDescriptions: Record<DbCommand, string> = {
  seed: 'Load data from JSON files into SQLite',
  export: 'Export SQLite data to JSON files',
  migrate: 'One-time migration from manifest files',
}

/**
 * Get the nxus-core package root path
 */
export const getPackageRootServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { PATHS } = await import('@/paths')
    return { path: PATHS.nxusCoreRoot }
  },
)

/**
 * Run a database command (seed, export, migrate)
 */
export const runDbCommandServerFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { command: DbCommand }) => data)
  .handler(async (ctx) => {
    const { command } = ctx.data

    console.log(`[runDbCommandServerFn] Running db:${command}`)

    return new Promise<{
      success: boolean
      output: string
      error?: string
    }>((resolve) => {
      const child = spawn('npm', ['run', `db:${command}`], {
        cwd: packageRoot,
        shell: true,
        env: { ...process.env },
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        if (code === 0) {
          console.log(`[runDbCommandServerFn] db:${command} completed`)
          resolve({
            success: true,
            output: stdout || `db:${command} completed successfully`,
          })
        } else {
          console.error(`[runDbCommandServerFn] db:${command} failed:`, stderr)
          resolve({
            success: false,
            output: stdout,
            error: stderr || `Command exited with code ${code}`,
          })
        }
      })

      child.on('error', (err) => {
        console.error(`[runDbCommandServerFn] spawn error:`, err)
        resolve({
          success: false,
          output: '',
          error: err.message,
        })
      })
    })
  })

/**
 * Get available db commands for UI display
 */
export const getDbCommandsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    return {
      commands: [
        {
          id: 'seed',
          name: 'Sync: JSON → Database',
          description: commandDescriptions.seed,
          icon: 'ArrowDown',
        },
        {
          id: 'export',
          name: 'Sync: Database → JSON',
          description: commandDescriptions.export,
          icon: 'ArrowUp',
        },
        {
          id: 'migrate',
          name: 'Migrate Manifests (One-time)',
          description: commandDescriptions.migrate,
          icon: 'Database',
        },
      ],
    }
  },
)
