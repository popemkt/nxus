import os from 'os'

/**
 * Platform types supported by the application
 */
export type Platform = 'win32' | 'darwin' | 'linux'

/**
 * Platform-specific commands for common operations
 */
export interface PlatformCommands {
  /** Command to open a terminal at a specific path */
  openTerminal: (path: string) => string
  /** Command to open a folder in the file explorer */
  openFolder: (path: string) => string
  /** Command to check if a CLI tool exists ('which' or 'where') */
  whichCommand: string
  /** Command to open a folder picker dialog */
  folderPickerCommand: (startPath: string, title: string) => string
}

/**
 * Get the normalized platform type
 * @returns Platform identifier (win32, darwin, or linux)
 */
export function getPlatform(): Platform {
  const platform = os.platform()
  if (platform === 'win32') return 'win32'
  if (platform === 'darwin') return 'darwin'
  // Default to linux for other unix-like systems
  return 'linux'
}

/**
 * Get platform-specific commands for the current operating system
 * @returns PlatformCommands object with platform-specific command generators
 */
export function getPlatformCommands(): PlatformCommands {
  const platform = getPlatform()

  const commands: Record<Platform, PlatformCommands> = {
    win32: {
      openTerminal: (path: string) => `start cmd /K "cd /d "${path}""`,
      openFolder: (path: string) => `start "" "${path}"`,
      whichCommand: 'where',
      folderPickerCommand: (startPath: string, title: string) => {
        const psScript = `
          Add-Type -AssemblyName System.Windows.Forms
          $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
          $dialog.Description = '${title}'
          $dialog.SelectedPath = '${startPath.replace(/\\/g, '\\\\')}'
          $dialog.ShowNewFolderButton = $true
          if ($dialog.ShowDialog() -eq 'OK') {
            Write-Output $dialog.SelectedPath
          }
        `.replace(/\n/g, ' ')
        return `powershell -Command "${psScript}"`
      },
    },

    darwin: {
      openTerminal: (path: string) => `open -a Terminal "${path}"`,
      openFolder: (path: string) => `open "${path}"`,
      whichCommand: 'which',
      folderPickerCommand: (startPath: string, title: string) =>
        `osascript -e 'POSIX path of (choose folder with prompt "${title}" default location POSIX file "${startPath}")'`,
    },

    linux: {
      openTerminal: (path: string) =>
        `which xdg-terminal > /dev/null 2>&1 && xdg-terminal --cwd="${path}" || gnome-terminal --working-directory="${path}"`,
      openFolder: (path: string) => `xdg-open "${path}"`,
      whichCommand: 'which',
      folderPickerCommand: (startPath: string, title: string) =>
        `zenity --file-selection --directory --title="${title}" --filename="${startPath}/" 2>/dev/null || kdialog --getexistingdirectory "${startPath}" --title "${title}" 2>/dev/null`,
    },
  }

  return commands[platform]
}

/**
 * Check if the current platform matches the given platform(s)
 * @param platforms Single platform or array of platforms to check
 * @returns true if current platform matches
 */
export function isPlatform(platforms: Platform | Platform[]): boolean {
  const current = getPlatform()
  return Array.isArray(platforms)
    ? platforms.includes(current)
    : current === platforms
}
