import path from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { CwdSchema } from '@nxus/db'
import { PATHS } from '@/paths'

const CommonSchema = z.object({
  appId: z.string(),
  scriptPath: z.string(),
  cwdOverride: CwdSchema.optional(),
})

const RepoSchema = CommonSchema.extend({
  scriptSource: z.literal('repo'),
  instancePath: z.string(),
})

const StandardSchema = CommonSchema.extend({
  scriptSource: z.enum(['nxus-app', 'shared']).default('nxus-app'),
  instancePath: z.string().optional(),
})

const ResolveScriptSchema = z.union([RepoSchema, StandardSchema])

export type ResolveScriptInput = z.infer<typeof ResolveScriptSchema>

export interface ResolveScriptResult {
  /** Full absolute path to the script file */
  scriptFullPath: string
  /** Working directory to execute the script in */
  cwd: string
}

/**
 * Resolve script path and working directory based on scriptSource and cwd settings
 *
 * Script Source Resolution:
 * - 'nxus-app': From app's data folder (nxus-core/data/apps/{appId}/{path})
 * - 'shared': From shared scripts folder (nxus-core/data/apps/_scripts/{path})
 * - 'repo': From cloned instance path ({instancePath}/{path})
 *
 * CWD Resolution (smart defaults when not specified):
 * - nxus-app/shared: Script's directory (scriptLocation)
 * - repo: Instance path (instance)
 *
 * CWD Override values:
 * - 'scriptLocation': Directory containing the script
 * - 'instance': The selected instance path
 * - Custom path string: Use as-is
 */
export const resolveScriptServerFn = createServerFn({ method: 'GET' })
  .inputValidator(ResolveScriptSchema)
  .handler(async (ctx): Promise<ResolveScriptResult> => {
    const { appId, scriptPath, scriptSource, instancePath, cwdOverride } =
      ctx.data

    // Resolve script path based on source
    let scriptFullPath: string
    let defaultCwd: string

    switch (scriptSource) {
      case 'nxus-app':
        scriptFullPath = PATHS.app(appId, scriptPath)
        defaultCwd = path.dirname(scriptFullPath)
        break

      case 'shared':
        scriptFullPath = PATHS.sharedScripts(scriptPath)
        defaultCwd = path.dirname(scriptFullPath)
        break

      case 'repo':
        scriptFullPath = path.join(instancePath, scriptPath)
        defaultCwd = instancePath
        break
    }

    // Resolve cwd based on override or default
    let cwd: string
    if (!cwdOverride) {
      cwd = defaultCwd
    } else if (cwdOverride === 'scriptLocation') {
      cwd = path.dirname(scriptFullPath)
    } else if (cwdOverride === 'instance') {
      // For standard schema, instancePath might be undefined
      // But if cwdOverride is 'instance', we enforce logic check
      // OR we can improve schema to require instancePath if cwdOverride is instance
      // For now, runtime check is fine, or we can assume it's set if the user selected it
      if (!instancePath) {
        throw new Error('instancePath is required when cwd is "instance"')
      }
      cwd = instancePath
    } else {
      // Custom path string
      cwd = cwdOverride
    }

    console.log('[resolveScriptServerFn]', {
      input: ctx.data,
      result: { scriptFullPath, cwd },
    })

    return { scriptFullPath, cwd }
  })
