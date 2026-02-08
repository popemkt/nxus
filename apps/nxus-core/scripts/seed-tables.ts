/**
 * seed-tables.ts - Seed legacy relational tables from manifest.json files
 *
 * Seeds nxus.db from individual manifest.json files in src/data/apps/
 * and tags/inbox from src/data/.
 * Uses upsert strategy: insert if new, update if existing, never delete.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ItemSchema,
  eq,

  getDatabase,
  inbox,
  initDatabase,
  itemCommands,
  itemTags,
  items,
  saveMasterDatabase,
  tagSchemas,
  tags
 } from '@nxus/db/server'
import type {TagRef} from '@nxus/db/server';
import { SYSTEM_TAGS } from '../src/lib/system-tags'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = resolve(__dirname, '../src/data')
const appsDir = resolve(dataDir, 'apps')

/**
 * Convert timestamp to Date object
 */
function parseTimestamp(value: unknown): Date {
  if (value instanceof Date) return value
  if (typeof value === 'string') {
    const date = new Date(value)
    if (!isNaN(date.getTime())) return date
  }
  return new Date()
}

/**
 * Load JSON file if it exists
 */
function loadJsonFile<T>(filepath: string): T | null {
  if (!existsSync(filepath)) {
    return null
  }
  return JSON.parse(readFileSync(filepath, 'utf-8'))
}

