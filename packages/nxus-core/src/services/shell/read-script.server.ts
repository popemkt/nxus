import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Get the path to an app's data directory
 */
function getAppDataPath(appId: string): string {
  return path.join(__dirname, '..', '..', 'data', 'apps', appId)
}

const ReadScriptSchema = z.object({
  appId: z.string(),
  scriptPath: z.string(), // Relative path like "install.ps1"
})

/**
 * Read a script file content for preview
 */
export const readScriptFileServerFn = createServerFn({ method: 'GET' })
  .inputValidator(ReadScriptSchema)
  .handler(async (ctx) => {
    const { appId, scriptPath } = ctx.data
    const fullPath = path.join(getAppDataPath(appId), scriptPath)

    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      return { success: true as const, content, fullPath }
    } catch (error) {
      return {
        success: false as const,
        error: `Failed to read script: ${(error as Error).message}`,
      }
    }
  })

const GetScriptPathSchema = z.object({
  appId: z.string(),
  scriptPath: z.string(),
})

/**
 * Get the full path for a script file (for execution)
 */
export const getScriptFullPathServerFn = createServerFn({ method: 'GET' })
  .inputValidator(GetScriptPathSchema)
  .handler(async (ctx) => {
    const { appId, scriptPath } = ctx.data
    return {
      fullPath: path.join(getAppDataPath(appId), scriptPath),
    }
  })
