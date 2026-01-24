/**
 * Centralized Command Availability Checking
 *
 * This service provides a single source of truth for determining whether
 * a command can be executed. Both the command palette and app detail page
 * use this service to ensure consistent availability checking.
 *
 * @example
 * ```typescript
 * const availability = commandAvailability.checkCommand(cmd, { appId, instance })
 * if (!availability.canExecute) {
 *   console.log(`Cannot execute: ${availability.reason}`)
 * }
 * ```
 */

import { queryClient } from '@/lib/query-client'
import { getToolHealthFromCache } from '@/services/tool-health/utils'
import { appRegistryService } from '@/services/apps/registry.service'
import type { ItemType } from '@nxus/db'
import type { InstalledAppRecord } from '@/services/state/app-state'

/**
 * Result of an availability check
 */
export interface CommandAvailability {
  /** Whether the command can be executed */
  canExecute: boolean
  /** Human-readable reason if command cannot be executed */
  reason?: string
  /** List of missing dependencies by name */
  missingDependencies?: string[]
  /** Whether we're still checking availability */
  isChecking?: boolean
}

/**
 * Context for availability checking
 */
export interface AvailabilityContext {
  /** App ID the command belongs to */
  appId: string
  /** App type */
  appType: ItemType
  /** Selected instance (for instance-targeted commands) */
  instance?: InstalledAppRecord | null
  /** Whether the command targets an instance */
  requiresInstance?: boolean
}

/**
 * Check if a tool is installed and healthy
 * Reads from TanStack Query cache
 */
function checkToolHealth(appId: string): CommandAvailability {
  // Get the app to find its checkCommand
  const appResult = appRegistryService.getAppById(appId)
  if (!appResult.success || appResult.data.type !== 'tool') {
    return { canExecute: true }
  }

  const checkCommand = (appResult.data as any).checkCommand
  if (!checkCommand) {
    return { canExecute: true }
  }

  const health = getToolHealthFromCache(queryClient, checkCommand)

  // Not in cache yet = still checking
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

  return { canExecute: true }
}

/**
 * Check if an instance is selected when required
 */
function checkInstanceAvailable(
  requiresInstance: boolean,
  instance?: InstalledAppRecord | null,
): CommandAvailability {
  if (requiresInstance && !instance) {
    return {
      canExecute: false,
      reason: 'No instance selected',
    }
  }

  return { canExecute: true }
}

/**
 * Check if all dependencies for an app are met
 * Reads from TanStack Query cache
 */
function checkDependencies(appId: string): CommandAvailability {
  const depsResult = appRegistryService.getDependencies(appId)

  if (!depsResult.success || depsResult.data.length === 0) {
    return { canExecute: true }
  }

  const missingDeps: string[] = []

  for (const dep of depsResult.data) {
    // Only check tool dependencies
    if (dep.type === 'tool') {
      const checkCommand = (dep as any).checkCommand
      if (!checkCommand) continue

      const health = getToolHealthFromCache(queryClient, checkCommand)
      if (health === undefined) {
        // Still checking
        return {
          canExecute: false,
          isChecking: true,
          reason: `Checking ${dep.name}...`,
        }
      }
      if (!health.isInstalled) {
        missingDeps.push(dep.name)
      }
    }
  }

  if (missingDeps.length > 0) {
    return {
      canExecute: false,
      reason: `Missing: ${missingDeps.join(', ')}`,
      missingDependencies: missingDeps,
    }
  }

  return { canExecute: true }
}

/**
 * Check specific requirements for certain command types
 * Reads from TanStack Query cache
 */
function checkCommandSpecificRequirements(
  commandId: string,
  _context: AvailabilityContext,
): CommandAvailability {
  // Git commands require git to be installed
  if (commandId === 'git-pull' || commandId.startsWith('git-')) {
    const gitHealth = getToolHealthFromCache(queryClient, 'git --version')
    if (gitHealth === undefined) {
      return {
        canExecute: false,
        isChecking: true,
        reason: 'Checking Git...',
      }
    }
    if (!gitHealth.isInstalled) {
      return {
        canExecute: false,
        reason: 'Git not installed',
      }
    }
  }

  return { canExecute: true }
}

/**
 * Centralized command availability service
 */
export const commandAvailability = {
  /**
   * Check if a command can be executed given the current context
   *
   * Runs all relevant checks based on command type and context:
   * 1. Instance requirement check
   * 2. Tool health check (for tool apps)
   * 3. Dependencies check
   * 4. Command-specific checks (e.g., git installed for git commands)
   */
  check(commandId: string, context: AvailabilityContext): CommandAvailability {
    // Check 1: Instance requirement
    const instanceCheck = checkInstanceAvailable(
      context.requiresInstance ?? false,
      context.instance,
    )
    if (!instanceCheck.canExecute) {
      return instanceCheck
    }

    // Check 2: Tool health (if app is a tool)
    if (context.appType === 'tool') {
      const toolCheck = checkToolHealth(context.appId)
      if (!toolCheck.canExecute) {
        return toolCheck
      }
    }

    // Check 3: Dependencies
    const depsCheck = checkDependencies(context.appId)
    if (!depsCheck.canExecute) {
      return depsCheck
    }

    // Check 4: Command-specific requirements
    const cmdCheck = checkCommandSpecificRequirements(commandId, context)
    if (!cmdCheck.canExecute) {
      return cmdCheck
    }

    return { canExecute: true }
  },

  /**
   * Quick check for tool health only
   */
  checkToolHealth,

  /**
   * Quick check for dependencies only
   */
  checkDependencies,

  /**
   * Quick check for instance availability only
   */
  checkInstanceAvailable,
}
