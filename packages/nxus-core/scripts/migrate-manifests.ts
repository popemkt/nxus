/**
 * migrate-manifests.ts - One-time migration from manifest.json files to SQLite
 *
 * Usage: npx tsx scripts/migrate-manifests.ts
 *
 * Reads all manifest.json files from src/data/apps/ and inserts them into
 * the apps and commands tables. Run this once to populate the database
 * from existing manifests.
 */

import { eq } from 'drizzle-orm'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { getDatabase, initDatabase, saveMasterDatabase } from '../src/db/client'
import { itemCommands, items } from '../src/db/schema'
import { ItemSchema } from '../src/types/item'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const appsDir = resolve(__dirname, '../src/data/apps')

/**
 * Pass raw objects to Drizzle; the custom json() type handles stringification.
 */
function toRawOrNull(value: unknown): any {
  return value ?? null
}

async function migrate() {
  console.log('\n' + '='.repeat(50))
  console.log('  DB Migrate: Manifests → Database')
  console.log('='.repeat(50) + '\n')

  console.log('[1/2] Initializing database...')
  initDatabase()
  const db = getDatabase()

  // Get all app directories
  const appDirs = readdirSync(appsDir).filter((name) => {
    const fullPath = join(appsDir, name)
    return (
      statSync(fullPath).isDirectory() &&
      existsSync(join(fullPath, 'manifest.json'))
    )
  })

  console.log(`[2/2] Processing ${appDirs.length} app manifests...\n`)

  let appsCount = 0
  let commandsCount = 0
  const validationErrors: { app: string; errors: string[] }[] = []

  for (const appDir of appDirs) {
    const manifestPath = join(appsDir, appDir, 'manifest.json')
    console.log(`Processing ${appDir}...`)

    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

      // Validate full manifest against schema
      const validationResult = ItemSchema.safeParse(manifest)
      if (!validationResult.success) {
        const errors = validationResult.error.issues.map(
          (issue) => `  - ${issue.path.join('.')}: ${issue.message}`,
        )
        validationErrors.push({ app: appDir, errors })
        console.log(`  ⚠ Validation errors:`)
        errors.forEach((e) => console.log(e))
        console.log(`  Skipping ${appDir}...`)
        continue
      }

      const validatedManifest = validationResult.data

      // Extract commands from manifest
      const appCommands = validatedManifest.commands || []

      // Prepare app record
      const appRecord = {
        id: validatedManifest.id,
        name: validatedManifest.name,
        description: validatedManifest.description || '',
        type: validatedManifest.type,
        path: validatedManifest.path,
        homepage: validatedManifest.homepage || null,
        thumbnail: validatedManifest.thumbnail || null,
        platform: toRawOrNull((validatedManifest as any).platform),
        docs: toRawOrNull(validatedManifest.docs),
        dependencies: toRawOrNull(validatedManifest.dependencies),
        metadata: toRawOrNull(validatedManifest.metadata),
        installConfig: toRawOrNull(validatedManifest.installConfig),
        checkCommand: (validatedManifest as any).checkCommand || null,
        installInstructions:
          (validatedManifest as any).installInstructions || null,
        configSchema: toRawOrNull((validatedManifest as any).configSchema),
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
        console.log(`  ↻ Updated app: ${appRecord.id}`)
      } else {
        db.insert(items).values(appRecord).run()
        console.log(`  + Inserted app: ${appRecord.id}`)
      }
      appsCount++

      // Insert commands
      for (const cmd of appCommands) {
        const commandId = `${validatedManifest.id}:${cmd.id}`
        const commandRecord = {
          id: commandId,
          appId: validatedManifest.id,
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
          platforms: toRawOrNull(cmd.platforms),
          requires: toRawOrNull(cmd.requires),
          createdAt: new Date(),
          updatedAt: new Date(),
        }

        // Upsert command
        const existingCmd = db
          .select()
          .from(itemCommands)
          .where(eq(itemCommands.id, commandId))
          .get()

        if (existingCmd) {
          db.update(itemCommands)
            .set({ ...commandRecord, updatedAt: new Date() })
            .where(eq(itemCommands.id, commandId))
            .run()
        } else {
          db.insert(itemCommands).values(commandRecord).run()
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

  // Report validation errors summary
  if (validationErrors.length > 0) {
    console.log('\n' + '='.repeat(50))
    console.log(
      `⚠️  ${validationErrors.length} app(s) had validation warnings:`,
    )
    for (const { app, errors } of validationErrors) {
      console.log(`\n   ${app}:`)
      errors.forEach((e) => console.log(`   ${e}`))
    }
    console.log('\n   Fix these manifests to match the schema.')
  }

  console.log('\nNext steps:')
  console.log('  1. Run: npm run db:export')
  console.log('  2. Commit the generated JSON files')
}

migrate().catch(console.error)
