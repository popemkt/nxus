/**
 * Unified Command Types
 *
 * Provides a discriminated union that wraps both ItemCommand (manifest-based)
 * and GenericCommand (code-defined) for unified consumption by the command palette.
 *
 * @see ItemCommand - Manifest/DB-stored commands bound to items
 * @see GenericCommand - System commands defined in registry.ts
 */

import type { Item, ItemCommand, CommandRequirements } from './item.js'
import type { CommandRequirement, CommandParam } from './command-params.js'

// ============================================================================
// Generic Command Target (includes 'none' for global commands)
// ============================================================================

/**
 * Target type for generic commands
 * - 'item': Requires selecting an item first
 * - 'instance': Requires selecting an instance first
 * - 'none': No target needed (global commands like "Settings")
 */
export type GenericCommandTarget = 'item' | 'instance' | 'none'

// ============================================================================
// Generic Command Context
// ============================================================================

/**
 * Context bag passed to generic command execute functions.
 * Provides UI capabilities (navigate, etc.) via dependency injection.
 */
export interface GenericCommandContext {
  /** Navigate to a route path (basepath-aware via TanStack Router) */
  navigate: (to: string) => void
  /** Resolved requirement selections from the params modal */
  requirements?: Record<
    string,
    { appId: string; value: Record<string, unknown> }
  >
  /** Resolved parameter values from the params modal */
  params?: Record<string, string | number | boolean>
}

// ============================================================================
// Generic Command Definition
// ============================================================================

/**
 * Generic command that may need target selection.
 * These are system/global commands defined in code, not manifests.
 */
export interface GenericCommand {
  id: string
  name: string
  icon: string
  description?: string
  /** What target this command operates on */
  target?: GenericCommandTarget
  /** Optional filter for target selection (e.g., only show remote-repo items) */
  targetFilter?: (item: Item) => boolean
  /** Declarative tool requirements (optional, for future use) */
  requires?: CommandRequirements
  /** Tagged item selectors (e.g., pick an AI provider) */
  requirements?: CommandRequirement[]
  /** User input parameters to collect before execution */
  params?: CommandParam[]
  /** Execute the command */
  execute: (
    targetId: string | undefined,
    targetPath: string | undefined,
    context: GenericCommandContext,
  ) => void | Promise<void>
}

// ============================================================================
// Unified Command (Discriminated Union)
// ============================================================================

/**
 * Item-bound command wrapper
 * Source: manifest.json / database
 */
export interface ItemBoundCommand {
  source: 'item'
  /** Composite ID: `${app.id}:${command.id}` */
  id: string
  /** The item this command belongs to */
  app: Item
  /** The command definition */
  command: ItemCommand
}

/**
 * Generic command wrapper
 * Source: code-defined in registry.ts
 */
export interface GenericBoundCommand {
  source: 'generic'
  /** Command ID (same as GenericCommand.id) */
  id: string
  /** The command definition */
  command: GenericCommand
}

/**
 * Unified command type - discriminated union
 *
 * Consumers should switch on `source` for type-safe access:
 * ```ts
 * if (cmd.source === 'item') {
 *   // cmd.app and cmd.command are ItemCommand
 * } else {
 *   // cmd.command is GenericCommand
 * }
 * ```
 */
export type UnifiedCommand = ItemBoundCommand | GenericBoundCommand

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get display name for a unified command
 */
export function getUnifiedCommandName(cmd: UnifiedCommand): string {
  return cmd.command.name
}

/**
 * Get icon for a unified command
 */
export function getUnifiedCommandIcon(cmd: UnifiedCommand): string {
  return cmd.command.icon
}

/**
 * Get description for a unified command
 */
export function getUnifiedCommandDescription(
  cmd: UnifiedCommand,
): string | undefined {
  return cmd.command.description
}

/**
 * Get target type for a unified command
 * Returns 'item' | 'instance' | 'none'
 */
export function getUnifiedCommandTarget(
  cmd: UnifiedCommand,
): 'item' | 'instance' | 'none' {
  if (cmd.source === 'item') {
    // ItemCommand.target is 'item' | 'instance' (no 'none')
    return cmd.command.target
  }
  // GenericCommand.target defaults to 'none'
  return cmd.command.target ?? 'none'
}

/**
 * Check if command needs target selection
 */
export function commandNeedsTarget(cmd: UnifiedCommand): boolean {
  return getUnifiedCommandTarget(cmd) !== 'none'
}

/**
 * Get requirements (tagged item selectors) for a unified command
 */
export function getUnifiedCommandRequirements(
  cmd: UnifiedCommand,
): CommandRequirement[] | undefined {
  return cmd.command.requirements
}

/**
 * Get params (user inputs) for a unified command
 */
export function getUnifiedCommandParams(
  cmd: UnifiedCommand,
): CommandParam[] | undefined {
  return cmd.command.params
}

/**
 * Get requires (tool dependencies) for a unified command
 */
export function getUnifiedCommandRequires(
  cmd: UnifiedCommand,
): CommandRequirements | undefined {
  return cmd.command.requires
}
