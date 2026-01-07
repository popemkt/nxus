import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import fs from 'node:fs/promises'
import { resolveScriptServerFn } from './script-resolver.server'
import { ScriptSourceSchema } from '@/types/app'

const ReadScriptSchema = z.object({
  appId: z.string(),
  scriptPath: z.string(), // Relative path like "install.ps1"
  scriptSource: ScriptSourceSchema.optional(),
  instancePath: z.string().optional(),
})

/**
 * Read a script file content for preview
 * Now supports multiple script sources via scriptSource parameter
 */
export const readScriptFileServerFn = createServerFn({ method: 'GET' })
  .inputValidator(ReadScriptSchema)
  .handler(async (ctx) => {
    console.log('[readScriptFileServerFn] Input:', ctx.data)
    const { appId, scriptPath, scriptSource, instancePath } = ctx.data

    // Use the new resolver to get the full path
    const resolved = await resolveScriptServerFn({
      data: {
        appId,
        scriptPath,
        scriptSource: scriptSource ?? 'nxus-app',
        instancePath,
      },
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
    const { appId, scriptPath, scriptSource, instancePath } = ctx.data

    // Use the new resolver
    const resolved = await resolveScriptServerFn({
      data: {
        appId,
        scriptPath,
        scriptSource: scriptSource ?? 'nxus-app',
        instancePath,
      },
    })

    console.log('[getScriptFullPathServerFn] Result:', resolved.scriptFullPath)
    return { fullPath: resolved.scriptFullPath, cwd: resolved.cwd }
  })
