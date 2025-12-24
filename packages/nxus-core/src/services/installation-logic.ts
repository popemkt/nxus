'use server'

import { z } from 'zod'

import { exec } from 'child_process'
import { promisify } from 'util'
import fs from 'fs/promises'
import path from 'path'
import { InstallParamsSchema } from './install.server'

type InstallParams = z.infer<typeof InstallParamsSchema>

const execAsync = promisify(exec)

export async function installRepo(params: InstallParams) {
  const { name, url, targetPath } = params

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
}
