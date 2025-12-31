import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { exec } from 'child_process'
import os from 'os'

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
    const platform = os.platform()
    const homeDir = os.homedir()
    const initialDir = startPath || homeDir

    console.log(
      `Opening folder picker on ${platform}, starting at: ${initialDir}`,
    )

    return new Promise<{ success: boolean; path?: string; error?: string }>(
      (resolve) => {
        let command = ''

        if (platform === 'win32') {
          // Windows: Use PowerShell's folder browser dialog
          const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
          $dialog.Description = '${title}'
          $dialog.SelectedPath = '${initialDir.replace(/\\/g, '\\\\')}'
          $dialog.ShowNewFolderButton = $true
          if ($dialog.ShowDialog() -eq 'OK') {
            Write-Output $dialog.SelectedPath
          }
        `.replace(/\n/g, ' ')
          command = `powershell -Command "${psScript}"`
        } else if (platform === 'darwin') {
          // macOS: Use osascript
          command = `osascript -e 'POSIX path of (choose folder with prompt "${title}" default location POSIX file "${initialDir}")'`
        } else {
          // Linux: Try zenity first, fall back to kdialog
          // Using zenity (GTK-based, works on most DE)
          command = `zenity --file-selection --directory --title="${title}" --filename="${initialDir}/" 2>/dev/null || kdialog --getexistingdirectory "${initialDir}" --title "${title}" 2>/dev/null`
        }

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
