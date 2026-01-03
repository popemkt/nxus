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

import { useMemo, useCallback } from 'react'
import { useAllItemStatus } from '@/services/state/item-status-state'
import { itemStatusService } from '@/services/state/item-status-state'
import { commandExecutor } from '@/services/command-palette/executor'
import { useTerminalStore } from '@/stores/terminal.store'
import type { AppCommand, AppType, CommandRequirements } from '@/types/app'

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
  appType: AppType
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
 * Uses global state only - no UI context dependency
 */
function resolveRequirements(
  requirements: CommandRequirements | undefined,
  context: CommandContext,
  itemStatuses: Record<string, { isInstalled: boolean } | undefined>,
): CommandAvailability {
  // No requirements = always runnable
  if (!requirements) {
    return { canExecute: true }
  }

  // Check tool dependencies
  if (requirements.tools && requirements.tools.length > 0) {
    for (const toolId of requirements.tools) {
      const health = itemStatuses[toolId]
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
  if (requirements.selfInstalled) {
    const health = itemStatuses[context.appId]
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
  if (requirements.selfNotInstalled) {
    const health = itemStatuses[context.appId]
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
  command: AppCommand,
  context: CommandContext,
): UseCommandResult {
  // Subscribe to all health checks for reactivity
  const itemStatuses = useAllItemStatus()

  // Get terminal store for execution
  const { createTab, addLog, setStatus } = useTerminalStore()

  // Resolve availability from declarative requirements
  const availability = useMemo(() => {
    return resolveRequirements(command.requires, context, itemStatuses)
  }, [command.requires, context, itemStatuses])

  // Execute function
  const execute = useCallback(async () => {
    // Don't execute if not available
    if (!availability.canExecute) {
      return
    }

    // Execute based on mode
    switch (command.mode) {
      case 'execute':
      case 'terminal':
        await commandExecutor.executeStreaming({
          command: command.command,
          cwd: context.cwd,
          appId: context.appId,
          appType: context.appType,
          tabName: command.name,
          terminalStore: { createTab, addLog, setStatus },
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
  }, [availability.canExecute, command, context, createTab, addLog, setStatus])

  return { availability, execute }
}

/**
 * Imperative check for command availability (non-reactive)
 * Useful when you need a one-time check outside of React
 */
export function checkCommandAvailability(
  command: AppCommand,
  context: CommandContext,
): CommandAvailability {
  // Build health checks record from current state
  const itemStatuses: Record<string, { isInstalled: boolean } | undefined> = {}

  // Check required tools
  if (command.requires?.tools) {
    for (const toolId of command.requires.tools) {
      itemStatuses[toolId] = itemStatusService.getItemStatus(toolId)
    }
  }

  // Check self (for both selfInstalled and selfNotInstalled)
  if (command.requires?.selfInstalled || command.requires?.selfNotInstalled) {
    itemStatuses[context.appId] = itemStatusService.getItemStatus(context.appId)
  }

  return resolveRequirements(command.requires, context, itemStatuses)
}
