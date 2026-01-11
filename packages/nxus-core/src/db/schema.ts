import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/**
 * Inbox items - backlog of tools/apps to add later via add-item workflow
 */
export const inboxItems = sqliteTable('inbox_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  notes: text('notes'),
  status: text('status', { enum: ['pending', 'processing', 'done'] })
    .default('pending')
    .notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type InboxItem = typeof inboxItems.$inferSelect
export type NewInboxItem = typeof inboxItems.$inferInsert

/**
 * Tags - hierarchical tag tree for organizing items
 */
export const tags = sqliteTable('tags', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  parentId: text('parent_id'),
  order: integer('order').notNull().default(0),
  color: text('color'),
  icon: text('icon'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type Tag = typeof tags.$inferSelect
export type NewTag = typeof tags.$inferInsert

// ============================================================================
// Apps - Master data for all registered apps/tools
// ============================================================================

/**
 * App types that Nxus can manage
 */
export type AppType = 'html' | 'typescript' | 'remote-repo' | 'tool'

/**
 * Apps - master registry of all apps and tools
 * Complex nested fields (commands, docs, metadata) stored as JSON text
 */
export const apps = sqliteTable('apps', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type').$type<AppType>().notNull(),
  path: text('path').notNull(),
  homepage: text('homepage'),
  thumbnail: text('thumbnail'),

  // JSON-stringified complex fields
  platform: text('platform'), // JSON array: ["linux", "macos", "windows"]
  docs: text('docs'), // JSON array of DocEntry
  dependencies: text('dependencies'), // JSON array of string IDs
  metadata: text('metadata'), // JSON object: AppMetadata
  installConfig: text('install_config'), // JSON object: InstallConfig

  // Tool-specific fields
  checkCommand: text('check_command'),
  installInstructions: text('install_instructions'),
  configSchema: text('config_schema'), // JSON object: ConfigSchema

  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type App = typeof apps.$inferSelect
export type NewApp = typeof apps.$inferInsert

// ============================================================================
// Commands - Extracted from apps for better querying
// ============================================================================

/**
 * Command target - what scope the command operates on
 */
export type CommandTarget = 'app' | 'instance'

/**
 * Command mode - how the command should be executed
 */
export type CommandMode =
  | 'execute'
  | 'copy'
  | 'terminal'
  | 'docs'
  | 'configure'
  | 'script'
  | 'preview'

/**
 * Commands - individual commands extracted from apps for querying
 */
export const commands = sqliteTable('commands', {
  id: text('id').primaryKey(), // Format: "{appId}:{commandId}"
  appId: text('app_id').notNull(),
  commandId: text('command_id').notNull(), // Local ID within app
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon').notNull(),
  category: text('category').notNull(),
  target: text('target').$type<CommandTarget>().notNull(),
  mode: text('mode').$type<CommandMode>().notNull(),
  command: text('command').notNull(),
  scriptSource: text('script_source'), // 'nxus-app' | 'repo' | 'shared'
  cwd: text('cwd'),
  platforms: text('platforms'), // JSON array: ["linux", "macos", "windows"]
  requires: text('requires'), // JSON object: CommandRequirements

  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type Command = typeof commands.$inferSelect
export type NewCommand = typeof commands.$inferInsert

// ============================================================================
// Tag Configurations - Schema definitions for configurable tags
// ============================================================================

/**
 * Tag configs - schema definitions for tags that require configuration
 * When an app has a "configurable" tag (e.g., ai-provider), it needs to
 * provide values matching this schema.
 */
export const tagConfigs = sqliteTable('tag_configs', {
  tagId: text('tag_id').primaryKey(), // e.g., "ai-provider"
  schema: text('schema').notNull(), // JSON: { fields: [...] }
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type TagConfig = typeof tagConfigs.$inferSelect
export type NewTagConfig = typeof tagConfigs.$inferInsert

/**
 * App tag values - per-app configuration values for configurable tags
 * Stores the actual values an app provides for a configurable tag.
 */
export const appTagValues = sqliteTable('app_tag_values', {
  appId: text('app_id').notNull(),
  tagId: text('tag_id').notNull(),
  configValues: text('config_values').notNull(), // JSON values matching the tag's schema
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type AppTagValue = typeof appTagValues.$inferSelect
export type NewAppTagValue = typeof appTagValues.$inferInsert
