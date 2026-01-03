import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import fs from 'node:fs/promises'

const ReadScriptSchema = z.object({
  path: z.string(),
})

/**
 * Read a script file content for preview
 */
export const readScriptFileServerFn = createServerFn({ method: 'GET' })
  .inputValidator(ReadScriptSchema)
  .handler(async (ctx) => {
    const { path: filePath } = ctx.data

    // Security: only allow reading from the data/apps directory and scripts
    const allowedPaths = [
      '/stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/data/apps',
    ]
    const isAllowed = allowedPaths.some((p) => filePath.startsWith(p))

    if (!isAllowed) {
      return {
        success: false as const,
        error: 'Access denied: path not in allowed directories',
      }
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return { success: true as const, content }
    } catch (error) {
      return {
        success: false as const,
        error: `Failed to read script: ${(error as Error).message}`,
      }
    }
  })
