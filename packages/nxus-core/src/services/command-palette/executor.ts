/**
 * Centralized Command Executor
 *
 * This service provides a single execution path for all commands, ensuring
 * consistent behavior across the command palette and app detail page.
 *
 * It handles:
 * 1. Terminal tab creation
 * 2. Command execution via server function
 * 3. Output logging
 * 4. Post-execution effects (health check clearing, etc.)
 *
 * @example
 * ```typescript
 * const result = await commandExecutor.execute({
 *   command: 'npm install',
 *   appId: 'my-app',
 *   appType: 'remote-repo',
 *   tabName: 'Install Dependencies',
 * })
 * ```
 */

import { executeCommandServerFn } from '@/services/shell/command.server'
import { toolHealthService } from '@/services/state/item-status-state'
import type { AppType } from '@/types/app'
import type { LogEntry } from '@/services/shell/command.schema'

// Terminal store interface matching the actual store
type TerminalStore = {
  createTab: (name: string) => string
  addLog: (tabId: string, log: LogEntry) => void
  setStatus: (
    tabId: string,
    status: 'idle' | 'running' | 'success' | 'error',
  ) => void
}

/**
 * Options for executing a command
 */
export interface CommandExecutionOptions {
  /** Full command string (e.g., "npm install") */
  command: string
  /** Working directory for the command */
  cwd?: string
  /** App ID for post-execution effects */
  appId?: string
  /** App type for post-execution effects */
  appType?: AppType
  /** Name for the terminal tab */
  tabName?: string
  /** Terminal store instance (passed in to avoid hook context issues) */
  terminalStore?: TerminalStore
}

/**
 * Result of command execution
 */
export interface CommandExecutionResult {
  success: boolean
  exitCode?: number
  stdout?: string
  stderr?: string
  error?: string
  tabId?: string
}

/**
 * Post-execution callback type
 */
export type PostExecutionCallback = (
  appId: string,
  appType: AppType,
  exitCode: number,
) => void | Promise<void>

// Registry of post-execution callbacks
const postExecutionCallbacks: PostExecutionCallback[] = []

/**
 * Centralized command executor service
 */
export const commandExecutor = {
  /**
   * Execute a command in the terminal
   *
   * This is the single execution path for all commands. It:
   * 1. Creates a terminal tab (if terminalStore provided)
   * 2. Executes the command
   * 3. Logs output
   * 4. Runs post-execution effects
   */
  async execute(
    options: CommandExecutionOptions,
  ): Promise<CommandExecutionResult> {
    const { command, cwd, appId, appType, tabName, terminalStore } = options

    // Parse command into parts
    const parts = command.split(' ')
    const cmd = parts[0]
    const args = parts.slice(1)

    // Create terminal tab if store provided
    let tabId: string | undefined
    if (terminalStore) {
      tabId = terminalStore.createTab(tabName ?? command)
      terminalStore.setStatus(tabId, 'running')
      terminalStore.addLog(tabId, {
        timestamp: Date.now(),
        type: 'info',
        message: `$ ${command}${cwd ? ` (in ${cwd})` : ''}\n`,
      })
    }

    try {
      const result = await executeCommandServerFn({
        data: { command: cmd, args, cwd },
      })

      if (result.success) {
        // Log stdout
        if (result.data.stdout && terminalStore && tabId) {
          terminalStore.addLog(tabId, {
            timestamp: Date.now(),
            type: 'stdout',
            message: result.data.stdout,
          })
        }

        // Log stderr
        if (result.data.stderr && terminalStore && tabId) {
          terminalStore.addLog(tabId, {
            timestamp: Date.now(),
            type: 'stderr',
            message: result.data.stderr,
          })
        }

        // Set final status
        const isSuccess = result.data.exitCode === 0
        if (terminalStore && tabId) {
          terminalStore.setStatus(tabId, isSuccess ? 'success' : 'error')
          terminalStore.addLog(tabId, {
            timestamp: Date.now(),
            type: isSuccess ? 'success' : 'error',
            message: `\n${isSuccess ? '✓' : '✗'} Exit code: ${result.data.exitCode}\n`,
          })
        }

        // Run post-execution effects
        if (appId && appType) {
          await this.handlePostExecution(appId, appType, result.data.exitCode)
        }

        return {
          success: true,
          exitCode: result.data.exitCode,
          stdout: result.data.stdout,
          stderr: result.data.stderr,
          tabId,
        }
      } else {
        // Execution failed
        if (terminalStore && tabId) {
          terminalStore.setStatus(tabId, 'error')
          terminalStore.addLog(tabId, {
            timestamp: Date.now(),
            type: 'error',
            message: `\n✗ ${result.error}\n`,
          })
        }

        return {
          success: false,
          error: result.error,
          tabId,
        }
      }
    } catch (error) {
      // Exception during execution
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error'

      if (terminalStore && tabId) {
        terminalStore.setStatus(tabId, 'error')
        terminalStore.addLog(tabId, {
          timestamp: Date.now(),
          type: 'error',
          message: `\n✗ ${errorMessage}\n`,
        })
      }

      return {
        success: false,
        error: errorMessage,
        tabId,
      }
    }
  },

  /**
   * Handle post-execution effects
   *
   * Called after a command completes. Performs side effects like:
   * - Clearing tool health check cache (triggers re-check)
   * - Other app-type-specific effects
   */
  async handlePostExecution(
    appId: string,
    appType: AppType,
    exitCode: number,
  ): Promise<void> {
    // Clear health check for tools so they get re-checked
    // Use command-based clearing so all tools with same checkCommand update
    if (appType === 'tool') {
      const checkCommand = toolHealthService.getToolCommand(appId)
      if (checkCommand) {
        // Clear all tools that share this command
        toolHealthService.clearHealthChecksByCommand(checkCommand)
      } else {
        // Fallback to single tool clear
        toolHealthService.clearHealthCheck(appId)
      }
    }

    // Run registered callbacks
    for (const callback of postExecutionCallbacks) {
      try {
        await callback(appId, appType, exitCode)
      } catch (error) {
        console.error('Post-execution callback error:', error)
      }
    }
  },

  /**
   * Register a callback to run after command execution
   *
   * Useful for components that need to react to command completion,
   * like refreshing git status.
   */
  onPostExecution(callback: PostExecutionCallback): () => void {
    postExecutionCallbacks.push(callback)

    // Return unsubscribe function
    return () => {
      const index = postExecutionCallbacks.indexOf(callback)
      if (index > -1) {
        postExecutionCallbacks.splice(index, 1)
      }
    }
  },
}
