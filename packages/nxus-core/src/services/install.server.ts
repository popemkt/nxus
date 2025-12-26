import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'

const execAsync = promisify(exec)

export const InstallParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  targetPath: z.string(),
})

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
        return {
          success: false,
          error: `Target directory already exists: ${appDir}`,
        }
      }

      // Clone the repository
      console.log(`Cloning ${url} into ${appDir}...`)
      await execAsync(`git clone ${url} ${appDir}`)

      return {
        success: true,
        data: {
          path: appDir,
          message: `Successfully installed ${name} to ${appDir}`,
        },
      }
    } catch (error) {
      console.error('Installation failed:', error)
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unknown error during installation',
      }
    }
  })
