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
  'script-tool',
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
  dependencies: z
    .array(z.string())
    .optional()
    .describe('Required dependencies'),
  preInstallCommands: z.array(z.string()).optional(),
  postInstallCommands: z.array(z.string()).optional(),
})
export type InstallConfig = z.infer<typeof InstallConfigSchema>

/**
 * App metadata for categorization and search
 */
export const AppMetadataSchema = z.object({
  tags: z.array(z.string()).default([]),
  category: z.string().default('uncategorized'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  version: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
})
export type AppMetadata = z.infer<typeof AppMetadataSchema>

/**
 * Base app configuration schema
 */
const BaseAppSchema = z.object({
  id: z.string().uuid().describe('Unique identifier'),
  name: z.string().min(1).describe('Display name'),
  description: z.string().describe('App description'),
  type: AppTypeSchema,
  path: z.string().describe('Local path or remote URL'),
  homepage: z.string().url().optional().describe('URL to homepage/preview'),
  thumbnail: z.string().optional().describe('Path or URL to thumbnail image'),
  installConfig: InstallConfigSchema.optional(),
  metadata: AppMetadataSchema,
  status: AppStatusSchema.default('not-installed'),
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
 * Script tool - executable scripts with parameters
 */
export const ScriptToolAppSchema = BaseAppSchema.extend({
  type: z.literal('script-tool'),
  path: z.string().describe('Path to script file'),
  parameters: z
    .array(
      z.object({
        name: z.string(),
        type: z.enum(['string', 'number', 'boolean', 'select']),
        description: z.string(),
        required: z.boolean().default(false),
        default: z.union([z.string(), z.number(), z.boolean()]).optional(),
        options: z.array(z.string()).optional().describe('For select type'),
      }),
    )
    .optional(),
})
export type ScriptToolApp = z.infer<typeof ScriptToolAppSchema>

/**
 * Discriminated union of all app types
 */
export const AppSchema = z.discriminatedUnion('type', [
  HtmlAppSchema,
  TypeScriptAppSchema,
  RemoteRepoAppSchema,
  ScriptToolAppSchema,
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
