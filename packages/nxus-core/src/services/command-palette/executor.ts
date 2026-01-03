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
import {
  streamCommandServerFn,
  type StreamChunk,
} from '@/services/shell/command-stream.server'
import { createPtySessionServerFn } from '@/services/shell/pty.server'
import { itemStatusService } from '@/services/state/item-status-state'
import { queryClient } from '@/lib/query-client'
import { itemStatusKeys } from '@/hooks/use-item-status-query'
import type { AppType } from '@/types/app'
import type { LogEntry } from '@/services/shell/command.schema'

// Terminal store interface matching the actual store
type TerminalStore = {
  createTab: (name: string) => string
  createInteractiveTab: (name: string, ptySessionId: string) => string
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
  /** PTY session ID for interactive terminals */
  ptySessionId?: string
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
   *
   * @deprecated Use executeStreaming instead for real-time output feedback.
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
   * Execute a command with streaming output
   *
   * Similar to execute(), but streams stdout/stderr chunks in real-time
   * to the terminal panel instead of waiting for the command to complete.
   */
  async executeStreaming(
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

    let exitCode = 0
    let stdout = ''
    let stderr = ''

    try {
      const stream = await streamCommandServerFn({
        data: { command: cmd, args, cwd },
      })

      // Consume the async iterable stream
      for await (const chunk of stream) {
        switch (chunk.type) {
          case 'stdout':
            stdout += chunk.data
            if (terminalStore && tabId) {
              terminalStore.addLog(tabId, {
                timestamp: Date.now(),
                type: 'stdout',
                message: chunk.data,
              })
            }
            break

          case 'stderr':
            stderr += chunk.data
            if (terminalStore && tabId) {
              terminalStore.addLog(tabId, {
                timestamp: Date.now(),
                type: 'stderr',
                message: chunk.data,
              })
            }
            break

          case 'exit':
            exitCode = chunk.exitCode
            break

          case 'error':
            if (terminalStore && tabId) {
              terminalStore.setStatus(tabId, 'error')
              terminalStore.addLog(tabId, {
                timestamp: Date.now(),
                type: 'error',
                message: `\n✗ ${chunk.message}\n`,
              })
            }
            return {
              success: false,
              error: chunk.message,
              tabId,
            }
        }
      }

      // Set final status
      const isSuccess = exitCode === 0
      if (terminalStore && tabId) {
        terminalStore.setStatus(tabId, isSuccess ? 'success' : 'error')
        terminalStore.addLog(tabId, {
          timestamp: Date.now(),
          type: isSuccess ? 'success' : 'error',
          message: `\n${isSuccess ? '✓' : '✗'} Exit code: ${exitCode}\n`,
        })
      }

      // Run post-execution effects
      if (appId && appType) {
        await this.handlePostExecution(appId, appType, exitCode)
      }

      return {
        success: isSuccess,
        exitCode,
        stdout,
        stderr,
        tabId,
      }
    } catch (error) {
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
      const checkCommand = itemStatusService.getCheckCommand(appId)
      if (checkCommand) {
        // 1. Clear Zustand (immediate UI update if subscribed)
        itemStatusService.clearStatusesByCommand(checkCommand)
        // 2. Invalidate Query Cache (triggers refetch)
        await queryClient.invalidateQueries({
          queryKey: itemStatusKeys.command(checkCommand),
        })
      } else {
        // Fallback to single tool clear
        itemStatusService.clearItemStatus(appId)
        // Note: We can't easily invalidate Query here without the command,
        // but getCheckCommand should usually return something if registered.
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

  /**
   * Execute an interactive terminal command
   *
   * Creates a PTY session and an interactive terminal tab.
   * Unlike execute/executeStreaming, this doesn't wait for completion -
   * the user interacts with the terminal directly.
   */
  async executeInteractive(
    options: CommandExecutionOptions,
  ): Promise<CommandExecutionResult> {
    const { command, cwd, tabName, terminalStore } = options

    if (!terminalStore) {
      return {
        success: false,
        error: 'Terminal store required for interactive execution',
      }
    }

    // Parse command - for interactive, we may run a specific command or just open a shell
    const parts = command ? command.split(' ') : []
    const cmd = parts[0] || undefined
    const args = parts.slice(1)

    try {
      // Create PTY session
      const result = await createPtySessionServerFn({
        data: {
          cwd,
          command: cmd,
          args: args.length > 0 ? args : undefined,
        },
      })

      if (!result.success) {
        return {
          success: false,
          error: result.error,
        }
      }

      // Create interactive terminal tab
      const tabId = terminalStore.createInteractiveTab(
        tabName ?? command ?? 'Terminal',
        result.sessionId,
      )

      return {
        success: true,
        tabId,
        ptySessionId: result.sessionId,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },
}
