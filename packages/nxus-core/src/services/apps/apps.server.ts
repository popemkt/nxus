/**
 * apps.server.ts - Server functions for loading apps from SQLite
 *
 * Provides server-side access to the apps and commands tables.
 * Supports gradual migration to node-based architecture via feature toggle.
 */

import { createServerFn } from '@tanstack/react-start'
import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import {
  isGraphArchitecture,
  isNodeArchitecture,
} from '../../config/feature-flags'
import { getDatabase, initDatabase } from '../../db/client'
import { itemCommands, items, itemTags, tags } from '../../db/schema'
import type {
  DocEntry,
  Item,
  ItemCommand,
  ItemMetadata,
  TagRef,
} from '../../types/item'
import { getAllItemsFromNodesServerFn } from '../nodes/nodes.server'

/**
 * Map database record to App type
 * JSON fields are now auto-parsed by the schema's json() column type
 *
 * IMPORTANT: This is the data boundary - we ensure metadata shape here
 * so downstream code never needs defensive checks
 *
 * @param record - Database record from apps table
 * @param tagsFromJunction - Tags queried from app_tags junction table (single source of truth)
 */
function parseAppRecord(
  record: typeof items.$inferSelect,
  tagsFromJunction: TagRef[] = [],
): Item {
  // Ensure metadata has proper defaults - this is the type-safe boundary
  // Tags now come from junction table, not from stored JSON
  const rawMetadata = record.metadata as Partial<ItemMetadata> | undefined
  const metadata: ItemMetadata = {
    tags: tagsFromJunction, // From junction table, NOT from metadata JSON
    category: rawMetadata?.category ?? 'uncategorized',
    createdAt: rawMetadata?.createdAt ?? '',
    updatedAt: rawMetadata?.updatedAt ?? '',
    version: rawMetadata?.version,
    author: rawMetadata?.author,
    license: rawMetadata?.license,
  }

  // Robust helper to ensure we always have an array for array-typed fields
  const ensureArray = <T>(val: any): T[] | undefined =>
    Array.isArray(val) ? (val as T[]) : undefined

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    type: record.type as Item['type'],
    path: record.path,
    homepage: record.homepage ?? undefined,
    thumbnail: record.thumbnail ?? undefined,
    platform: ensureArray<string>(record.platform) as any,
    docs: ensureArray<DocEntry>(record.docs) as any,
    dependencies: ensureArray<string>(record.dependencies) as any,
    metadata, // Now guaranteed to have proper shape
    installConfig: record.installConfig as Item['installConfig'],
    checkCommand: record.checkCommand ?? undefined,
    installInstructions: record.installInstructions ?? undefined,
    configSchema: record.configSchema ?? undefined,
    status: 'not-installed', // Runtime status, not stored
    commands: [], // Will be populated separately
  } as Item
}

/**
 * Map command record to AppCommand type
 * JSON fields are now auto-parsed by the schema's json() column type
 */
function parseCommandRecord(
  record: typeof itemCommands.$inferSelect,
): ItemCommand {
  return {
    id: record.commandId, // Use local command ID, not global
    name: record.name,
    description: record.description ?? undefined,
    icon: record.icon,
    category: record.category,
    target: record.target as ItemCommand['target'],
    mode: record.mode as ItemCommand['mode'],
    command: record.command,
    scriptSource:
      (record.scriptSource as ItemCommand['scriptSource']) ?? undefined,
    cwd: record.cwd ?? undefined,
    platforms: (record.platforms as ItemCommand['platforms']) ?? undefined,
    requires: record.requires ?? undefined,
    options: record.options ?? undefined,
  }
}

/**
 * Get all apps from SQLite database
 * Uses node-based queries when NODE_BASED_ARCHITECTURE_ENABLED is true
 */
export const getAllAppsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    // Architecture switch
    if (isGraphArchitecture()) {
      console.log('[getAllAppsServerFn] Using graph architecture (SurrealDB)')
      const { getAllItemsFromGraphServerFn } = await import(
        '../graph/graph.server'
      )
      const result = await getAllItemsFromGraphServerFn()
      if (result.success) {
        return { success: true as const, apps: result.items }
      }
      return {
        success: false as const,
        error: result.error || 'Graph query failed',
      }
    }

    if (isNodeArchitecture()) {
      console.log('[getAllAppsServerFn] Using node-based architecture')
      const result = await getAllItemsFromNodesServerFn()
      if (result.success) {
        return { success: true as const, apps: result.items }
      }
      return { success: false as const, error: 'Node query failed' }
    }

    // Legacy: query from items table
    initDatabase()
    const db = getDatabase()

    // Get all apps
    const appRecords = db.select().from(items).all()

    // Get all active commands (not soft-deleted) grouped by app
    const commandRecords = db
      .select()
      .from(itemCommands)
      .where(isNull(itemCommands.deletedAt))
      .all()
    const commandsByApp = new Map<string, ItemCommand[]>()

    for (const cmd of commandRecords) {
      const appCommands = commandsByApp.get(cmd.appId) ?? []
      appCommands.push(parseCommandRecord(cmd))
      commandsByApp.set(cmd.appId, appCommands)
    }

    // Query tags from junction table - this is now the single source of truth
    const appTagRecords = db
      .select({
        appId: itemTags.appId,
        tagId: tags.id,
        tagName: tags.name,
      })
      .from(itemTags)
      .innerJoin(tags, eq(itemTags.tagId, tags.id))
      .all()

    // Group tags by appId
    const tagsByApp = new Map<string, Array<{ id: number; name: string }>>()
    for (const r of appTagRecords) {
      const arr = tagsByApp.get(r.appId) ?? []
      arr.push({ id: r.tagId, name: r.tagName })
      tagsByApp.set(r.appId, arr)
    }

    // Parse and assemble apps with their commands and tags
    const parsedApps = appRecords.map((record) => {
      const app = parseAppRecord(record, tagsByApp.get(record.id) ?? [])
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
 * Tags are queried from junction table
 */
export const getAppByIdServerFn = createServerFn({ method: 'GET' })
  .inputValidator(GetAppByIdSchema)
  .handler(async (ctx) => {
    const { id } = ctx.data

    initDatabase()
    const db = getDatabase()

    // Get app
    const appRecord = db.select().from(items).where(eq(items.id, id)).get()

    if (!appRecord) {
      return { success: false as const, error: `App ${id} not found` }
    }

    // Get active commands for this app (not soft-deleted)
    const commandRecords = db
      .select()
      .from(itemCommands)
      .where(and(eq(itemCommands.appId, id), isNull(itemCommands.deletedAt)))
      .all()

    // Query tags from junction table
    const appTagRecords = db
      .select({ tagId: tags.id, tagName: tags.name })
      .from(itemTags)
      .innerJoin(tags, eq(itemTags.tagId, tags.id))
      .where(eq(itemTags.appId, id))
      .all()

    const tagRefs = appTagRecords.map((r) => ({ id: r.tagId, name: r.tagName }))

    const app = parseAppRecord(appRecord, tagRefs)
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

    const appRecords = db.select().from(items).all()

    const categories = new Set<string>()
    for (const record of appRecords) {
      const metadata = record.metadata as ItemMetadata | undefined
      if (metadata?.category) {
        categories.add(metadata.category)
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

    const appRecords = db.select().from(items).all()

    const allTags = new Set<string>()
    for (const record of appRecords) {
      const metadata = record.metadata as ItemMetadata | undefined
      if (metadata?.tags) {
        for (const tag of metadata.tags) {
          allTags.add(tag.name)
        }
      }
    }

    return { success: true as const, tags: Array.from(allTags).sort() }
  },
)
