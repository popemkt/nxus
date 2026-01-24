import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type {
  ConfigSchema,
  DocEntry,
  InstallConfig,
  ItemMetadata,
} from '../types/item.js'
import type { WorkflowDefinition } from '../types/workflow.js'
import { json } from './columns.js'

/**
 * Inbox items - backlog of tools/apps to add later via add-item workflow
 */
export const inbox = sqliteTable('inbox', {
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

export type InboxEntry = typeof inbox.$inferSelect
export type NewInboxEntry = typeof inbox.$inferInsert

/**
 * Tags - hierarchical tag tree for organizing items
 * Uses integer ID for efficient indexing
 */
export const tags = sqliteTable('tags', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  parentId: integer('parent_id'),
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

/**
 * App Tags - junction table linking apps to tags
 * Proper relational design with foreign keys for referential integrity
 */
export const itemTags = sqliteTable(
  'item_tags',
  {
    appId: text('app_id').notNull(),
    tagId: integer('tag_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.appId, table.tagId] })],
)

export type ItemTag = typeof itemTags.$inferSelect
export type NewItemTag = typeof itemTags.$inferInsert

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
export const items = sqliteTable('items', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  type: text('type').$type<AppType>().notNull(),
  path: text('path').notNull(),
  homepage: text('homepage'),
  thumbnail: text('thumbnail'),

  // JSON fields with auto-parsing
  platform: json<string[]>()('platform'),
  docs: json<DocEntry[]>()('docs'),
  dependencies: json<string[]>()('dependencies'),
  metadata: json<ItemMetadata>()('metadata'),
  installConfig: json<InstallConfig>()('install_config'),

  // Tool-specific fields
  checkCommand: text('check_command'),
  installInstructions: text('install_instructions'),
  configSchema: json<ConfigSchema>()('config_schema'),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type DbItem = typeof items.$inferSelect
export type NewDbItem = typeof items.$inferInsert

// ============================================================================
// Commands - Extracted from apps for better querying
// ============================================================================

/**
 * Command target - what scope the command operates on (Drizzle schema type)
 */
export type DbCommandTarget = 'item' | 'instance'

/**
 * Command mode - how the command should be executed (Drizzle schema type)
 */
export type DbCommandMode =
  | 'execute'
  | 'copy'
  | 'terminal'
  | 'docs'
  | 'configure'
  | 'script'
  | 'preview'
  | 'workflow'

/**
 * Commands - individual commands extracted from apps for querying
 */
export const itemCommands = sqliteTable('item_commands', {
  id: text('id').primaryKey(), // Format: "{appId}:{commandId}"
  appId: text('app_id').notNull(),
  commandId: text('command_id').notNull(), // Local ID within app
  name: text('name').notNull(),
  description: text('description'),
  icon: text('icon').notNull(),
  category: text('category').notNull(),
  target: text('target').$type<DbCommandTarget>().notNull(),
  mode: text('mode').$type<DbCommandMode>().notNull(),
  command: text('command'),
  workflow: json<WorkflowDefinition>()('workflow'),
  scriptSource: text('script_source'), // 'nxus-app' | 'repo' | 'shared'
  cwd: text('cwd'),
  platforms: json<string[]>()('platforms'),
  requires: json<Record<string, unknown>>()('requires'),
  options: json<Record<string, unknown>>()('options'),
  /** Tagged item selectors (e.g., pick an AI provider) */
  requirements: json<Record<string, unknown>[]>()('requirements'),
  /** User input parameters to collect before execution */
  params: json<Record<string, unknown>[]>()('params'),

  // Soft delete
  deletedAt: integer('deleted_at', { mode: 'timestamp' }),

  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type DbItemCommand = typeof itemCommands.$inferSelect
export type NewDbItemCommand = typeof itemCommands.$inferInsert

// ============================================================================
// Tag Configurations - Schema definitions for configurable tags
// ============================================================================

/**
 * Tag configs - schema definitions for tags that require configuration
 * When an app has a "configurable" tag (e.g., ai-provider), it needs to
 * provide values matching this schema.
 */
export const tagSchemas = sqliteTable('tag_schemas', {
  tagId: integer('tag_id').primaryKey(), // References tags.id
  schema: json<Record<string, unknown>>()('schema').notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type TagSchema = typeof tagSchemas.$inferSelect
export type NewTagSchema = typeof tagSchemas.$inferInsert

/**
 * App tag values - per-app configuration values for configurable tags
 * Stores the actual values an app provides for a configurable tag.
 */
export const itemTagConfigs = sqliteTable('item_tag_configs', {
  appId: text('app_id').notNull(),
  tagId: integer('tag_id').notNull(), // References tags.id
  configValues: json<Record<string, unknown>>()('config_values').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type ItemTagConfig = typeof itemTagConfigs.$inferSelect
export type NewItemTagConfig = typeof itemTagConfigs.$inferInsert
