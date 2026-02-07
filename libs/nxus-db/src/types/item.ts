import { z } from 'zod'
import { CommandParamSchema, CommandRequirementSchema } from './command-params.js'
import { WorkflowDefinitionSchema } from './workflow.js'

/**
 * Supported platforms for app installation
 */
export const PlatformSchema = z.enum(['windows', 'linux', 'macos'])
export type Platform = z.infer<typeof PlatformSchema>

/**
 * App types that Nxus can manage
 */
export const ItemTypeSchema = z.enum([
  'html',
  'typescript',
  'remote-repo',
  'tool',
])
export type ItemType = z.infer<typeof ItemTypeSchema>

/**
 * App installation status
 */
export const ItemStatusSchema = z.enum([
  'installed',
  'not-installed',
  'available',
])
export type ItemStatus = z.infer<typeof ItemStatusSchema>

/**
 * Installation configuration for apps that require setup
 */
export const InstallConfigSchema = z.object({
  script: z.string().describe('Path to installation script'),
  platform: z.array(PlatformSchema).describe('Supported platforms'),
  preInstallCommands: z.array(z.string()).optional(),
  postInstallCommands: z.array(z.string()).optional(),
})
export type InstallConfig = z.infer<typeof InstallConfigSchema>

/**
 * Tag reference in app metadata
 */
export const TagRefSchema = z.object({
  id: z.number(),
  name: z.string(),
})
export type TagRef = z.infer<typeof TagRefSchema>

/**
 * App metadata for categorization and search
 */
