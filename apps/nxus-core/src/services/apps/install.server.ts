import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'

const ALLOWED_GIT_PROTOCOLS = ['https:', 'git:', 'ssh:', 'http:']

function validateGitUrl(url: string): void {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error(`Invalid URL: ${url}`)
  }
  if (!ALLOWED_GIT_PROTOCOLS.includes(parsed.protocol)) {
    throw new Error(
      `Unsupported protocol "${parsed.protocol}". Allowed: ${ALLOWED_GIT_PROTOCOLS.join(', ')}`,
    )
  }
}

function spawnAsync(
  command: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args)
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (data) => {
      stdout += data
    })
    child.stderr.on('data', (data) => {
      stderr += data
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr })
      } else {
        reject(new Error(`git clone failed with code ${code}: ${stderr}`))
      }
    })
    child.on('error', reject)
  })
}

export const InstallParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  targetPath: z.string(),
})

export type InstallParams = z.infer<typeof InstallParamsSchema>

type InstallResult =
  | { success: true; data: { path: string; message: string } }
  | { success: false; error: string }

/**
 * Server function to install a remote repository app.
 * Uses top-level imports with explicit Promise return type.
 */
export const installAppServerFn = createServerFn({ method: 'POST' })
  .inputValidator(InstallParamsSchema)
  .handler(async (ctx): Promise<InstallResult> => {
    console.log('[installAppServerFn] Input:', ctx.data)
    const { name, url, targetPath } = ctx.data

    try {
      // Ensure the target directory exists
      await fs.mkdir(targetPath, { recursive: true })

      const appDir = path.join(
        targetPath,
        name.toLowerCase().replace(/\s+/g, '-'),
      )

      // Skip if already exists
      const stats = await fs.stat(appDir).catch(() => null)
      if (stats) {
        console.log('[installAppServerFn] Failed: Path exists', appDir)
        return {
          success: false,
          error: `Target directory already exists: ${appDir}`,
        }
      }

      // Validate URL protocol before cloning
      validateGitUrl(url)

      // Clone the repository using spawn to avoid shell injection
      console.log(`[installAppServerFn] Cloning ${url} into ${appDir}...`)
      await spawnAsync('git', ['clone', url, appDir])

      console.log('[installAppServerFn] Success:', appDir)
      return {
        success: true,
        data: {
          path: appDir,
          message: `Successfully installed ${name} to ${appDir}`,
        },
      }
    } catch (error) {
      console.error('[installAppServerFn] Failed:', error)
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during installation',
      }
    }
  })
