import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const UninstallParamsSchema = z.object({
  installPath: z.string(),
  deleteFromDisk: z.boolean().default(false),
})

/**
 * Server function to uninstall an app.
 * Uses Node.js fs.rm() for OS-agnostic folder deletion.
 * Dynamically imports fs to keep this isolated from client bundle.
 */
export const uninstallAppServerFn = createServerFn({ method: 'POST' })
  .inputValidator(UninstallParamsSchema)
  .handler(async (ctx) => {
    const { installPath, deleteFromDisk } = ctx.data

    if (!deleteFromDisk) {
      // Just forget, don't delete files
      return {
        success: true,
        data: { message: 'Installation forgotten (files remain on disk)' },
      }
    }

    try {
      // Dynamic import to ensure Node modules stay server-side
      const fs = await import('fs/promises')
      const path = await import('path')

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
