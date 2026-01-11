import { z } from 'zod'

/**
 * Supported platforms for app installation
 */
export const PlatformSchema = z.enum(['windows', 'linux', 'macos'])
export type Platform = z.infer<typeof PlatformSchema>

/**
 * App types that Nxus can manage
 */
export const AppTypeSchema = z.enum([
  'html',
  'typescript',
  'remote-repo',
  'tool',
])
export type AppType = z.infer<typeof AppTypeSchema>

/**
 * App installation status
 */
export const AppStatusSchema = z.enum([
  'installed',
  'not-installed',
  'available',
])
export type AppStatus = z.infer<typeof AppStatusSchema>

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
export const AppMetadataSchema = z.object({
  tags: z.array(TagRefSchema).default([]),
  category: z.string().default('uncategorized'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
})
export type AppMetadata = z.infer<typeof AppMetadataSchema>

/**
 * Command target - what scope the command operates on
 */
export const CommandTargetSchema = z.enum(['app', 'instance'])
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
 * Config-driven command defined in app-registry.json
 * For shell/script commands with different parameters per app
 */
export const AppCommandSchema = z.object({
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
})
export type AppCommand = z.infer<typeof AppCommandSchema>

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
const BaseAppSchema = z.object({
  id: z.string().describe('Unique identifier'),
  name: z.string().min(1).describe('Display name'),
  description: z.string().describe('App description'),
  type: AppTypeSchema,
  path: z.string().describe('Local path or remote URL'),
  homepage: z.string().url().optional().describe('URL to homepage/preview'),
  thumbnail: z.string().optional().describe('Path or URL to thumbnail image'),
  installConfig: InstallConfigSchema.optional(),
  metadata: AppMetadataSchema,
  status: AppStatusSchema.default('not-installed'),
  dependencies: z
    .array(z.string())
    .optional()
    .describe('Item IDs this item depends on'),
  commands: z
    .array(AppCommandSchema)
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
export const HtmlAppSchema = BaseAppSchema.extend({
  type: z.literal('html'),
  path: z.string().describe('Path to HTML file'),
})
export type HtmlApp = z.infer<typeof HtmlAppSchema>

/**
 * TypeScript app - full TypeScript application
 */
export const TypeScriptAppSchema = BaseAppSchema.extend({
  type: z.literal('typescript'),
  path: z.string().describe('Path to TypeScript project root'),
  startCommand: z.string().optional().describe('Command to start the app'),
  buildCommand: z.string().optional().describe('Command to build the app'),
})
export type TypeScriptApp = z.infer<typeof TypeScriptAppSchema>

/**
 * Remote repository - GitHub/GitLab repo to clone
 */
export const RemoteRepoAppSchema = BaseAppSchema.extend({
  type: z.literal('remote-repo'),
  path: z.string().url().describe('Git repository URL'),
  clonePath: z.string().optional().describe('Local path to clone to'),
  branch: z.string().optional().describe('Branch to checkout'),
})
export type RemoteRepoApp = z.infer<typeof RemoteRepoAppSchema>

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
export const ToolAppSchema = BaseAppSchema.extend({
  type: z.literal('tool'),
  path: z.string().describe('Installation source or package name'),
  installInstructions: z
    .string()
    .optional()
    .describe('How to install this tool'),
  checkCommand: z
    .string()
    .optional()
    .describe('Command to check if installed (e.g., "node --version")'),
  platform: z.array(PlatformSchema).describe('Supported platforms'),
  configSchema: ConfigSchemaSchema.optional().describe(
    'Configuration fields for this tool (e.g., API keys)',
  ),
})
export type ToolApp = z.infer<typeof ToolAppSchema>

/**
 * Discriminated union of all app types
 */
export const AppSchema = z.discriminatedUnion('type', [
  HtmlAppSchema,
  TypeScriptAppSchema,
  RemoteRepoAppSchema,
  ToolAppSchema,
])
export type App = z.infer<typeof AppSchema>

/**
 * App registry containing all apps
 */
export const AppRegistrySchema = z.object({
  version: z.string().default('1.0.0'),
  apps: z.array(AppSchema),
})
export type AppRegistry = z.infer<typeof AppRegistrySchema>

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E }

/**
 * Parse app data with validation
 */
export function parseApp(data: unknown): Result<App> {
  try {
    const app = AppSchema.parse(data)
    return { success: true, data: app }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}

/**
 * Parse app registry with validation
 */
export function parseAppRegistry(data: unknown): Result<AppRegistry> {
  try {
    const registry = AppRegistrySchema.parse(data)
    return { success: true, data: registry }
  } catch (error) {
    return { success: false, error: error as Error }
  }
}
