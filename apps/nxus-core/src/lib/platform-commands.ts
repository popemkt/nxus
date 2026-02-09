import os from 'node:os'

/**
 * Platform types supported by the application
 */
export type Platform = 'win32' | 'darwin' | 'linux'

/**
 * Escape a string for use inside double quotes in a shell command.
 * Handles $, `, \, ", and ! which have special meaning inside double quotes.
 */
function escapeForDoubleQuotes(s: string): string {
  return s.replace(/[\\"$`!]/g, '\\$&')
}

/**
 * Escape a string for use inside single quotes in a POSIX shell.
 * The only character that needs escaping in single quotes is the single quote itself.
 */
function escapeForSingleQuotes(s: string): string {
  return s.replace(/'/g, "'\\''")
}

/**
 * Platform-specific commands for common operations
 */
export interface PlatformCommands {
  /** Command to open a terminal at a specific path */
  openTerminal: (path: string) => string
  /** Command to open a terminal and execute/paste a command */
  openTerminalWithCommand: (command: string, cwd?: string) => string
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
      openTerminal: (path: string) => {
        const safePath = escapeForDoubleQuotes(path)
        return `start cmd /K "cd /d "${safePath}""`
      },
      openTerminalWithCommand: (command: string, cwd?: string) => {
        // Escape double quotes in the command for cmd.exe context
        const escapedCmd = command.replace(/"/g, '\\"')
        const cdPart = cwd
          ? `cd /d "${escapeForDoubleQuotes(cwd)}" && `
          : ''
        // Echo the command first, then execute it. /K keeps the terminal open after execution
        return `start cmd /K "${cdPart}echo Executing command: && echo ${escapedCmd} && ${escapedCmd}"`
      },
      openFolder: (path: string) => {
        const safePath = escapeForDoubleQuotes(path)
        return `start "" "${safePath}"`
      },
      whichCommand: 'where',
      folderPickerCommand: (startPath: string, title: string) => {
        // Use base64-encoded script to avoid escaping issues with $ characters
        // Also use a TopMost form as the owner so the dialog appears in front of other windows
        // PowerShell single-quote escaping: replace ' with ''
        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${title.replace(/'/g, "''")}'
$dialog.SelectedPath = '${startPath.replace(/'/g, "''")}'
$dialog.ShowNewFolderButton = $true
$result = $dialog.ShowDialog($topForm)
$topForm.Dispose()
if ($result -eq 'OK') {
  Write-Output $dialog.SelectedPath
}
`
        const encodedScript = Buffer.from(psScript, 'utf16le').toString(
          'base64',
        )
        return `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`
      },
    },

    darwin: {
      openTerminal: (path: string) => {
        const safePath = escapeForDoubleQuotes(path)
        return `open -a Terminal "${safePath}"`
      },
      openTerminalWithCommand: (command: string, cwd?: string) => {
        // AppleScript to open Terminal.app and run the command
        // Escape for the inner shell that Terminal.app runs
        const escapedCmd = command.replace(/"/g, '\\"').replace(/'/g, "'\\''")
        const cdPart = cwd
          ? `cd '${escapeForSingleQuotes(cwd)}' && `
          : ''
        // Escape the echo'd command for single-quote context
        const escapedCmdForEcho = escapeForSingleQuotes(command)
        const fullScript = `${cdPart}echo 'Executing command:' && echo '${escapedCmdForEcho}' && ${escapedCmd}`
        return `osascript -e 'tell application "Terminal" to do script "${fullScript}"' -e 'tell application "Terminal" to activate'`
      },
      openFolder: (path: string) => {
        const safePath = escapeForDoubleQuotes(path)
        return `open "${safePath}"`
      },
      whichCommand: 'which',
      folderPickerCommand: (startPath: string, title: string) => {
        const safeTitle = escapeForDoubleQuotes(title)
        const safePath = escapeForDoubleQuotes(startPath)
        return `osascript -e 'POSIX path of (choose folder with prompt "${safeTitle}" default location POSIX file "${safePath}")'`
      },
    },

    linux: {
      openTerminal: (path: string) => {
        const safePath = escapeForDoubleQuotes(path)
        return `which xdg-terminal > /dev/null 2>&1 && xdg-terminal --cwd="${safePath}" || gnome-terminal --working-directory="${safePath}"`
      },
      openTerminalWithCommand: (command: string, cwd?: string) => {
        // Try gnome-terminal first, fall back to xterm
        // Escape the command for nested double-quote context (bash -c "...")
        const escapedCmd = command.replace(/[\\"$`!]/g, '\\\\$&')
        const cwdPart = cwd
          ? `--working-directory="${escapeForDoubleQuotes(cwd)}"`
          : ''
        const escapedCmdForEcho = escapeForSingleQuotes(command)
        // Echo the command first, then execute it, then keep bash open
        return `gnome-terminal ${cwdPart} -- bash -c "echo 'Executing command:' && echo '${escapedCmdForEcho}' && ${escapedCmd}; exec bash" 2>/dev/null || xterm -e bash -c "echo 'Executing command:' && echo '${escapedCmdForEcho}' && ${escapedCmd}; exec bash"`
      },
      openFolder: (path: string) => {
        const safePath = escapeForDoubleQuotes(path)
        return `xdg-open "${safePath}"`
      },
      whichCommand: 'which',
      folderPickerCommand: (startPath: string, title: string) => {
        const safeTitle = escapeForDoubleQuotes(title)
        const safePath = escapeForDoubleQuotes(startPath)
        return `zenity --file-selection --directory --title="${safeTitle}" --filename="${safePath}/" 2>/dev/null || kdialog --getexistingdirectory "${safePath}" --title "${safeTitle}" 2>/dev/null`
      },
    },
  }

  return commands[platform]
}

/**
 * Check if the current platform matches the given platform(s)
 * @param platforms Single platform or array of platforms to check
 * @returns true if current platform matches
 */
export function isPlatform(platforms: Platform | Array<Platform>): boolean {
  const current = getPlatform()
  return Array.isArray(platforms)
    ? platforms.includes(current)
    : current === platforms
}
