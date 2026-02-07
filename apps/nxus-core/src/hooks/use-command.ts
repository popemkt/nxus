/**
 * useCommand - Headless hook for command execution
 *
 * This hook provides a consistent interface for checking command availability
 * and executing commands, regardless of where the command is rendered.
 *
 * The hook:
 * 1. Resolves command requirements from global state (not UI context)
 * 2. Provides availability status with reason
 * 3. Handles execution with consistent side effects
 *
 * @example
 * ```tsx
 * function MyButton({ command }) {
 *   const { availability, execute } = useCommand(command, { appId, appType })
 *
 *   return (
 *     <button
 *       disabled={!availability.canExecute}
 *       onClick={execute}
 *       title={availability.reason}
 *     >
 *       {command.name}
 *     </button>
 *   )
 * }
 * ```
 */

import { useQueries } from '@tanstack/react-query'
import { useCallback, useMemo } from 'react'
import type { CommandRequirements, ItemCommand, ItemType } from '@nxus/db'
import type {ToolHealthResult} from '@/services/tool-health/types';
import { queryClient } from '@/lib/query-client'
import { appRegistryService } from '@/services/apps/registry.service'
import { commandExecutor } from '@/services/command-palette/executor'
import { checkToolHealth } from '@/services/tool-health/tool-health.server'
import {
  
  toolHealthKeys
} from '@/services/tool-health/types'
import { getToolHealthFromCache } from '@/services/tool-health/utils'
import { useTerminalStore } from '@/stores/terminal.store'

/**
 * Get the actual checkCommand for a tool ID by looking it up in the registry.
 * Falls back to `${toolId} --version` for unknown tools or non-tool types.
 */
function getCheckCommandForTool(toolId: string): string {
  const appResult = appRegistryService.getAppById(toolId)
  if (appResult.success && appResult.data.type === 'tool') {
    return appResult.data.checkCommand
  }
  // Tool not found in registry or not a tool type - log warning but don't crash
  const fallback = `${toolId} --version`
  console.warn(
    `Cannot resolve checkCommand for tool "${toolId}": ${
      appResult.success
        ? 'item is not a tool type'
        : 'item not found in registry'
    }. Using fallback: ${fallback}`,
  )
  return fallback
}

/**
 * Result of availability check
 */
export interface CommandAvailability {
  /** Whether the command can be executed */
  canExecute: boolean
  /** Human-readable reason if command cannot be executed */
  reason?: string
  /** Whether we're still checking availability */
  isChecking?: boolean
}

/**
 * Context for command execution
 */
export interface CommandContext {
  /** App ID the command belongs to */
  appId: string
  /** App type for post-execution effects */
  appType: ItemType
  /** Working directory (for instance-targeted commands) */
  cwd?: string
}

/**
 * Return type of useCommand hook
 */
export interface UseCommandResult {
  /** Current availability status */
  availability: CommandAvailability
  /** Execute the command (no-op if not available) */
  execute: () => Promise<void>
}

/**
 * Resolve command availability from declarative requirements
 * Uses TanStack Query cache - no Zustand dependency
 */
function resolveRequirements(
  requirements: CommandRequirements | undefined,
  _context: CommandContext,
  healthByCommand: Map<string, ToolHealthResult | undefined>,
  selfCheckCommand?: string,
): CommandAvailability {
  // No requirements = always runnable
  if (!requirements) {
    return { canExecute: true }
  }

  // Check tool dependencies
  if (requirements.tools && requirements.tools.length > 0) {
    for (const toolId of requirements.tools) {
      // Look up actual checkCommand from registry (e.g., warp -> warp-terminal --dump-debug-info)
      const checkCommand = getCheckCommandForTool(toolId)
      const health = healthByCommand.get(checkCommand)
      if (health === undefined) {
        // Still checking
        return {
          canExecute: false,
          isChecking: true,
          reason: 'Checking...',
        }
      }
      if (!health.isInstalled) {
        return {
          canExecute: false,
          reason: `Missing: ${toolId}`,
        }
      }
    }
  }

  // Check if tool itself must be installed (for uninstall/update)
  if (requirements.selfInstalled && selfCheckCommand) {
    const health = healthByCommand.get(selfCheckCommand)
    if (health === undefined) {
      return {
        canExecute: false,
        isChecking: true,
        reason: 'Checking...',
      }
    }
    if (!health.isInstalled) {
      return {
        canExecute: false,
        reason: 'Not installed',
      }
    }
  }

  // Check if tool must NOT be installed (for install commands)
  if (requirements.selfNotInstalled && selfCheckCommand) {
    const health = healthByCommand.get(selfCheckCommand)
    if (health === undefined) {
      return {
        canExecute: false,
        isChecking: true,
        reason: 'Checking...',
      }
    }
    if (health.isInstalled) {
      return {
        canExecute: false,
        reason: 'Already installed',
      }
    }
  }

  return { canExecute: true }
}

