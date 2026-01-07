import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ScriptSourceSchema, CwdSchema } from '@/types/app'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Get the root path for app data
 */
function getAppDataRoot(): string {
  return path.join(__dirname, '..', '..', 'data', 'apps')
}

const ResolveScriptSchema = z.object({
  appId: z.string(),
  scriptPath: z.string(),
  scriptSource: ScriptSourceSchema.default('nxus-app'),
  instancePath: z.string().optional(),
  cwdOverride: CwdSchema.optional(),
})

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
    const dataRoot = getAppDataRoot()

    // Resolve script path based on source
    let scriptFullPath: string
    let defaultCwd: string

    switch (scriptSource) {
      case 'nxus-app':
        scriptFullPath = path.join(dataRoot, appId, scriptPath)
        defaultCwd = path.dirname(scriptFullPath)
        break

      case 'shared':
        scriptFullPath = path.join(dataRoot, '_scripts', scriptPath)
        defaultCwd = path.dirname(scriptFullPath)
        break

      case 'repo':
        if (!instancePath) {
          throw new Error(
            'instancePath is required when scriptSource is "repo"',
          )
        }
        scriptFullPath = path.join(instancePath, scriptPath)
        defaultCwd = instancePath
        break

      default:
        throw new Error(`Unknown script source: ${scriptSource}`)
    }

    // Resolve cwd based on override or default
    let cwd: string
    if (!cwdOverride) {
      cwd = defaultCwd
    } else if (cwdOverride === 'scriptLocation') {
      cwd = path.dirname(scriptFullPath)
    } else if (cwdOverride === 'instance') {
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
