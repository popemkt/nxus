/**
 * apps.server.ts - Server functions for loading apps from SQLite
 *
 * Provides server-side access to the apps and commands tables.
 * Replaces the old filesystem-based manifest.json loading.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { initDatabase, getDatabase } from '../../db/client'
import { apps, commands } from '../../db/schema'
import { eq, isNull, and } from 'drizzle-orm'
import type { App, AppCommand, AppMetadata, DocEntry } from '../../types/app'

/**
 * Map database record to App type
 * JSON fields are now auto-parsed by the schema's json() column type
 *
 * IMPORTANT: This is the data boundary - we ensure metadata shape here
 * so downstream code never needs defensive checks
 */
function parseAppRecord(record: typeof apps.$inferSelect): App {
  // Ensure metadata has proper defaults - this is the type-safe boundary
  const rawMetadata = record.metadata as Partial<AppMetadata> | undefined
  const metadata: AppMetadata = {
    tags: Array.isArray(rawMetadata?.tags) ? rawMetadata.tags : [],
    category: rawMetadata?.category ?? 'uncategorized',
    createdAt: rawMetadata?.createdAt ?? '',
    updatedAt: rawMetadata?.updatedAt ?? '',
    version: rawMetadata?.version,
    author: rawMetadata?.author,
    license: rawMetadata?.license,
  }

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    type: record.type as App['type'],
    path: record.path,
    homepage: record.homepage ?? undefined,
    thumbnail: record.thumbnail ?? undefined,
    platform: record.platform ?? undefined,
    docs: record.docs ?? undefined,
    dependencies: record.dependencies ?? undefined,
    metadata, // Now guaranteed to have proper shape
    installConfig: record.installConfig ?? undefined,
    checkCommand: record.checkCommand ?? undefined,
    installInstructions: record.installInstructions ?? undefined,
    configSchema: record.configSchema ?? undefined,
    status: 'not-installed', // Runtime status, not stored
    commands: [], // Will be populated separately
  } as App
}

/**
 * Map command record to AppCommand type
 * JSON fields are now auto-parsed by the schema's json() column type
 */
function parseCommandRecord(record: typeof commands.$inferSelect): AppCommand {
  return {
    id: record.commandId, // Use local command ID, not global
    name: record.name,
    description: record.description ?? undefined,
    icon: record.icon,
    category: record.category,
    target: record.target as AppCommand['target'],
    mode: record.mode as AppCommand['mode'],
    command: record.command,
    scriptSource:
      (record.scriptSource as AppCommand['scriptSource']) ?? undefined,
    cwd: record.cwd ?? undefined,
    platforms: record.platforms ?? undefined,
    requires: record.requires ?? undefined,
    options: record.options ?? undefined,
  }
}

/**
 * Get all apps from SQLite database
 */
export const getAllAppsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    initDatabase()
    const db = getDatabase()

    // Get all apps
    const appRecords = db.select().from(apps).all()

    // Get all active commands (not soft-deleted) grouped by app
    const commandRecords = db
      .select()
      .from(commands)
      .where(isNull(commands.deletedAt))
      .all()
    const commandsByApp = new Map<string, AppCommand[]>()

    for (const cmd of commandRecords) {
      const appCommands = commandsByApp.get(cmd.appId) ?? []
      appCommands.push(parseCommandRecord(cmd))
      commandsByApp.set(cmd.appId, appCommands)
    }

    // Parse and assemble apps with their commands
    const parsedApps = appRecords.map((record) => {
      const app = parseAppRecord(record)
      app.commands = commandsByApp.get(record.id) ?? []
      return app
    })

    return { success: true as const, apps: parsedApps }
  },
)

const GetAppByIdSchema = z.object({
  id: z.string(),
})

/**
 * Get a single app by ID from SQLite
 */
export const getAppByIdServerFn = createServerFn({ method: 'GET' })
  .inputValidator(GetAppByIdSchema)
  .handler(async (ctx) => {
    const { id } = ctx.data

    initDatabase()
    const db = getDatabase()

    // Get app
    const appRecord = db.select().from(apps).where(eq(apps.id, id)).get()

    if (!appRecord) {
      return { success: false as const, error: `App ${id} not found` }
    }

    // Get active commands for this app (not soft-deleted)
    const commandRecords = db
      .select()
      .from(commands)
      .where(and(eq(commands.appId, id), isNull(commands.deletedAt)))
      .all()

    const app = parseAppRecord(appRecord)
    app.commands = commandRecords.map(parseCommandRecord)

    return { success: true as const, app }
  })

/**
 * Get all categories from apps
 */
export const getCategoriesServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    initDatabase()
    const db = getDatabase()

    const appRecords = db.select().from(apps).all()

    const categories = new Set<string>()
    for (const record of appRecords) {
      if (record.metadata) {
        categories.add(record.metadata.category)
      }
    }

    return { success: true as const, categories: Array.from(categories).sort() }
  },
)

/**
 * Get all tags from apps
 */
export const getTagsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    initDatabase()
    const db = getDatabase()

    const appRecords = db.select().from(apps).all()

    const tags = new Set<string>()
    for (const record of appRecords) {
      if (record.metadata) {
        for (const tag of record.metadata.tags) {
          tags.add(tag)
        }
      }
    }

    return { success: true as const, tags: Array.from(tags).sort() }
  },
)
