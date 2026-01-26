import os from 'node:os'
import { escapePosixArg, sanitizeWindowsPath } from './shell-utils'

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
      openTerminal: (path: string) => `start cmd /K "cd /d "${sanitizeWindowsPath(path)}""`,
      openTerminalWithCommand: (command: string, cwd?: string) => {
        // Escape double quotes in the command
        const escapedCmd = command.replace(/"/g, '\\"')
        const cdPart = (cwd != null && cwd !== '') ? `cd /d "${sanitizeWindowsPath(cwd)}" && ` : ''
        // Echo the command first, then execute it. /K keeps the terminal open after execution
        return `start cmd /K "${cdPart}echo Executing command: && echo ${escapedCmd} && ${escapedCmd}"`
      },
      openFolder: (path: string) => `start "" "${sanitizeWindowsPath(path)}"`,
      whichCommand: 'where',
      folderPickerCommand: (startPath: string, title: string) => {
        // Use base64-encoded script to avoid escaping issues with $ characters
        // Also use a TopMost form as the owner so the dialog appears in front of other windows
        const sanitizedStartPath = sanitizeWindowsPath(startPath);
        // Escape single quotes for PowerShell
        const escapedTitle = title.replace(/'/g, "''");

        const psScript = `
Add-Type -AssemblyName System.Windows.Forms
$topForm = New-Object System.Windows.Forms.Form
$topForm.TopMost = $true
$dialog = New-Object System.Windows.Forms.FolderBrowserDialog
$dialog.Description = '${escapedTitle}'
$dialog.SelectedPath = '${sanitizedStartPath}'
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
      openTerminal: (path: string) => `open -a Terminal ${escapePosixArg(path)}`,
      openTerminalWithCommand: (command: string, cwd?: string) => {
        // AppleScript to open Terminal.app and run the command
        const escapedCmd = command.replace(/"/g, '\\"').replace(/'/g, "'\\''")
        const cdPart = (cwd != null && cwd !== '') ? `cd ${escapePosixArg(cwd)} && ` : ''
        const fullScript = `${cdPart}echo 'Executing command:' && echo '${command}' && ${escapedCmd}`
        // Escape quotes for AppleScript string
        const safeScript = fullScript.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `osascript -e 'tell application "Terminal" to do script "${safeScript}"' -e 'tell application "Terminal" to activate'`
      },
      openFolder: (path: string) => `open ${escapePosixArg(path)}`,
      whichCommand: 'which',
      folderPickerCommand: (startPath: string, title: string) => {
        const safeStartPath = startPath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const safeTitle = title.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        return `osascript -e 'POSIX path of (choose folder with prompt "${safeTitle}" default location POSIX file "${safeStartPath}")'`;
      }
    },

    linux: {
      openTerminal: (path: string) =>
        `which xdg-terminal > /dev/null 2>&1 && xdg-terminal --cwd=${escapePosixArg(path)} || gnome-terminal --working-directory=${escapePosixArg(path)}`,
      openTerminalWithCommand: (command: string, cwd?: string) => {
        // Try gnome-terminal first, fall back to xterm
        const escapedCmd = command.replace(/"/g, '\\\\"')
        const cwdPart = (cwd != null && cwd !== '') ? `--working-directory=${escapePosixArg(cwd)}` : ''
        // Echo the command first, then execute it, then keep bash open
        return `gnome-terminal ${cwdPart} -- bash -c "echo 'Executing command:' && echo '${escapedCmd}' && ${escapedCmd}; exec bash" 2>/dev/null || xterm -e bash -c "echo 'Executing command:' && echo '${escapedCmd}' && ${escapedCmd}; exec bash"`
      },
      openFolder: (path: string) => `xdg-open ${escapePosixArg(path)}`,
      whichCommand: 'which',
      folderPickerCommand: (startPath: string, title: string) =>
        `zenity --file-selection --directory --title=${escapePosixArg(title)} --filename=${escapePosixArg(startPath + '/')} 2>/dev/null || kdialog --getexistingdirectory ${escapePosixArg(startPath)} --title ${escapePosixArg(title)} 2>/dev/null`,
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
