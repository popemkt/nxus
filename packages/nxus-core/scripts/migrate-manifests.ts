/**
 * migrate-manifests.ts - One-time migration from manifest.json files to SQLite
 *
 * Usage: npx tsx scripts/migrate-manifests.ts
 *
 * Reads all manifest.json files from src/data/apps/ and inserts them into
 * the items, item_types, and item_commands tables. Run this once to populate
 * the database from existing manifests.
 *
 * Supports both legacy single-type format and new multi-type format:
 * - Legacy: { "type": "tool" } → converted to { "types": ["tool"], "primaryType": "tool" }
 * - New: { "types": ["tool", "remote-repo"], "primaryType": "tool" }
 *
 * The migration populates the item_types junction table for multi-type support.
 */

import { eq } from '@nxus/db/server'
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  getDatabase,
  initDatabase,
  saveMasterDatabase,
  itemCommands,
  items,
  itemTypes,
  ItemSchema,
} from '@nxus/db/server'
import type { ItemType } from '@nxus/db'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const appsDir = resolve(__dirname, '../src/data/apps')

/**
 * Pass raw objects to Drizzle; the custom json() type handles stringification.
 */
function toRawOrNull(value: unknown): any {
  return value ?? null
}

/**
 * Normalize manifest type fields to multi-type format.
 * Handles both old format (type: "tool") and new format (types: ["tool", "repo"]).
 *
 * @param manifest - Raw manifest object from JSON
 * @returns Object with normalized types array, primaryType, and type fields
 */
function normalizeManifestTypes(manifest: Record<string, unknown>): {
  types: ItemType[]
  primaryType: ItemType
  type: ItemType
} {
  const rawTypes = manifest.types as ItemType[] | undefined
  const rawType = manifest.type as ItemType | undefined
  const rawPrimaryType = manifest.primaryType as ItemType | undefined

  // Determine types array
  let types: ItemType[]
  if (rawTypes && Array.isArray(rawTypes) && rawTypes.length > 0) {
    // New format: types array provided
    types = rawTypes
  } else if (rawType) {
    // Old format: single type, convert to array
    types = [rawType]
  } else {
    // Fallback - shouldn't happen with valid manifests
    throw new Error('Manifest must have either "type" or "types" field')
  }

  // Determine primary type
  let primaryType: ItemType
  if (rawPrimaryType && types.includes(rawPrimaryType)) {
    // Explicit primaryType provided and is valid
    primaryType = rawPrimaryType
  } else {
    // Use first type as primary
    primaryType = types[0]
  }

  return {
    types,
    primaryType,
    type: primaryType, // Deprecated alias
  }
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
      const rawManifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

      // Normalize type fields (old single-type to new multi-type format)
      let normalizedTypes: { types: ItemType[]; primaryType: ItemType; type: ItemType }
      try {
        normalizedTypes = normalizeManifestTypes(rawManifest)
      } catch (err) {
        validationErrors.push({
          app: appDir,
          errors: [`  - ${(err as Error).message}`],
        })
        console.log(`  ⚠ Type normalization error: ${(err as Error).message}`)
        console.log(`  Skipping ${appDir}...`)
        continue
      }

      // Merge normalized types into manifest for validation
      const manifest = {
        ...rawManifest,
        types: normalizedTypes.types,
        primaryType: normalizedTypes.primaryType,
        type: normalizedTypes.type,
      }

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

      // Prepare app record (using primaryType for backward-compatible type field)
      const appRecord = {
        id: validatedManifest.id,
        name: validatedManifest.name,
        description: validatedManifest.description || '',
        type: validatedManifest.primaryType, // Use primaryType for backward compat
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

      // Populate itemTypes junction table for multi-type support
      // First, delete existing types for this item (clean slate)
      db.delete(itemTypes).where(eq(itemTypes.itemId, validatedManifest.id)).run()

      // Insert all types from the types array
      const typesArray = validatedManifest.types
      for (let i = 0; i < typesArray.length; i++) {
        const itemType = typesArray[i]
        const isPrimary = itemType === validatedManifest.primaryType
        db.insert(itemTypes)
          .values({
            itemId: validatedManifest.id,
            type: itemType,
            isPrimary,
            order: i,
          })
          .run()
      }
      if (typesArray.length > 1) {
        console.log(`    Types: ${typesArray.join(', ')} (primary: ${validatedManifest.primaryType})`)
      }

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
          command: (cmd as any).command ?? null,
          workflow: toRawOrNull((cmd as any).workflow),
          scriptSource: (cmd as any).scriptSource || null,
          cwd: (cmd as any).cwd || null,
          platforms: toRawOrNull(cmd.platforms),
          requires: toRawOrNull(cmd.requires),
          options: toRawOrNull((cmd as any).options),
          requirements: toRawOrNull((cmd as any).requirements),
          params: toRawOrNull((cmd as any).params),
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