export const ItemMetadataSchema = z.object({
  /**
   * Tags for this app.
   * NOTE: In SQLite, this is stored in the `app_tags` transition table.
   * It is populated here at runtime by the server function via a JOIN.
   */
  tags: z.array(TagRefSchema).default([]),
  category: z.string().default('uncategorized'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
})
export type ItemMetadata = z.infer<typeof ItemMetadataSchema>

/**
 * Command target - what scope the command operates on
 */
export const CommandTargetSchema = z.enum(['item', 'instance'])
export type CommandTarget = z.infer<typeof CommandTargetSchema>

/**
 * Command mode - how the command should be executed
 * - execute: Run command directly in background
 * - copy: Show popup with copyable command text
 * - terminal: Open terminal with command pre-filled
 * - docs: Open documentation URL
 * - configure: Open configuration modal
 * - script: Run a script file (supports preview button)
 * - preview: View content in a modal (for standalone preview commands)
 */
export const CommandModeSchema = z.enum([
  'execute',
  'copy',
  'terminal',
  'docs',
  'configure',
  'script',
  'preview',
  'workflow',
])
export type CommandMode = z.infer<typeof CommandModeSchema>

/**
 * Command requirements - declarative dependencies for command execution
 * Commands declare what they need, the system resolves availability
 */
export const CommandRequirementsSchema = z.object({
  /** Tool IDs that must be installed (e.g., ['git', 'node']) */
  tools: z.array(z.string()).optional(),
  /** Whether the tool itself must be installed (for uninstall/update commands) */
  selfInstalled: z.boolean().optional(),
  /** Whether the tool must NOT be installed (for install commands) */
  selfNotInstalled: z.boolean().optional(),
})
export type CommandRequirements = z.infer<typeof CommandRequirementsSchema>

/**
 * Script source - where to resolve script paths for mode: 'script'
 */
export const ScriptSourceSchema = z.enum(['nxus-app', 'repo', 'shared'])
export type ScriptSource = z.infer<typeof ScriptSourceSchema>

/**
 * Working directory specification for command execution
 * - 'scriptLocation': Directory containing the script (script mode only)
 * - 'instance': Selected instance path (script mode only)
 * - string: Custom absolute path (all modes)
 */
export const CwdSchema = z.union([
  z.enum(['scriptLocation', 'instance']),
  z.string(),
])
export type Cwd = z.infer<typeof CwdSchema>

/**
 * Script mode options - for mode: 'script'
 */
export const ScriptModeOptionsSchema = z.object({
  /** Run script in interactive terminal mode (default: false = background execution) */
  interactive: z.boolean().optional().default(false),
})
export type ScriptModeOptions = z.infer<typeof ScriptModeOptionsSchema>

/**
 * Base fields shared by all command types
 */
const BaseCommandSchema = z.object({
  id: z.string().describe('Unique command identifier'),
  name: z.string().describe('Display name'),
  description: z.string().optional(),
  icon: z.string().describe('Phosphor icon name'),
  category: z.string().describe('Grouping for UI'),
  target: CommandTargetSchema.describe('What scope this operates on'),
  override: z.string().optional().describe('ID of default command to override'),
  /** Platforms where this command is available */
  platforms: z.array(PlatformSchema).optional(),
  /** Declarative requirements - what this command needs to run */
  requires: CommandRequirementsSchema.optional(),
  /** Tagged item selectors (e.g., pick an AI provider) */
  requirements: z.array(CommandRequirementSchema).optional(),
  /** User input parameters to collect before execution */
  params: z.array(CommandParamSchema).optional(),
})

/**
 * Execute mode - run command directly in background
 */
const ExecuteCommandSchema = BaseCommandSchema.extend({
  mode: z.literal('execute'),
  command: z.string().describe('Shell command to execute'),
  cwd: CwdSchema.optional(),
})

/**
 * Terminal mode - open terminal with command pre-filled
 */
const TerminalCommandSchema = BaseCommandSchema.extend({
  mode: z.literal('terminal'),
  command: z.string().describe('Command to run in terminal'),
  cwd: CwdSchema.optional(),
})

/**
 * Copy mode - show popup with copyable command text
 */
const CopyCommandSchema = BaseCommandSchema.extend({
  mode: z.literal('copy'),
  command: z.string().describe('Text to copy'),
})

/**
 * Docs mode - open documentation URL
 */
const DocsCommandSchema = BaseCommandSchema.extend({
  mode: z.literal('docs'),
  command: z.string().url().describe('Documentation URL to open'),
})

/**
 * Configure mode - open configuration modal
 */
const ConfigureCommandSchema = BaseCommandSchema.extend({
  mode: z.literal('configure'),
  /** Configuration options */
  options: z.record(z.string(), z.any()).optional(),
})

/**
 * Script mode - run a script file
 */
const ScriptCommandSchema = BaseCommandSchema.extend({
  mode: z.literal('script'),
  command: z.string().describe('Script filename (e.g., install.ps1)'),
  /** Where to resolve script paths. Default: 'nxus-app' */
  scriptSource: ScriptSourceSchema.optional(),
  /** Working directory override */
  cwd: CwdSchema.optional(),
  /** Script execution options (typed) */
  scriptOptions: ScriptModeOptionsSchema.optional(),
  /** Script options (generic, for backward compat with existing manifests) */
  options: z.record(z.string(), z.any()).optional(),
})

/**
 * Preview mode - view content in a modal
 */
const PreviewCommandSchema = BaseCommandSchema.extend({
  mode: z.literal('preview'),
  command: z.string().describe('Content or path to preview'),
  /** Preview-specific options */
  options: z.record(z.string(), z.any()).optional(),
})

/**
 * Workflow mode - execute a multi-step workflow
 */
const WorkflowCommandSchema = BaseCommandSchema.extend({
  mode: z.literal('workflow'),
  workflow: WorkflowDefinitionSchema.describe('Workflow step definitions'),
})

/**
 * Discriminated union of all command types based on mode
 * Each mode has specific required/optional fields
 */
export const ItemCommandSchema = z.discriminatedUnion('mode', [
  ExecuteCommandSchema,
  TerminalCommandSchema,
  CopyCommandSchema,
  DocsCommandSchema,
  ConfigureCommandSchema,
  ScriptCommandSchema,
  PreviewCommandSchema,
  WorkflowCommandSchema,
])
export type ItemCommand = z.infer<typeof ItemCommandSchema>

// Export individual command type schemas for type narrowing
export type ExecuteCommand = z.infer<typeof ExecuteCommandSchema>
export type TerminalCommand = z.infer<typeof TerminalCommandSchema>
export type CopyCommand = z.infer<typeof CopyCommandSchema>
export type DocsCommand = z.infer<typeof DocsCommandSchema>
export type ConfigureCommand = z.infer<typeof ConfigureCommandSchema>
export type ScriptCommand = z.infer<typeof ScriptCommandSchema>
export type PreviewCommand = z.infer<typeof PreviewCommandSchema>
export type WorkflowCommand = z.infer<typeof WorkflowCommandSchema>

/** Union of commands that have a 'command' string field */
export type CommandWithString =
  | ExecuteCommand
  | TerminalCommand
  | CopyCommand
  | DocsCommand
  | ScriptCommand
  | PreviewCommand

/** Type guard: check if command has a 'command' string field */
export function hasCommandString(cmd: ItemCommand): cmd is CommandWithString {
  return 'command' in cmd && typeof cmd.command === 'string'
}

/** Safely get the command string from any command type */
export function getCommandString(cmd: ItemCommand): string | undefined {
  if (hasCommandString(cmd)) {
    return cmd.command
  }
  return undefined
}

/**
 * Documentation entry for an app
 */
export const DocEntrySchema = z.object({
  id: z.string().describe('Unique doc identifier'),
  title: z.string().describe('Display title for tab'),
  file: z.string().describe('Markdown filename (e.g., setup.md)'),
  icon: z.string().optional().describe('Phosphor icon name'),
})
export type DocEntry = z.infer<typeof DocEntrySchema>

/**
 * Configuration field schema for tools that need configuration
 */
export const ConfigFieldSchema = z.object({
  key: z.string().describe('Config key (e.g., ANTHROPIC_API_KEY)'),
  label: z.string().describe('Display label'),
  type: z.enum(['text', 'password', 'url']).describe('Input field type'),
  required: z.boolean().default(false).describe('Whether field is required'),
  defaultValue: z.string().optional().describe('Default value'),
  placeholder: z.string().optional().describe('Input placeholder text'),
})
export type ConfigField = z.infer<typeof ConfigFieldSchema>

/**
 * Configuration schema for tools
 */
export const ConfigSchemaSchema = z.object({
  fields: z.array(ConfigFieldSchema),
})
export type ConfigSchema = z.infer<typeof ConfigSchemaSchema>

/**
 * Base app configuration schema
 *
 * Multi-type support: Items can have multiple types via the `types` array.
 * The first type in the array (`types[0]`) is used for display purposes (icon, color, grouping).
 * The `type` field is kept for backward compatibility and equals `types[0]`.
 */
const BaseItemSchema = z.object({
  id: z.string().describe('Unique identifier'),
  name: z.string().min(1).describe('Display name'),
  description: z.string().describe('App description'),
  /**
   * All types assigned to this item.
   * At least one type is required.
   * The first type (`types[0]`) is used for display (icon, color, grouping).
   */
  types: z.array(ItemTypeSchema).min(1).describe('All types for this item'),
  /**
   * @deprecated Use `types[0]` instead. Kept for backward compatibility.
   * This equals `types[0]` (the first/display type).
   */
  type: ItemTypeSchema.describe('First type (deprecated, use types[0])'),
  path: z.string().describe('Local path or remote URL'),
  homepage: z.string().url().optional().describe('URL to homepage/preview'),
  thumbnail: z.string().optional().describe('Path or URL to thumbnail image'),
  installConfig: InstallConfigSchema.optional(),
  metadata: ItemMetadataSchema,
  status: ItemStatusSchema.default('not-installed'),
  dependencies: z
    .array(z.string())
    .optional()
    .describe('Item IDs this item depends on'),
  commands: z
    .array(ItemCommandSchema)
    .optional()
    .describe('Config-driven commands'),
  docs: z
    .array(DocEntrySchema)
    .optional()
    .describe('Documentation files for this app'),

  // Type-specific fields (optional at schema level, validated via refinements)
  /**
   * Command to check if tool is installed (e.g., "node --version").
   * Required when 'tool' is in types array.
   */
  checkCommand: z
    .string()
    .optional()
    .describe('Command to check if installed (required for tool type)'),
  /**
   * Supported platforms for tool installation.
   * Required when 'tool' is in types array.
   */
  platform: z
    .array(PlatformSchema)
    .optional()
    .describe('Supported platforms (required for tool type)'),
  /**
   * How to install this tool.
   */
  installInstructions: z
    .string()
    .optional()
    .describe('How to install this tool'),
  /**
   * Configuration fields for this tool (e.g., API keys).
   */
  configSchema: ConfigSchemaSchema.optional().describe(
    'Configuration fields for this tool (e.g., API keys)',
  ),
  /**
   * Command to start the TypeScript app.
   */
  startCommand: z.string().optional().describe('Command to start the app'),
  /**
   * Command to build the TypeScript app.
   */
  buildCommand: z.string().optional().describe('Command to build the app'),
  /**
   * Local path to clone remote-repo to.
   */
  clonePath: z.string().optional().describe('Local path to clone to'),
  /**
   * Branch to checkout for remote-repo.
   */
  branch: z.string().optional().describe('Branch to checkout'),
})

/**
 * Unified Item schema with multi-type support.
 *
 * Replaces the previous discriminated union to allow items to have multiple types.
 * Type-specific fields are validated via refinements based on the `types` array.
 */
export const ItemSchema = BaseItemSchema.superRefine((data, ctx) => {
  // Validate: type (deprecated) must match types[0]
  if (data.type !== data.types[0]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'type must match types[0] (type is deprecated)',
      path: ['type'],
    })
  }

  // Validate tool-specific fields
  if (data.types.includes('tool')) {
    if (!data.checkCommand) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "checkCommand is required when 'tool' is in types",
        path: ['checkCommand'],
      })
    }
    if (!data.platform || data.platform.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "platform is required when 'tool' is in types",
        path: ['platform'],
      })
    }
  }

  // Validate remote-repo-specific fields
  if (data.types.includes('remote-repo')) {
    // path should be a valid URL for remote-repo
    try {
      new URL(data.path)
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "path must be a valid URL when 'remote-repo' is in types",
        path: ['path'],
      })
    }
  }
})
export type Item = z.infer<typeof ItemSchema>

