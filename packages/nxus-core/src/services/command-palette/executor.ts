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

import { queryClient } from '@/lib/query-client'
import { appRegistryService } from '@/services/apps/registry.service'
import { streamCommandServerFn } from '@/services/shell/command-stream.server'
import type { LogEntry } from '@/services/shell/command.schema'
import { executeCommandServerFn } from '@/services/shell/command.server'
import { createPtySessionServerFn } from '@/services/shell/pty.server'
import { toolHealthKeys } from '@/services/tool-health/types'
import type { ItemType } from '@/types/item'

/**
 * Parse a command string into command and args, respecting quotes
 * Handles single quotes, double quotes, and escape characters
 *
 * @example
 * parseCommand('claude "hello world"') // => ['claude', 'hello world']
 * parseCommand('npm install --save')   // => ['npm', 'install', '--save']
 * parseCommand("echo 'it\\'s great'")  // => ['echo', "it's great"]
 */
function parseCommand(command: string): [string, string[]] {
  const args: string[] = []
  let currentArg = ''
  let inSingleQuote = false
  let inDoubleQuote = false
  let escapeNext = false

  for (let i = 0; i < command.length; i++) {
    const char = command[i]
    const nextChar = command[i + 1]

    if (escapeNext) {
      currentArg += char
      escapeNext = false
      continue
    }

    if (char === '\\' && nextChar) {
      escapeNext = true
      continue
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote
      continue
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote
      continue
    }

    if (char === ' ' && !inSingleQuote && !inDoubleQuote) {
      if (currentArg.length > 0) {
        args.push(currentArg)
        currentArg = ''
      }
      continue
    }

    currentArg += char
  }

  // Push the last arg
  if (currentArg.length > 0) {
    args.push(currentArg)
  }

  if (args.length === 0) {
    return ['', []]
  }

  const [cmd, ...rest] = args
  return [cmd, rest]
}

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
  appType?: ItemType
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
  appType: ItemType,
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

    // Parse command into parts (respects quotes)
    const [cmd, args] = parseCommand(command)

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

    // Parse command into parts (respects quotes)
    const [cmd, args] = parseCommand(command)

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
    appType: ItemType,
    exitCode: number,
  ): Promise<void> {
    // Clear health check for tools so they get re-checked
    if (appType === 'tool') {
      // Get the app's checkCommand to invalidate the right query
      const appResult = appRegistryService.getAppById(appId)
      if (appResult.success && appResult.data.type === 'tool') {
        const checkCommand = (appResult.data as any).checkCommand
        if (checkCommand) {
          // Invalidate TanStack Query cache - triggers refetch in subscribed components
          await queryClient.invalidateQueries({
            queryKey: toolHealthKeys.command(checkCommand),
          })
        }
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

    try {
      // Create PTY session with shellCommand - lets the shell handle all parsing
      const result = await createPtySessionServerFn({
        data: {
          cwd,
          shellCommand: command, // Pass full command to shell for proper parsing
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

  /**
   * Execute a script command (mode: 'script')
   *
   * This is the centralized handler for all script mode commands.
   * It handles:
   * 1. Resolving the script path via scriptSource
   * 2. Checking for parameters (returns early if params need UI)
   * 3. Respecting the `interactive` option
   *
   * @param options.appId - The app ID containing the script
   * @param options.scriptPath - Relative path to script (e.g., "my-script.ps1")
   * @param options.scriptSource - Where to resolve the script ('nxus-app' | 'repo' | 'shared')
   * @param options.interactive - If true, run in PTY terminal; else run in background
   * @param options.params - Optional pre-filled parameters (if already collected from UI)
   * @param options.terminalStore - Terminal store for PTY execution
   * @param options.onNeedsParams - Callback when script has parameters that need UI input
   */
  async executeScript(options: {
    appId: string
    appType?: ItemType
    scriptPath: string
    scriptSource?: string
    interactive?: boolean
    params?: Record<string, string | number | boolean>
    terminalStore?: TerminalStore
    tabName?: string
    cwd?: string
    onNeedsParams?: (params: unknown[]) => void
  }): Promise<CommandExecutionResult & { needsParams?: boolean }> {
    const {
      appId,
      appType,
      scriptPath,
      scriptSource,
      interactive = false,
      params,
      terminalStore,
      tabName,
      cwd,
      onNeedsParams,
    } = options

    // Import server functions dynamically to avoid circular deps
    const { getScriptFullPathServerFn } = await import(
      '@/services/shell/read-script.server'
    )
    const { parseScriptParamsServerFn } = await import(
      '@/services/shell/parse-script-params.server'
    )

    try {
      // Check if script has parameters (only if params not already provided)
      if (!params) {
        const paramResult = await parseScriptParamsServerFn({
          data: {
            appId,
            scriptPath,
            scriptSource,
          },
        })

        if (paramResult.success && paramResult.params.length > 0) {
          // Script has parameters - needs UI input
          if (onNeedsParams) {
            onNeedsParams(paramResult.params)
          }
          return {
            success: true,
            needsParams: true,
          }
        }
      }

      // Resolve script path
      const resolved = await getScriptFullPathServerFn({
        data: {
          appId,
          scriptPath,
          scriptSource,
        },
      })

      // Build command with parameters
      let fullCommand = `pwsh "${resolved.fullPath}"`
      if (params) {
        const paramString = Object.entries(params)
          .filter(([, v]) => v !== '' && v !== undefined)
          .map(([key, value]) => {
            if (typeof value === 'boolean') {
              return value ? `-${key}` : ''
            }
            return `-${key} "${value}"`
          })
          .filter(Boolean)
          .join(' ')
        if (paramString) {
          fullCommand += ` ${paramString}`
        }
      }

      // Execute based on interactive flag
      if (interactive) {
        // Interactive: run in PTY terminal
        return this.executeInteractive({
          command: fullCommand,
          cwd: cwd ?? resolved.scriptDir,
          appId,
          appType,
          tabName: tabName ?? scriptPath,
          terminalStore,
        })
      } else {
        // Non-interactive: run in background with streaming output
        return this.executeStreaming({
          command: fullCommand,
          cwd: cwd ?? resolved.scriptDir,
          appId,
          appType,
          tabName: tabName ?? scriptPath,
          terminalStore,
        })
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  },

  /**
   * Execute a workflow command (mode: 'workflow')
   *
   * This handles workflow commands that chain multiple steps together.
   * It uses the workflow executor to run steps in sequence.
   *
   * @param options.appId - The app ID containing the workflow command
   * @param options.commandId - The command ID of the workflow
   * @param options.params - Optional parameters for the workflow
   * @param options.terminalStore - Terminal store for command execution
   * @param options.onNotify - Callback for toast notifications
   */
  async executeWorkflowCommand(options: {
    appId: string
    commandId: string
    params?: Record<string, unknown>
    terminalStore?: TerminalStore
    onNotify?: (
      message: string,
      level: 'info' | 'success' | 'warning' | 'error',
    ) => void
  }): Promise<CommandExecutionResult> {
    const { appId, commandId, params, onNotify } = options

    // Get the app and command
    const appResult = appRegistryService.getAppById(appId)
    if (!appResult.success) {
      return {
        success: false,
        error: `App not found: ${appId}`,
      }
    }

    const command = appResult.data.commands?.find((c) => c.id === commandId)
    if (!command) {
      return {
        success: false,
        error: `Command not found: ${commandId}`,
      }
    }

    if (command.mode !== 'workflow' || !command.workflow) {
      return {
        success: false,
        error: `Command ${commandId} is not a workflow command`,
      }
    }

    // Import workflow executor
    const { executeWorkflow } = await import('@/services/workflow')

    // Execute the workflow
    const result = await executeWorkflow({
      item: appResult.data,
      command,
      params,
      onNotify: (message, level) => {
        // Call the callback if provided
        if (onNotify) {
          onNotify(message, level)
        }
        // Also log to console
        console.log(`[Workflow] ${level.toUpperCase()}: ${message}`)
      },
      onStepStart: (stepId, ref) => {
        console.log(`[Workflow] Starting step ${stepId}: ${ref}`)
      },
      onStepComplete: (stepId, stepResult) => {
        console.log(
          `[Workflow] Completed step ${stepId}: exit code ${stepResult.exitCode}`,
        )
      },
    })

    if (result.success) {
      onNotify?.('Workflow completed successfully', 'success')
    } else {
      onNotify?.(result.error ?? 'Workflow failed', 'error')
    }

    return {
      success: result.success,
      error: result.error,
    }
  },
}

