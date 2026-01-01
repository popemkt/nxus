import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { exec } from 'child_process'
import { getPlatformCommands } from '@/lib/platform-commands'

const OpenTerminalSchema = z.object({
  path: z.string(),
})

/**
 * Server function to open a terminal at a specific directory.
 * Uses platform-specific commands to launch the system terminal.
 */
export const openTerminalServerFn = createServerFn({ method: 'POST' })
  .inputValidator(OpenTerminalSchema)
  .handler(async (ctx) => {
    const { path } = ctx.data

    console.log(`Opening terminal at: ${path}`)

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const command = getPlatformCommands().openTerminal(path)

      exec(command, (error) => {
        if (error) {
          console.error(`Failed to open terminal: ${error.message}`)
          resolve({ success: false, error: error.message })
        } else {
          resolve({ success: true })
        }
      })
    })
  })
