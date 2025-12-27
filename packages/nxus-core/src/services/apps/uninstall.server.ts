import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import fs from 'fs/promises'
import path from 'path'

export const UninstallParamsSchema = z.object({
  installPath: z.string(),
  deleteFromDisk: z.boolean().default(false),
})

type UninstallResult =
  | { success: true; data: { message: string } }
  | { success: false; error: string }

/**
 * Server function to uninstall an app.
 * Uses Node.js fs.rm() for OS-agnostic folder deletion.
 * Top-level imports with explicit Promise return type.
 */
export const uninstallAppServerFn = createServerFn({ method: 'POST' })
  .inputValidator(UninstallParamsSchema)
  .handler(async (ctx): Promise<UninstallResult> => {
    const { installPath, deleteFromDisk } = ctx.data

    if (!deleteFromDisk) {
      return {
        success: true,
        data: { message: 'Installation forgotten (files remain on disk)' },
      }
    }

    try {
      // Verify path exists before attempting deletion
      const stats = await fs.stat(installPath).catch(() => null)
      if (!stats) {
        return { success: false, error: `Path does not exist: ${installPath}` }
      }

      // Safety: ensure it's a directory
      if (!stats.isDirectory()) {
        return { success: false, error: 'Path is not a directory' }
      }

      // Delete recursively - this is OS-agnostic
      await fs.rm(installPath, { recursive: true, force: true })

      return {
        success: true,
        data: {
          message: `Successfully removed ${path.basename(installPath)}`,
        },
      }
    } catch (error) {
      console.error('Uninstall failed:', error)
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to remove installation',
      }
    }
  })
