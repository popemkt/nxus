/**
 * db-seed.ts - Seed SQLite from individual manifest.json files
 *
 * Usage: npx tsx scripts/db-seed.ts
 *
 * Seeds nxus.db from individual manifest.json files in src/data/apps/
 * and tags/inbox from src/data/seed/.
 * Uses upsert strategy: insert if new, update if existing, never delete.
 */

import { readFileSync, existsSync, readdirSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { initDatabase, getDatabase, saveMasterDatabase } from '../src/db/client'
import { apps, commands, tags, inboxItems } from '../src/db/schema'
import { eq } from 'drizzle-orm'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = resolve(__dirname, '../src/data')
const appsDir = resolve(dataDir, 'apps')

/**
 * Stringify value to JSON if not already a string
 */
function stringifyIfNeeded(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

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

async function seed() {
  console.log('Initializing database...')
  await initDatabase()
  const db = getDatabase()

  let appsCount = 0
  let commandsCount = 0

  // Seed apps from individual manifest.json files
  console.log('Seeding apps from manifests...')

  // Get all app directories
  const appDirs = readdirSync(appsDir).filter((name) => {
    const fullPath = join(appsDir, name)
    return (
      statSync(fullPath).isDirectory() &&
      !name.startsWith('_') &&
      existsSync(join(fullPath, 'manifest.json'))
    )
  })

  for (const appDir of appDirs) {
    const manifestPath = join(appsDir, appDir, 'manifest.json')
    const manifest = loadJsonFile<Record<string, unknown>>(manifestPath)

    if (!manifest) continue

    // Extract commands from manifest
    const appCommands = (manifest.commands as Record<string, unknown>[]) || []

    // Prepare app record
    const appRecord = {
      id: manifest.id as string,
      name: manifest.name as string,
      description: (manifest.description as string) || '',
      type: manifest.type as string,
      path: manifest.path as string,
      homepage: (manifest.homepage as string) || null,
      thumbnail: (manifest.thumbnail as string) || null,
      platform: stringifyIfNeeded(manifest.platform),
      docs: stringifyIfNeeded(manifest.docs),
      dependencies: stringifyIfNeeded(manifest.dependencies),
      metadata: stringifyIfNeeded(manifest.metadata),
      installConfig: stringifyIfNeeded(manifest.installConfig),
      checkCommand: (manifest.checkCommand as string) || null,
      installInstructions: (manifest.installInstructions as string) || null,
      configSchema: stringifyIfNeeded(manifest.configSchema),
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Upsert app
    const existingApp = db
      .select()
      .from(apps)
      .where(eq(apps.id, appRecord.id))
      .get()

    if (existingApp) {
      db.update(apps)
        .set({ ...appRecord, updatedAt: new Date() })
        .where(eq(apps.id, appRecord.id))
        .run()
    } else {
      db.insert(apps).values(appRecord).run()
    }
    appsCount++

    // Upsert commands
    for (const cmd of appCommands) {
      const commandId = `${manifest.id}:${cmd.id}`
      const commandRecord = {
        id: commandId,
        appId: manifest.id as string,
        commandId: cmd.id as string,
        name: cmd.name as string,
        description: (cmd.description as string) || null,
        icon: cmd.icon as string,
        category: cmd.category as string,
        target: cmd.target as string,
        mode: (cmd.mode as string) || 'execute',
        command: cmd.command as string,
        scriptSource: (cmd.scriptSource as string) || null,
        cwd: (cmd.cwd as string) || null,
        platforms: stringifyIfNeeded(cmd.platforms),
        requires: stringifyIfNeeded(cmd.requires),
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const existingCmd = db
        .select()
        .from(commands)
        .where(eq(commands.id, commandId))
        .get()

      if (existingCmd) {
        db.update(commands)
          .set({ ...commandRecord, updatedAt: new Date() })
          .where(eq(commands.id, commandId))
          .run()
      } else {
        db.insert(commands).values(commandRecord).run()
      }
      commandsCount++
    }
  }

  console.log(`  Upserted ${appsCount} apps, ${commandsCount} commands`)

  // Seed tags
  console.log('Seeding tags...')
  const tagsData = loadJsonFile<{ tags: Record<string, unknown>[] }>(
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
        createdAt: new Date(),
        updatedAt: new Date(),
      }

      const existing = db.select().from(tags).where(eq(tags.id, tagId)).get()

      if (existing) {
        db.update(tags)
          .set({ ...tagRecord, updatedAt: new Date() })
          .where(eq(tags.id, tagId))
          .run()
      } else {
        db.insert(tags).values(tagRecord).run()
      }
      tagsCount++
    }
    console.log(`  Upserted ${tagsCount} tags`)
  } else {
    console.log('  ⚠️  tags.json not found, skipping')
  }

  // Seed inbox
  console.log('Seeding inbox items...')
  const inboxData = loadJsonFile<{ items: Record<string, unknown>[] }>(
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
          .from(inboxItems)
          .where(eq(inboxItems.id, item.id as number))
          .get()

        if (existing) {
          db.update(inboxItems)
            .set({ ...itemRecord, updatedAt: new Date() })
            .where(eq(inboxItems.id, item.id as number))
            .run()
        } else {
          db.insert(inboxItems)
            .values(itemRecord as typeof inboxItems.$inferInsert)
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

  console.log('\n✅ Seed complete!')
  console.log(`   Apps: ${appsCount}, Commands: ${commandsCount}`)
  console.log(`   Tags: ${tagsCount}, Inbox: ${inboxCount}`)
}

seed().catch(console.error)