export async function seedTables() {
  console.log('\n' + '='.repeat(50))
  console.log('  DB Seed: JSON → Tables')
  console.log('='.repeat(50) + '\n')

  console.log('[1/5] Initializing database...')
  initDatabase()
  const db = getDatabase()

  let appsCount = 0
  let commandsCount = 0

  // Seed apps from individual manifest.json files
  console.log('[2/5] Seeding apps from manifests...')

  // Get all app directories
  const appDirs = readdirSync(appsDir).filter((name) => {
    const fullPath = join(appsDir, name)
    return (
      statSync(fullPath).isDirectory() &&
      existsSync(join(fullPath, 'manifest.json'))
    )
  })

  for (const appDir of appDirs) {
    const manifestPath = join(appsDir, appDir, 'manifest.json')
    const manifest = loadJsonFile<Record<string, unknown>>(manifestPath)

    if (!manifest) continue

    // Validate manifest against schema
    const validationResult = ItemSchema.safeParse(manifest)
    if (!validationResult.success) {
      console.error(`\n❌ Validation failed for ${appDir}:`)
      console.error(validationResult.error.format())
      console.error(`Skipping ${appDir}...\n`)
      continue
    }

    const validatedManifest = validationResult.data

    // Extract commands from manifest
    const appCommands = validatedManifest.commands || []

    // Prepare app record
    // Extract tags from manifest metadata for junction table
    const manifestTags: Array<TagRef> = validatedManifest.metadata?.tags ?? []

    // Note: JSON fields (platform, docs, etc.) auto-stringify via schema's json() column
    // Tags are now stored in junction table, NOT in metadata JSON
    const appRecord = {
      id: validatedManifest.id,
      name: validatedManifest.name,
      description: validatedManifest.description || '',
      type: validatedManifest.type,
      path: validatedManifest.path,
      homepage: validatedManifest.homepage || null,
      thumbnail: validatedManifest.thumbnail || null,
      platform: (validatedManifest as any).platform ?? null,
      docs: validatedManifest.docs ?? null,
      dependencies: validatedManifest.dependencies ?? null,
      metadata: {
        category: validatedManifest.metadata?.category ?? 'uncategorized',
        createdAt: validatedManifest.metadata?.createdAt ?? '',
        updatedAt: validatedManifest.metadata?.updatedAt ?? '',
        version: validatedManifest.metadata?.version,
        author: validatedManifest.metadata?.author,
        license: validatedManifest.metadata?.license,
      },
      installConfig: validatedManifest.installConfig ?? null,
      checkCommand: (validatedManifest as any).checkCommand || null,
      installInstructions:
        (validatedManifest as any).installInstructions || null,
      configSchema: (validatedManifest as any).configSchema ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any

    // Upsert app
    const existingApp = db
      .select()
      .from(items)
      .where(eq(items.id, appRecord.id))
      .get()

    if (existingApp) {
      db.update(items)
        .set({ ...appRecord, updatedAt: new Date() })
        .where(eq(items.id, appRecord.id))
        .run()
    } else {
      db.insert(items).values(appRecord).run()
    }
    appsCount++

    // Upsert app_tags junction table - delete existing and insert new
    // This ensures tags from manifest.metadata.tags are synced to junction table
    db.delete(itemTags).where(eq(itemTags.appId, appRecord.id)).run()
    for (const tag of manifestTags) {
      db.insert(itemTags).values({ appId: appRecord.id, tagId: tag.id }).run()
    }

    // Upsert commands - track which command IDs are in the manifest
    const manifestCommandIds = new Set<string>()

    for (const cmd of appCommands) {
      const commandId = `${validatedManifest.id}:${cmd.id}`
      manifestCommandIds.add(commandId)

      // Note: JSON fields (platforms, requires, options) auto-stringify via schema's json() column
      const commandRecord = {
        id: commandId,
        appId: validatedManifest.id,
        commandId: cmd.id as string,
        name: cmd.name as string,
        description: (cmd.description as string) || null,
        icon: cmd.icon as string,
        category: cmd.category as string,
        target: cmd.target as string,
        mode: (cmd.mode as string) || 'execute',
        command: (cmd as any).command ?? '',
        workflow: (cmd as any).workflow ?? null,
        scriptSource: (cmd as any).scriptSource ?? null,
        cwd: (cmd as any).cwd ?? null,
        platforms: (cmd as any).platforms ?? null,
        requires: (cmd as any).requires ?? null,
        options: (cmd as any).options ?? null,
        requirements: (cmd as any).requirements ?? null,
        params: (cmd as any).params ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const existingCmd = db
        .select()
        .from(itemCommands)
        .where(eq(itemCommands.id, commandId))
        .get()

      if (existingCmd) {
        // Restore if soft-deleted, and update
        db.update(itemCommands)
          .set({ ...commandRecord, deletedAt: null, updatedAt: new Date() })
          .where(eq(itemCommands.id, commandId))
          .run()
      } else {
        db.insert(itemCommands).values(commandRecord).run()
      }
      commandsCount++
    }

    // Soft delete commands that exist in DB but not in manifest
    const dbCommands = db
      .select()
      .from(itemCommands)
      .where(eq(itemCommands.appId, validatedManifest.id))
      .all()

    for (const dbCmd of dbCommands) {
      if (!manifestCommandIds.has(dbCmd.id) && !dbCmd.deletedAt) {
        db.update(itemCommands)
          .set({ deletedAt: new Date(), updatedAt: new Date() })
          .where(eq(itemCommands.id, dbCmd.id))
          .run()
        console.log(`    Soft-deleted orphaned command: ${dbCmd.id}`)
      }
    }
  }

  console.log(`  Upserted ${appsCount} apps, ${commandsCount} commands`)

  // Seed tags
  console.log('[3/5] Seeding tags...')
  const tagsData = loadJsonFile<{ tags: Array<Record<string, unknown>> }>(
    resolve(dataDir, 'tags.json'),
  )
  let tagsCount = 0

  if (tagsData?.tags) {
    for (const tag of tagsData.tags) {
      const tagId = tag.id as number
      const tagRecord = {
        id: tagId,
        name: tag.name as string,
        parentId: (tag.parentId as number | null) ?? null,
        order: (tag.order as number) ?? 0,
        color: (tag.color as string | null) ?? null,
        icon: (tag.icon as string | null) ?? null,
        createdAt: parseTimestamp(tag.createdAt) ?? new Date(),
        updatedAt: parseTimestamp(tag.updatedAt) ?? new Date(),
      }

      const existing = db.select().from(tags).where(eq(tags.id, tagId)).get()

      if (existing) {
        db.update(tags).set(tagRecord).where(eq(tags.id, tagId)).run()
      } else {
        db.insert(tags).values(tagRecord).run()
      }
      tagsCount++
    }
    console.log(`  Upserted ${tagsCount} tags`)
  } else {
    console.log('  ⚠️  tags.json not found, skipping')
  }

  // Seed tag schemas for configurable system tags
  console.log('[4/5] Seeding tag schemas...')
  let tagSchemasCount = 0

  for (const systemTag of Object.values(SYSTEM_TAGS)) {
    if (systemTag.configurable && systemTag.schema) {
      const existing = db
        .select()
        .from(tagSchemas)
        .where(eq(tagSchemas.tagId, systemTag.id))
        .get()

      if (existing) {
        db.update(tagSchemas)
          .set({
            schema: systemTag.schema,
            description: systemTag.description,
            updatedAt: new Date(),
          })
          .where(eq(tagSchemas.tagId, systemTag.id))
          .run()
      } else {
        db.insert(tagSchemas)
          .values({
            tagId: systemTag.id,
            schema: systemTag.schema,
            description: systemTag.description,
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .run()
      }
      tagSchemasCount++
    }
  }
  console.log(`  Upserted ${tagSchemasCount} tag schemas`)

  // Seed inbox
  console.log('[5/5] Seeding inbox items...')
  const inboxData = loadJsonFile<{ items: Array<Record<string, unknown>> }>(
    resolve(dataDir, 'inbox.json'),
  )
  let inboxCount = 0

  if (inboxData?.items) {
    for (const item of inboxData.items) {
      const itemRecord = {
        ...item,
        createdAt: parseTimestamp(item.createdAt),
        updatedAt: parseTimestamp(item.updatedAt),
      }

      if (item.id) {
        const existing = db
          .select()
          .from(inbox)
          .where(eq(inbox.id, item.id as number))
          .get()

        if (existing) {
          db.update(inbox)
            .set(itemRecord)
            .where(eq(inbox.id, item.id as number))
            .run()
        } else {
          db.insert(inbox)
            .values(itemRecord as typeof inbox.$inferInsert)
            .run()
        }
        inboxCount++
      }
    }
    console.log(`  Upserted ${inboxCount} inbox items`)
  } else {
    console.log('  ⚠️  inbox.json not found, skipping')
  }

  // Save the database
  saveMasterDatabase()

  console.log('\n' + '='.repeat(50))
  console.log('✅ Tables seed complete!')
  console.log(`   Apps: ${appsCount}, Commands: ${commandsCount}`)
  console.log(`   Tags: ${tagsCount}, Tag Schemas: ${tagSchemasCount}, Inbox: ${inboxCount}`)
  console.log('='.repeat(50) + '\n')
}
