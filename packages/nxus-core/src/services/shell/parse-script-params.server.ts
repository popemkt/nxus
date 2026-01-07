import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import path from 'node:path'
import { parsePowerShellParamsServerFn } from './script-param-adapters/powershell.server'
import { resolveScriptServerFn } from './script-resolver.server'
import type { ResolveScriptInput } from './script-resolver.server'
import { ScriptSourceSchema } from '@/types/app'
import type { ParseScriptParamsResult } from './script-param-adapters/types'

const ParseScriptParamsSchema = z.object({
  appId: z.string(),
  scriptPath: z.string(), // Relative path like "create-repo.ps1"
  scriptSource: ScriptSourceSchema.optional(),
  instancePath: z.string().optional(),
})

function buildResolverInput(
  data: z.infer<typeof ParseScriptParamsSchema>,
): ResolveScriptInput {
  const { appId, scriptPath, scriptSource, instancePath } = data

  if (scriptSource === 'repo') {
    if (!instancePath) {
      throw new Error('instancePath is required when scriptSource is "repo"')
    }
    return {
      appId,
      scriptPath,
      scriptSource: 'repo',
      instancePath,
    }
  }

  return {
    appId,
    scriptPath,
    scriptSource: scriptSource === 'shared' ? 'shared' : 'nxus-app',
    instancePath,
  }
}

/**
 * Parse script parameters - dispatches to appropriate adapter based on file extension
 * Now supports multiple script sources via scriptSource parameter
 */
export const parseScriptParamsServerFn = createServerFn({ method: 'GET' })
  .inputValidator(ParseScriptParamsSchema)
  .handler(async (ctx): Promise<ParseScriptParamsResult> => {
    console.log('[parseScriptParamsServerFn] Input:', ctx.data)
    const { scriptPath } = ctx.data

    // Use the resolver to get the full path
    const resolved = await resolveScriptServerFn({
      data: buildResolverInput(ctx.data),
    })

    const fullPath = resolved.scriptFullPath
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
      result.success ? result.params?.length : 0,
    )
    return result
  })

// Re-export types
export type {
  ScriptParam,
  ParseScriptParamsResult,
} from './script-param-adapters/types'

