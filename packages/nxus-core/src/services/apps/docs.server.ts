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

const GetDocContentSchema = z.object({
  appId: z.string(),
  fileName: z.string(),
})

/**
 * Load a documentation file for an app
 */
export const getDocContentServerFn = createServerFn({ method: 'GET' })
  .inputValidator(GetDocContentSchema)
  .handler(async (ctx) => {
    const { appId, fileName } = ctx.data
    const docPath = path.join(getAppDataPath(appId), fileName)

    try {
      const content = await fs.readFile(docPath, 'utf-8')
      return { success: true as const, content }
    } catch (error) {
      return {
        success: false as const,
        error: `Failed to load doc: ${(error as Error).message}`,
      }
    }
  })

const ListAppDocsSchema = z.object({
  appId: z.string(),
})

/**
 * List available documentation files for an app
 */
export const listAppDocsServerFn = createServerFn({ method: 'GET' })
  .inputValidator(ListAppDocsSchema)
  .handler(async (ctx) => {
    const { appId } = ctx.data
    const appDir = getAppDataPath(appId)

    try {
      const files = await fs.readdir(appDir)
      const mdFiles = files.filter(
        (f) => f.endsWith('.md') && f !== 'manifest.json',
      )
      return { success: true as const, files: mdFiles }
    } catch {
      return { success: true as const, files: [] }
    }
  })

const GetAppManifestPathSchema = z.object({
  appId: z.string(),
})

/**
 * Get the file path for opening in editor
 */
export const getAppManifestPathServerFn = createServerFn({ method: 'GET' })
  .inputValidator(GetAppManifestPathSchema)
  .handler(async (ctx) => {
    const { appId } = ctx.data
    return {
      manifestPath: path.join(getAppDataPath(appId), 'manifest.json'),
      docsPath: getAppDataPath(appId),
    }
  })
