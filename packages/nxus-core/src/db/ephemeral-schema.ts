import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

// ============================================================================
// Ephemeral Schema - Local-only data, not committed to git
// ============================================================================

/**
 * Installations - machine-specific app installation records
 * Reset on fresh Nxus install, tracks where apps are installed locally
 */
export const installations = sqliteTable('installations', {
  id: text('id').primaryKey(), // UUID
  appId: text('app_id').notNull(), // References apps.id (cross-db)
  installPath: text('install_path').notNull(),
  name: text('name'), // User-defined name for this installation
  installedAt: integer('installed_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type Installation = typeof installations.$inferSelect
export type NewInstallation = typeof installations.$inferInsert

/**
 * Tool health status
 */
export type ToolHealthStatus = 'healthy' | 'unhealthy' | 'unknown'

/**
 * Tool health - cached health check results with TTL
 * Ephemeral because it's machine-specific and can be regenerated
 */
export const toolHealth = sqliteTable('tool_health', {
  toolId: text('tool_id').primaryKey(),
  status: text('status').$type<ToolHealthStatus>().notNull(),
  version: text('version'),
  error: text('error'), // Error message if unhealthy
  checkedAt: integer('checked_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(), // TTL
})

export type ToolHealth = typeof toolHealth.$inferSelect
export type NewToolHealth = typeof toolHealth.$inferInsert

/**
 * Command aliases - user-configured shortcuts for commands
 * Ephemeral because it's user preference, machine-specific
 */
export const commandAliases = sqliteTable('command_aliases', {
  id: text('id').primaryKey(), // UUID
  commandId: text('command_id').notNull(), // e.g. "go-to-app" or "myapp:run"
  alias: text('alias').notNull().unique(), // e.g. "g", "ai"
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type CommandAlias = typeof commandAliases.$inferSelect
export type NewCommandAlias = typeof commandAliases.$inferInsert
