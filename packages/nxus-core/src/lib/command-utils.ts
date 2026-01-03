/**
 * Shared utilities for handling command modes
 */

/**
 * Build full script path from app ID and relative script path
 */
export function buildScriptPath(appId: string, relativePath: string): string {
  return `/stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/data/apps/${appId}/${relativePath}`
}

/**
 * Build file:// URL for script preview modal
 */
export function buildScriptFileUrl(
  appId: string,
  relativePath: string,
): string {
  return `file://${buildScriptPath(appId, relativePath)}`
}

/**
 * Build the command string for a script mode command
 */
export function buildScriptCommand(
  appId: string,
  relativePath: string,
): string {
  return `pwsh ${buildScriptPath(appId, relativePath)}`
}

/**
 * Handle command click based on mode
 * Returns: { handled: boolean, error?: string }
 */
export function handleCommandMode(
  mode: string,
  command: string,
  appId: string,
  callbacks: {
    onExecute?: (cmd: string) => void
    onTerminal?: (cmd: string) => void
    onConfigure?: () => void
  },
): { handled: boolean; error?: string } {
  switch (mode) {
    case 'execute':
      callbacks.onExecute?.(command)
      return { handled: true }

    case 'script':
      // Script mode: command is relative path, run with pwsh
      callbacks.onExecute?.(buildScriptCommand(appId, command))
      return { handled: true }

    case 'copy':
      navigator.clipboard.writeText(command)
      return { handled: true }

    case 'terminal':
      // Interactive terminal mode
      callbacks.onTerminal?.(command)
      return { handled: true }

    case 'docs':
      window.open(command, '_blank', 'noopener,noreferrer')
      return { handled: true }

    case 'configure':
      callbacks.onConfigure?.()
      return { handled: true }

    case 'preview':
      // Preview is handled separately by opening modal
      return { handled: true }

    default:
      return { handled: false, error: `Unknown command mode: ${mode}` }
  }
}
