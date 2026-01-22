import { z } from 'zod'
import { CommandParamSchema, CommandRequirementSchema } from './command-params'
import { WorkflowDefinitionSchema } from './workflow'

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
 * Config-driven command defined in app-registry.json
 * For shell/script commands with different parameters per app
 */
export const ItemCommandSchema = z.object({
  id: z.string().describe('Unique command identifier'),
  name: z.string().describe('Display name'),
  description: z.string().optional(),
  icon: z.string().describe('Phosphor icon name'),
  category: z.string().describe('Grouping for UI'),
  target: CommandTargetSchema.describe('What scope this operates on'),
  mode: CommandModeSchema.default('execute').describe(
    'How to execute this command',
  ),
  command: z.string().describe('Shell command to execute or URL for docs mode'),
  /** Where to resolve script paths (for mode: 'script'). Default: 'nxus-app' */
  scriptSource: ScriptSourceSchema.optional(),
  /** Working directory override. Default derived from scriptSource for scripts, process.cwd() for execute */
  cwd: CwdSchema.optional(),
  override: z.string().optional().describe('ID of default command to override'),
  /** Platforms where this command is available */
  platforms: z.array(PlatformSchema).optional(),
  /** Declarative requirements - what this command needs to run */
  requires: CommandRequirementsSchema.optional(),
  /** Mode-specific options (stored as JSON in DB, parsed based on mode type) */
  options: z.record(z.string(), z.any()).optional(),
  /** Tagged item selectors (e.g., pick an AI provider) */
  requirements: z.array(CommandRequirementSchema).optional(),
  /** User input parameters to collect before execution */
  params: z.array(CommandParamSchema).optional(),
  /** Workflow definition (for mode: 'workflow') */
  workflow: WorkflowDefinitionSchema.optional(),
})
export type ItemCommand = z.infer<typeof ItemCommandSchema>

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
 * Base app configuration schema
 */
const BaseItemSchema = z.object({
  id: z.string().describe('Unique identifier'),
  name: z.string().min(1).describe('Display name'),
  description: z.string().describe('App description'),
  type: ItemTypeSchema,
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
})

/**
 * HTML app - single HTML file that can be opened in browser
 */
export const HtmlItemSchema = BaseItemSchema.extend({
  type: z.literal('html'),
  path: z.string().describe('Path to HTML file'),
})
export type HtmlItem = z.infer<typeof HtmlItemSchema>

/**
 * TypeScript app - full TypeScript application
 */
export const TypeScriptItemSchema = BaseItemSchema.extend({
  type: z.literal('typescript'),
  path: z.string().describe('Path to TypeScript project root'),
  startCommand: z.string().optional().describe('Command to start the app'),
  buildCommand: z.string().optional().describe('Command to build the app'),
})
export type TypeScriptItem = z.infer<typeof TypeScriptItemSchema>

/**
 * Remote repository - GitHub/GitLab repo to clone
 */
export const RemoteRepoItemSchema = BaseItemSchema.extend({
  type: z.literal('remote-repo'),
  path: z.string().url().describe('Git repository URL'),
  clonePath: z.string().optional().describe('Local path to clone to'),
  branch: z.string().optional().describe('Branch to checkout'),
})
export type RemoteRepoItem = z.infer<typeof RemoteRepoItemSchema>

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
 * Tool app - installable tools/dependencies like node, npm, git
 */
export const ToolItemSchema = BaseItemSchema.extend({
  type: z.literal('tool'),
  path: z.string().describe('Installation source or package name'),
  installInstructions: z
    .string()
    .optional()
    .describe('How to install this tool'),
  checkCommand: z
    .string()
    .describe('Command to check if installed (e.g., "node --version")'),
  platform: z.array(PlatformSchema).describe('Supported platforms'),
  configSchema: ConfigSchemaSchema.optional().describe(
    'Configuration fields for this tool (e.g., API keys)',
  ),
})
export type ToolItem = z.infer<typeof ToolItemSchema>

/**
 * Discriminated union of all app types
 */
export const ItemSchema = z.discriminatedUnion('type', [
  HtmlItemSchema,
  TypeScriptItemSchema,
  RemoteRepoItemSchema,
  ToolItemSchema,
])
export type Item = z.infer<typeof ItemSchema>

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
