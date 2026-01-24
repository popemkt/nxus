/**
 * Shared utilities for handling command modes
 *
 * NOTE: Script path resolution is now handled server-side by script-resolver.server.ts
 * Use getScriptFullPathServerFn for resolving script paths.
 */

/**
 * Handle command click based on mode
 * Returns: { handled: boolean, error?: string }
 */
export function handleCommandMode(
  mode: string,
  command: string,
  _appId: string,
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
      // Script mode requires server-side resolution - caller should handle separately
      return {
        handled: false,
        error:
          'Script mode requires server-side path resolution - use getScriptFullPathServerFn',
      }

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

    case 'workflow':
      // Workflow mode is handled by the workflow executor
      // Caller should use executeWorkflowCommand
      return { handled: true }

    default:
      return { handled: false, error: `Unknown command mode: ${mode}` }
  }
}
