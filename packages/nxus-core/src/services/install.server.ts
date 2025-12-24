import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'

const execAsync = promisify(exec)

const InstallParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  targetPath: z.string(),
})

/**
 * Server function to install a remote repository app
 */
export const installAppServerFn = createServerFn({ method: 'POST' })
  .inputValidator(InstallParamsSchema)
  .handler(async (ctx) => {
    const { name, url, targetPath } = ctx.data

    try {
      // Ensure the target directory exists
      await fs.mkdir(targetPath, { recursive: true })

      const appDir = path.join(
        targetPath,
        name.toLowerCase().replace(/\s+/g, '-'),
      )

      // Skip if already exists or handle accordingly
      const stats = await fs.stat(appDir).catch(() => null)
      if (stats) {
        throw new Error(`Target directory already exists: ${appDir}`)
      }

      // Clone the repository
      console.log(`Cloning ${url} into ${appDir}...`)
      await execAsync(`git clone ${url} ${appDir}`)

      // If there's an installation script (we'd need to fetch this from the registry usually,
      // but for now we follow the basic flow)

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
