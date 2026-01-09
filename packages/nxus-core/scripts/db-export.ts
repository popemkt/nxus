/**
 * db-export.ts - Export SQLite data to individual manifest.json files
 *
 * Usage: npx tsx scripts/db-export.ts
 *
 * Exports apps and commands from nxus.db to individual manifest.json files
 * in src/data/apps/{appId}/ for version control and AI discovery.
 * Also exports tags and inbox to seed folder.
 */

import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { initDatabase, getDatabase } from '../src/db/client'
import { apps, commands, tags, inboxItems } from '../src/db/schema'
import { eq } from 'drizzle-orm'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = resolve(__dirname, '../src/data')
const appsDir = resolve(dataDir, 'apps')

/**
 * Parse JSON fields from database records
 */
function parseJsonField<T>(value: string | null): T | undefined {
  if (!value) return undefined
  try {
    return JSON.parse(value) as T
  } catch {
    return undefined
  }
}

async function exportData() {
  console.log('Initializing database...')
  await initDatabase()
  const db = getDatabase()

  // Export apps to individual manifest.json files
  console.log('Exporting apps to individual manifests...')
  const allApps = db.select().from(apps).all()
  const allCommands = db.select().from(commands).all()

  // Group commands by app
  const commandsByApp = new Map<string, (typeof allCommands)[0][]>()
  for (const cmd of allCommands) {
    const appCommands = commandsByApp.get(cmd.appId) ?? []
    appCommands.push(cmd)
    commandsByApp.set(cmd.appId, appCommands)
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
        command: cmd.command,
        ...(cmd.scriptSource && { scriptSource: cmd.scriptSource }),
        ...(cmd.cwd && { cwd: cmd.cwd }),
        ...(cmd.platforms && { platforms: parseJsonField(cmd.platforms) }),
        ...(cmd.requires && { requires: parseJsonField(cmd.requires) }),
      }))
    }

    // Add docs
    const docs = parseJsonField(app.docs)
    if (docs) manifest.docs = docs

    // Add dependencies
    const dependencies = parseJsonField<string[]>(app.dependencies)
    if (dependencies) manifest.dependencies = dependencies

    // Add metadata
    const metadata = parseJsonField(app.metadata)
    if (metadata) manifest.metadata = metadata

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
  console.log('Exporting tags...')
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
  console.log(`  Exported ${allTags.length} tags`)

  // Export inbox items
  console.log('Exporting inbox items...')
  const allInbox = db.select().from(inboxItems).all()

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
  console.log(`  Exported ${allInbox.length} inbox items`)

  console.log('\n✅ Export complete!')
  console.log('   App manifests: src/data/apps/{appId}/manifest.json')
  console.log('   Tags/Inbox: src/data/')
}

exportData().catch(console.error)
