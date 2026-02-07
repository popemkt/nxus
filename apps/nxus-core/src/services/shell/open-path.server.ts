import { exec } from 'node:child_process'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getPlatformCommands } from '@/lib/platform-commands'

const OpenPathSchema = z.object({
  path: z.string(),
})

/**
 * Server function to open a local path in the OS-native file explorer.
 * Uses platform-specific commands to trigger the explorer.
 */
export const openPathServerFn = createServerFn({ method: 'POST' })
  .inputValidator(OpenPathSchema)
  .handler(async (ctx) => {
    const { path } = ctx.data

    console.log(`[openPathServerFn] Opening path: ${path}`)

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const command = getPlatformCommands().openFolder(path)

      exec(command, (error) => {
        if (error) {
          console.error(`[openPathServerFn] Failed: ${error.message}`)
          resolve({ success: false, error: error.message })
        } else {
          console.log('[openPathServerFn] Success')
          resolve({ success: true })
        }
      })
    })
  })
