import { z } from 'zod'
import type { DependencyId } from './dependency'

/**
 * Known command IDs - use these for type-safe references
 * Add new commands here first, then register in command-registry.ts
 */
export const COMMAND_IDS = {
  GENERATE_THUMBNAIL: 'generate-thumbnail',
} as const

export type CommandId = (typeof COMMAND_IDS)[keyof typeof COMMAND_IDS]

/**
 * Command categories for grouping in command palette
 */
export const COMMAND_CATEGORIES = {
  THUMBNAILS: 'Thumbnails',
  GIT: 'Git',
  BUILD: 'Build',
  SCRIPTS: 'Scripts',
} as const

export type CommandCategory =
  (typeof COMMAND_CATEGORIES)[keyof typeof COMMAND_CATEGORIES]

/**
 * Command definition schema
 */
export const CommandSchema = z.object({
  id: z.string() as z.ZodType<CommandId>,
  name: z.string().min(1).describe('Display name for command palette'),
  description: z.string().describe('What this command does'),
  category: z.string().describe('Grouping for search'),
  icon: z.string().describe('Phosphor icon name'),
  dependencies: z.array(z.string() as z.ZodType<DependencyId>).default([]),
  keybinding: z.string().optional().describe('Keyboard shortcut'),
})
export type Command = z.infer<typeof CommandSchema>

/**
 * Context provided when executing a command
 */
export interface CommandExecutionContext {
  /** App ID if command is app-scoped */
  appId?: string
  /** Instance path if command is instance-scoped */
  instancePath?: string
  /** Additional parameters for the command */
  params?: Record<string, unknown>
}

/**
 * Result of command execution
 */
export interface CommandExecutionResult {
  success: boolean
  error?: string
  data?: unknown
}
