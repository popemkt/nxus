import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { exec } from 'child_process'
import os from 'os'

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
    const platform = os.platform()

    console.log(`Opening path: ${path} on platform: ${platform}`)

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      let command = ''

      if (platform === 'win32') {
        command = `start "" "${path}"`
      } else if (platform === 'darwin') {
        command = `open "${path}"`
      } else {
        // Assume linux/other unix
        command = `xdg-open "${path}"`
      }

      exec(command, (error) => {
        if (error) {
          console.error(`Failed to open path: ${error.message}`)
          resolve({ success: false, error: error.message })
        } else {
          resolve({ success: true })
        }
      })
    })
  })
