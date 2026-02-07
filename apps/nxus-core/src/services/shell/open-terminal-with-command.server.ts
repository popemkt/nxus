import { exec } from 'node:child_process'
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getPlatformCommands } from '@/lib/platform-commands'

const OpenTerminalWithCommandSchema = z.object({
  command: z.string(),
  cwd: z.string().optional(),
})

/**
 * Server function to open the OS terminal and execute a command.
 * Uses platform-specific commands to launch the system terminal.
 */
export const openTerminalWithCommandServerFn = createServerFn({
  method: 'POST',
})
  .inputValidator(OpenTerminalWithCommandSchema)
  .handler(async (ctx) => {
    const { command, cwd } = ctx.data

    console.log(
      `[openTerminalWithCommandServerFn] Opening terminal with command: ${command}`,
    )

    return new Promise<{ success: boolean; error?: string }>((resolve) => {
      const shellCommand = getPlatformCommands().openTerminalWithCommand(
        command,
        cwd,
      )

      exec(shellCommand, (error) => {
        if (error) {
          console.error(
            `[openTerminalWithCommandServerFn] Failed: ${error.message}`,
          )
          resolve({ success: false, error: error.message })
        } else {
          console.log('[openTerminalWithCommandServerFn] Success')
          resolve({ success: true })
        }
      })
    })
  })