/**
 * Type alias for items that have 'tool' in their types array.
 * Use type guard `isToolItem` to narrow the type.
 */
export type ToolItem = Item & {
  checkCommand: string
  platform: Platform[]
}

/**
 * Type alias for items that have 'typescript' in their types array.
 */
export type TypeScriptItem = Item & {
  startCommand?: string
  buildCommand?: string
}

/**
 * Type alias for items that have 'remote-repo' in their types array.
 */
export type RemoteRepoItem = Item & {
  clonePath?: string
  branch?: string
}

/**
 * Type alias for items that have 'html' in their types array.
 */
export type HtmlItem = Item

/**
 * Type guard: check if item has 'tool' type
 */
export function isToolItem(item: Item): item is ToolItem {
  return (
    item.types.includes('tool') &&
    typeof item.checkCommand === 'string' &&
    Array.isArray(item.platform)
  )
}

/**
 * Type guard: check if item has 'typescript' type
 */
export function isTypeScriptItem(item: Item): item is TypeScriptItem {
  return item.types.includes('typescript')
}

/**
 * Type guard: check if item has 'remote-repo' type
 */
export function isRemoteRepoItem(item: Item): item is RemoteRepoItem {
  return item.types.includes('remote-repo')
}

/**
 * Type guard: check if item has 'html' type
 */
export function isHtmlItem(item: Item): item is HtmlItem {
  return item.types.includes('html')
}

/**
 * App registry containing all apps
 */
export const ItemRegistrySchema = z.object({
  version: z.string().default('1.0.0'),
  items: z.array(ItemSchema),
})
export type ItemRegistry = z.infer<typeof ItemRegistrySchema>

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E }

/**
 * Parse app data with validation
 */
export function parseItem(data: unknown): Result<Item> {
  try {
    const app = ItemSchema.parse(data)
    return { success: true, data: app }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

/**
 * Parse app registry with validation
 */
export function parseItemRegistry(data: unknown): Result<ItemRegistry> {
  try {
    const registry = ItemRegistrySchema.parse(data)
    return { success: true, data: registry }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}
