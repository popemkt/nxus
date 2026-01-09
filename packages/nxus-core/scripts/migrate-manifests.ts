/**
 * migrate-manifests.ts - One-time migration from manifest.json files to SQLite
 *
 * Usage: npx tsx scripts/migrate-manifests.ts
 *
 * Reads all manifest.json files from src/data/apps/ and inserts them into
 * the apps and commands tables. Run this once to populate the database
 * from existing manifests.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { initDatabase, getDatabase, saveMasterDatabase } from '../src/db/client'
import { apps, commands } from '../src/db/schema'
import { eq } from 'drizzle-orm'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const appsDir = resolve(__dirname, '../src/data/apps')

/**
 * Stringify JSON fields for database storage
 */
function stringifyIfNeeded(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'string') return value
  return JSON.stringify(value)
}

async function migrate() {
  console.log('Initializing database...')
  await initDatabase()
  const db = getDatabase()

  // Get all app directories
  const appDirs = readdirSync(appsDir).filter((name) => {
    const fullPath = join(appsDir, name)
    return (
      statSync(fullPath).isDirectory() &&
      !name.startsWith('_') &&
      existsSync(join(fullPath, 'manifest.json'))
    )
  })

  console.log(`Found ${appDirs.length} app manifests to migrate\n`)

  let appsCount = 0
  let commandsCount = 0

  for (const appDir of appDirs) {
    const manifestPath = join(appsDir, appDir, 'manifest.json')
    console.log(`Processing ${appDir}...`)

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

      // Extract commands from manifest
      const appCommands = manifest.commands || []
      delete manifest.commands // Remove from app record
      delete manifest.status // Runtime status, not stored

      // Prepare app record
      const appRecord = {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description || '',
        type: manifest.type,
        path: manifest.path,
        homepage: manifest.homepage || null,
        thumbnail: manifest.thumbnail || null,
        platform: stringifyIfNeeded(manifest.platform),
        docs: stringifyIfNeeded(manifest.docs),
        dependencies: stringifyIfNeeded(manifest.dependencies),
        metadata: stringifyIfNeeded(manifest.metadata),
        installConfig: stringifyIfNeeded(manifest.installConfig),
        checkCommand: manifest.checkCommand || null,
        installInstructions: manifest.installInstructions || null,
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
        console.log(`  ↻ Updated app: ${appRecord.id}`)
      } else {
        db.insert(apps).values(appRecord).run()
        console.log(`  + Inserted app: ${appRecord.id}`)
      }
      appsCount++

      // Insert commands
      for (const cmd of appCommands) {
        const commandId = `${manifest.id}:${cmd.id}`
        const commandRecord = {
          id: commandId,
          appId: manifest.id,
          commandId: cmd.id,
          name: cmd.name,
          description: cmd.description || null,
          icon: cmd.icon,
          category: cmd.category,
          target: cmd.target,
          mode: cmd.mode || 'execute',
          command: cmd.command,
          scriptSource: cmd.scriptSource || null,
          cwd: cmd.cwd || null,
          platforms: stringifyIfNeeded(cmd.platforms),
          requires: stringifyIfNeeded(cmd.requires),
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        // Upsert command
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

      if (appCommands.length > 0) {
        console.log(`    Commands: ${appCommands.length}`)
      }
    } catch (error) {
      console.error(`  ❌ Error processing ${appDir}:`, error)
    }
  }

  // Save the database
  saveMasterDatabase()

  console.log('\n' + '='.repeat(50))
  console.log(`✅ Migration complete!`)
  console.log(`   Apps migrated: ${appsCount}`)
  console.log(`   Commands migrated: ${commandsCount}`)
  console.log('\nNext steps:')
  console.log('  1. Run: npm run db:export')
  console.log('  2. Commit the generated JSON files')
}

migrate().catch(console.error)
