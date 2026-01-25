import os from 'node:os'
import {
  escapeAppleScriptString,
  escapeDoubleQuoteString,
  escapeShArg,
  sanitizeWindowsPath,
} from './shell-utils'

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
      openTerminal: (path: string) =>
        `start cmd /K "cd /d "${sanitizeWindowsPath(path)}""`,
      openTerminalWithCommand: (command: string, cwd?: string) => {
        // Sanitize path to prevent injection via cwd
        const validCwd =
          cwd !== undefined && cwd !== '' ? sanitizeWindowsPath(cwd) : undefined
        const cdPart =
          validCwd !== undefined && validCwd !== ''
            ? `cd /d "${validCwd}" && `
            : ''

        // Escape double quotes in the command for cmd.exe
        // Note: cmd handling of quotes is complex, but escaping " to \" inside a quoted string usually works for display
        const escapedCmd = command.replace(/"/g, '\\"')
        // Echo the command first, then execute it. /K keeps the terminal open after execution
        return `start cmd /K "${cdPart}echo Executing command: && echo ${escapedCmd} && ${escapedCmd}"`
      },
      openFolder: (path: string) => `start "" "${sanitizeWindowsPath(path)}"`,
      whichCommand: 'where',
      folderPickerCommand: (startPath: string, title: string) => {
        // Use base64-encoded script to avoid escaping issues with $ characters
        // Also use a TopMost form as the owner so the dialog appears in front of other windows
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
      openTerminal: (path: string) =>
        `open -a Terminal ${escapeShArg(path)}`,
      openTerminalWithCommand: (command: string, cwd?: string) => {
        // Construct the shell command to run in the terminal
        const cdPart =
          cwd !== undefined && cwd !== '' ? `cd ${escapeShArg(cwd)} && ` : ''
        // Use escapeShArg for the echoed command to prevent injection during echo
        // The actual execution uses the raw command (allowing expansion/etc as intended)
        const innerCmd = `${cdPart}echo 'Executing command:' && echo ${escapeShArg(command)} && ${command}`

        // AppleScript to open Terminal.app and run the command
        // We must escape the inner command for the AppleScript string (doubly quoted)
        const script = `tell application "Terminal" to do script "${escapeAppleScriptString(innerCmd)}"`
        const activate = `tell application "Terminal" to activate`

        // Execute osascript. The script arguments are safely quoted for the shell.
        return `osascript -e ${escapeShArg(script)} -e ${escapeShArg(activate)}`
      },
      openFolder: (path: string) => `open ${escapeShArg(path)}`,
      whichCommand: 'which',
      folderPickerCommand: (startPath: string, title: string) =>
        `osascript -e 'POSIX path of (choose folder with prompt "${title}" default location POSIX file "${startPath}")'`,
    },

    linux: {
      openTerminal: (path: string) =>
        `which xdg-terminal > /dev/null 2>&1 && xdg-terminal --cwd=${escapeShArg(path)} || gnome-terminal --working-directory=${escapeShArg(path)}`,
      openTerminalWithCommand: (command: string, cwd?: string) => {
        // Try gnome-terminal first, fall back to xterm
        const cwdArg =
          cwd !== undefined && cwd !== ''
            ? `--working-directory=${escapeShArg(cwd)}`
            : ''

        // Inner command: Echo sanitized command string, then execute raw command
        const innerCmd = `echo 'Executing command:' && echo ${escapeShArg(command)} && ${command}; exec bash`

        // Wrap in bash -c "..." and escape for outer shell (server execution)
        const bashCmd = `bash -c "${escapeDoubleQuoteString(innerCmd)}"`

        // Execute terminal emulator
        return `gnome-terminal ${cwdArg} -- ${bashCmd} 2>/dev/null || xterm -e ${bashCmd}`
      },
      openFolder: (path: string) => `xdg-open ${escapeShArg(path)}`,
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
export function isPlatform(platforms: Platform | Array<Platform>): boolean {
  const current = getPlatform()
  return Array.isArray(platforms)
    ? platforms.includes(current)
    : current === platforms
}
