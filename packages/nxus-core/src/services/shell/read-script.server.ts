import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import fs from 'node:fs/promises'
import { resolveScriptServerFn } from './script-resolver.server'
import type { ResolveScriptInput } from './script-resolver.server'
import { ScriptSourceSchema } from '@nxus/db'

const ReadScriptSchema = z.object({
  appId: z.string(),
  scriptPath: z.string(), // Relative path like "install.ps1"
  scriptSource: ScriptSourceSchema.optional(),
  instancePath: z.string().optional(),
})

function buildResolverInput(
  data: z.infer<typeof ReadScriptSchema>,
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

  // Handle other cases (nxus-app, shared, or undefined->nxus-app)
  // Ensure we don't pass 'repo' here accidentally (TS knows this via flow analysis)
  return {
    appId,
    scriptPath,
    scriptSource: scriptSource === 'shared' ? 'shared' : 'nxus-app',
    instancePath,
  }
}

/**
 * Read a script file content for preview
 * Now supports multiple script sources via scriptSource parameter
 */
export const readScriptFileServerFn = createServerFn({ method: 'GET' })
  .inputValidator(ReadScriptSchema)
  .handler(async (ctx) => {
    console.log('[readScriptFileServerFn] Input:', ctx.data)

    // Use the new resolver to get the full path
    const resolved = await resolveScriptServerFn({
      data: buildResolverInput(ctx.data),
    })

    const fullPath = resolved.scriptFullPath

    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      console.log('[readScriptFileServerFn] Success:', fullPath)
      return { success: true as const, content, fullPath }
    } catch (error) {
      console.log(
        '[readScriptFileServerFn] Failed:',
        fullPath,
        (error as Error).message,
      )
      return {
        success: false as const,
        error: `Failed to read script: ${(error as Error).message}`,
      }
    }
  })

const GetScriptPathSchema = z.object({
  appId: z.string(),
  scriptPath: z.string(),
  scriptSource: ScriptSourceSchema.optional(),
  instancePath: z.string().optional(),
})

/**
 * Get the full path for a script file (for execution)
 * Now supports multiple script sources via scriptSource parameter
 */
export const getScriptFullPathServerFn = createServerFn({ method: 'GET' })
  .inputValidator(GetScriptPathSchema)
  .handler(async (ctx) => {
    console.log('[getScriptFullPathServerFn] Input:', ctx.data)

    // Use the new resolver
    const resolved = await resolveScriptServerFn({
      data: buildResolverInput(ctx.data),
    })

    console.log('[getScriptFullPathServerFn] Result:', resolved.scriptFullPath)
    return { fullPath: resolved.scriptFullPath, cwd: resolved.cwd }
  })
