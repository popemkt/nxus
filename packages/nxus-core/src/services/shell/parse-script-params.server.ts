import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parsePowerShellParamsServerFn } from './script-param-adapters/powershell.server'
import type { ParseScriptParamsResult } from './script-param-adapters/types'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Get the path to an app's data directory
 */
function getAppDataPath(appId: string): string {
  return path.join(__dirname, '..', '..', 'data', 'apps', appId)
}

const ParseScriptParamsSchema = z.object({
  appId: z.string(),
  scriptPath: z.string(), // Relative path like "create-repo.ps1"
})

/**
 * Parse script parameters - dispatches to appropriate adapter based on file extension
 */
export const parseScriptParamsServerFn = createServerFn({ method: 'GET' })
  .inputValidator(ParseScriptParamsSchema)
  .handler(async (ctx): Promise<ParseScriptParamsResult> => {
    console.log('[parseScriptParamsServerFn] Input:', ctx.data)
    const { appId, scriptPath } = ctx.data
    const fullPath = path.join(getAppDataPath(appId), scriptPath)
    const ext = path.extname(scriptPath).toLowerCase()

    let result: ParseScriptParamsResult
    switch (ext) {
      case '.ps1':
        result = await parsePowerShellParamsServerFn({
          data: { scriptPath: fullPath },
        })
        break

      case '.sh':
      case '.bash':
        // TODO: Implement bash adapter
        result = { success: true, params: [] }
        break

      default:
        result = { success: true, params: [] }
        break
    }

    console.log(
      '[parseScriptParamsServerFn] Success:',
      scriptPath,
      result.params?.length,
    )
    return result
  })

// Re-export types
export type {
  ScriptParam,
  ParseScriptParamsResult,
} from './script-param-adapters/types'
