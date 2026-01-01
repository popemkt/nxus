import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { exec } from 'child_process'
import os from 'os'
import { getPlatformCommands } from '@/lib/platform-commands'

const FolderPickerSchema = z.object({
  startPath: z.string().optional(),
  title: z.string().optional(),
})

/**
 * Server function to open a native folder picker dialog.
 * Uses platform-specific commands:
 * - Linux: zenity or kdialog
 * - macOS: osascript with folder selection dialog
 * - Windows: PowerShell folder browser dialog
 *
 * @returns The selected folder path, or null if cancelled
 */
export const openFolderPickerServerFn = createServerFn({ method: 'POST' })
  .inputValidator(FolderPickerSchema)
  .handler(async (ctx) => {
    const { startPath, title = 'Select Folder' } = ctx.data ?? {}
    const homeDir = os.homedir()
    const initialDir = startPath || homeDir

    console.log(`Opening folder picker, starting at: ${initialDir}`)

    return new Promise<{ success: boolean; path?: string; error?: string }>(
      (resolve) => {
        const command = getPlatformCommands().folderPickerCommand(
          initialDir,
          title,
        )

        exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
          const selectedPath = stdout.trim()

          if (error) {
            // User cancelled or dialog failed
            if (error.killed || error.code === 1 || error.code === 5) {
              // Code 1/5 = user cancelled
              resolve({ success: true, path: undefined })
            } else {
              console.error(`Folder picker error: ${error.message}`, stderr)
              resolve({ success: false, error: error.message })
            }
          } else if (selectedPath) {
            resolve({ success: true, path: selectedPath })
          } else {
            // Empty output = cancelled
            resolve({ success: true, path: undefined })
          }
        })
      },
    )
  })
