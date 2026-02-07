/**
 * db-export.ts - Export SQLite data to individual manifest.json files
 *
 * Usage: npx tsx scripts/db-export.ts
 *
 * Exports apps and commands from nxus.db to individual manifest.json files
 * in src/data/apps/{appId}/ for version control and AI discovery.
 * Also exports tags and inbox to seed folder.
 */

import { eq, isNull } from '@nxus/db/server'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import {
  getDatabase,
  initDatabase,
  inbox,
  itemCommands,
  items,
  itemTags,
  tags,
} from '@nxus/db/server'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = resolve(__dirname, '../src/data')
const appsDir = resolve(dataDir, 'apps')

/**
 * Parse JSON fields from database records
 * Handles both:
 * - Raw strings (legacy/manual queries)
 * - Already-parsed objects (from Drizzle json() column)
 */
function parseJsonField<T>(value: unknown): T | undefined {
  if (value === null || value === undefined) return undefined

  // If it's already an object/array, return it directly
  if (typeof value === 'object') {
    return value as T
  }

  // If it's a string, try to parse it
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T
    } catch {
      return undefined
    }
  }

  return undefined
}

async function exportData() {
  console.log('\n' + '='.repeat(50))
  console.log('  DB Export: Database → JSON')
  console.log('='.repeat(50) + '\n')

  console.log('[1/3] Initializing database...')
  initDatabase()
  const db = getDatabase()

  // Export apps to individual manifest.json files
  console.log('[2/3] Exporting apps to individual manifests...')
  const allApps = db.select().from(items).all()
  // Only export active commands (not soft-deleted)
  const allCommands = db
    .select()
    .from(itemCommands)
    .where(isNull(itemCommands.deletedAt))
    .all()

  // Group commands by app
  const commandsByApp = new Map<string, (typeof allCommands)[0][]>()
  for (const cmd of allCommands) {
    const appCommands = commandsByApp.get(cmd.appId) ?? []
    appCommands.push(cmd)
    commandsByApp.set(cmd.appId, appCommands)
  }

  // Query tags for all apps from junction table
  console.log('  Querying tags from junction table...')
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

  let appsExported = 0
  for (const app of allApps) {
    const appDir = resolve(appsDir, app.id)

    // Ensure app directory exists
    if (!existsSync(appDir)) {
      mkdirSync(appDir, { recursive: true })
    }

    // Build manifest object
    const appCommands = commandsByApp.get(app.id) ?? []
    const manifest: Record<string, unknown> = {
      id: app.id,
      name: app.name,
      description: app.description,
      type: app.type,
      path: app.path,
    }

    // Add optional fields
    if (app.homepage) manifest.homepage = app.homepage
    if (app.thumbnail) manifest.thumbnail = app.thumbnail

    // Add platform for tools
    const platform = parseJsonField<string[]>(app.platform)
    if (platform) manifest.platform = platform

    // Add check command for tools
    if (app.checkCommand) manifest.checkCommand = app.checkCommand
    if (app.installInstructions)
      manifest.installInstructions = app.installInstructions

    // Add commands (converted back to manifest format)
    if (appCommands.length > 0) {
      manifest.commands = appCommands.map((cmd) => ({
        id: cmd.commandId, // Use local ID, not global
        name: cmd.name,
        description: cmd.description ?? undefined,
        icon: cmd.icon,
        category: cmd.category,
        target: cmd.target,
        mode: cmd.mode,
        ...(cmd.command && { command: cmd.command }),
        ...(cmd.workflow && { workflow: parseJsonField(cmd.workflow) }),
        ...(cmd.scriptSource && { scriptSource: cmd.scriptSource }),
        ...(cmd.cwd && { cwd: cmd.cwd }),
        ...(cmd.platforms && { platforms: parseJsonField(cmd.platforms) }),
        ...(cmd.requires && { requires: parseJsonField(cmd.requires) }),
        ...(cmd.options && { options: parseJsonField(cmd.options) }),
        ...(cmd.requirements && {
          requirements: parseJsonField(cmd.requirements),
        }),
        ...(cmd.params && { params: parseJsonField(cmd.params) }),
      }))
    }

    // Add docs
    const docs = parseJsonField(app.docs)
    if (docs) manifest.docs = docs

    // Add dependencies
    const dependencies = parseJsonField<string[]>(app.dependencies)
    if (dependencies) manifest.dependencies = dependencies

    // Add metadata
    const metadata = (parseJsonField(app.metadata) as any) || {}
    // Inject tags from junction table into metadata for export
    manifest.metadata = {
      ...metadata,
      tags: tagsByApp.get(app.id) ?? [],
    }

    // Add install config
    const installConfig = parseJsonField(app.installConfig)
    if (installConfig) manifest.installConfig = installConfig

    // Add config schema for tools
    const configSchema = parseJsonField(app.configSchema)
    if (configSchema) manifest.configSchema = configSchema

    // Add status (runtime default)
    manifest.status = 'not-installed'

    // Write manifest
    const manifestPath = resolve(appDir, 'manifest.json')
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 4))
    appsExported++
  }
  console.log(`  Exported ${appsExported} app manifests`)

  // Export tags
  console.log('[3/3] Exporting tags and inbox...')
  const allTags = db.select().from(tags).all()

  writeFileSync(
    resolve(dataDir, 'tags.json'),
    JSON.stringify(
      {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        count: allTags.length,
        tags: allTags,
      },
      null,
      2,
    ),
  )
  console.log(`  → Exported ${allTags.length} tags`)

  const allInbox = db.select().from(inbox).all()

  writeFileSync(
    resolve(dataDir, 'inbox.json'),
    JSON.stringify(
      {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        count: allInbox.length,
        items: allInbox,
      },
      null,
      2,
    ),
  )
  console.log(`  → Exported ${allInbox.length} inbox items`)

  console.log('\n' + '='.repeat(50))
  console.log('✅ Export complete!')
  console.log('   App manifests: src/data/apps/{appId}/manifest.json')
  console.log('   Tags/Inbox: src/data/')
  console.log('='.repeat(50) + '\n')
}

exportData().catch(console.error)