/**
 * Headless hook for command availability and execution
 *
 * Provides consistent behavior regardless of where the command is rendered:
 * - Command palette
 * - App detail page
 * - Instance actions panel
 */
export function useCommand(
  command: ItemCommand,
  context: CommandContext,
): UseCommandResult {
  // Get terminal store for execution
  const { createTab, createInteractiveTab, addLog, setStatus } =
    useTerminalStore()

  // Build list of checkCommands we need to query
  const checkCommands = useMemo(() => {
    const commands: Array<string> = []
    if (command.requires?.tools) {
      for (const toolId of command.requires.tools) {
        // Look up actual checkCommand from registry
        commands.push(getCheckCommandForTool(toolId))
      }
    }
    return commands
  }, [command.requires?.tools])

  // Subscribe to the relevant queries for reactivity
  const queries = useQueries({
    queries: checkCommands.map((checkCommand) => ({
      queryKey: toolHealthKeys.command(checkCommand),
      queryFn: async () => checkToolHealth({ data: { checkCommand } }),
      staleTime: 5 * 60 * 1000,
    })),
  })

  // Build health map from queries
  const healthByCommand = useMemo(() => {
    const map = new Map<string, ToolHealthResult | undefined>()
    checkCommands.forEach((cmd, i) => {
      map.set(cmd, queries[i]?.data)
    })
    return map
  }, [checkCommands, queries])

  // Resolve availability from declarative requirements
  const availability = useMemo(() => {
    // Get self check command if needed
    let selfCheckCommand: string | undefined
    if (command.requires?.selfInstalled || command.requires?.selfNotInstalled) {
      // For self checks, we'd need the app's checkCommand
      // This would require passing it in or looking it up
      // For now, skip self checks in this hook (they're handled elsewhere)
    }
    return resolveRequirements(
      command.requires,
      context,
      healthByCommand,
      selfCheckCommand,
    )
  }, [command.requires, context, healthByCommand])

  // Execute function
  const execute = useCallback(async () => {
    // Don't execute if not available
    if (!availability.canExecute) {
      return
    }

    // Execute based on mode
    switch (command.mode) {
      case 'execute':
        await commandExecutor.executeStreaming({
          command: command.command,
          cwd: context.cwd,
          appId: context.appId,
          appType: context.appType,
          tabName: command.name,
          terminalStore: { createTab, createInteractiveTab, addLog, setStatus },
        })
        break

      case 'terminal':
        await commandExecutor.executeInteractive({
          command: command.command,
          cwd: context.cwd,
          appId: context.appId,
          appType: context.appType,
          tabName: command.name,
          terminalStore: { createTab, createInteractiveTab, addLog, setStatus },
        })
        break

      case 'docs':
        window.open(command.command, '_blank', 'noopener,noreferrer')
        break

      case 'copy':
        await navigator.clipboard.writeText(command.command)
        break

      case 'configure':
        // Configure mode is handled separately via configureModalService
        // This is because it requires the commandId as well
        break
    }
  }, [
    availability.canExecute,
    command,
    context,
    createTab,
    createInteractiveTab,
    addLog,
    setStatus,
  ])

  return { availability, execute }
}

/**
 * Imperative check for command availability (non-reactive)
 * Useful when you need a one-time check outside of React
 *
 * Reads from TanStack Query cache - no Zustand dependency
 */
export function checkCommandAvailability(
  command: ItemCommand,
  context: CommandContext,
  selfCheckCommand?: string,
): CommandAvailability {
  // Use queryClient imported at module level
  const qc = queryClient

  // Build health checks record from query cache
  const healthByCommand = new Map<string, ToolHealthResult | undefined>()

  // Check required tools
  if (command.requires?.tools) {
    for (const toolId of command.requires.tools) {
      // Look up actual checkCommand from registry
      const checkCommand = getCheckCommandForTool(toolId)
      healthByCommand.set(
        checkCommand,
        getToolHealthFromCache(qc, checkCommand),
      )
    }
  }

  // Check self health if needed
  if (
    selfCheckCommand &&
    (command.requires?.selfInstalled || command.requires?.selfNotInstalled)
  ) {
    healthByCommand.set(
      selfCheckCommand,
      getToolHealthFromCache(qc, selfCheckCommand),
    )
  }

  return resolveRequirements(
    command.requires,
    context,
    healthByCommand,
    selfCheckCommand,
  )
}
