/**
 * db-seed-nodes.ts - Seed node tables directly from manifest.json files
 *
 * Usage: npx tsx scripts/db-seed-nodes.ts
 *
 * Seeds the node-based architecture directly from manifest.json files,
 * bypassing the legacy items/commands tables.
 */

import { eq } from 'drizzle-orm'
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { uuidv7 } from 'uuidv7'
import { getDatabase, initDatabase } from '../src/db/client'
import {
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
} from '../src/db/node-schema'
import { ItemSchema, type TagRef } from '../src/types/item'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = resolve(__dirname, '../src/data')
const appsDir = resolve(dataDir, 'apps')

// System node ID cache
const systemNodeIds = new Map<string, string>()

function getSystemNodeId(
  db: ReturnType<typeof getDatabase>,
  systemId: string,
): string {
  if (systemNodeIds.has(systemId)) return systemNodeIds.get(systemId)!
  const node = db.select().from(nodes).where(eq(nodes.systemId, systemId)).get()
  if (!node)
    throw new Error(
      `System node not found: ${systemId}. Run bootstrap-nodes.ts first.`,
    )
  systemNodeIds.set(systemId, node.id)
  return node.id
}

function addProperty(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  fieldNodeId: string,
  value: string,
  order = 0,
): void {
  db.insert(nodeProperties)
    .values({
      nodeId,
      fieldNodeId,
      value,
      order,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run()
}

function loadJsonFile<T>(filepath: string): T | null {
  try {
    return JSON.parse(readFileSync(filepath, 'utf-8'))
  } catch {
    return null
  }
}

// Tag name → node ID cache (created during seed)
const tagNodeIds = new Map<string, string>()

function getOrCreateTagNode(
  db: ReturnType<typeof getDatabase>,
  tagName: string,
  F: Record<string, string>,
  ST: Record<string, string>,
): string {
  if (tagNodeIds.has(tagName)) return tagNodeIds.get(tagName)!

  // Check if tag exists by content
  const existing = db
    .select()
    .from(nodes)
    .all()
    .find((n) => n.content === tagName && !n.systemId?.startsWith('supertag:'))
  if (existing) {
    tagNodeIds.set(tagName, existing.id)
    return existing.id
  }

  // Create new tag node
  const nodeId = uuidv7()
  db.insert(nodes)
    .values({
      id: nodeId,
      content: tagName,
      contentPlain: tagName.toLowerCase(),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run()

  addProperty(db, nodeId, F.supertag, JSON.stringify(ST.tag))
  tagNodeIds.set(tagName, nodeId)
  return nodeId
}

async function seedNodes() {
  console.log('\n' + '='.repeat(50))
  console.log('  DB Seed Nodes: JSON → Node Tables')
  console.log('='.repeat(50) + '\n')

  console.log('[1/4] Initializing database...')
  initDatabase()
  const db = getDatabase()

  // Field shortcuts
  const F = {
    supertag: getSystemNodeId(db, SYSTEM_FIELDS.SUPERTAG),
    type: getSystemNodeId(db, SYSTEM_FIELDS.TYPE),
    path: getSystemNodeId(db, SYSTEM_FIELDS.PATH),
    homepage: getSystemNodeId(db, SYSTEM_FIELDS.HOMEPAGE),
    description: getSystemNodeId(db, SYSTEM_FIELDS.DESCRIPTION),
    category: getSystemNodeId(db, SYSTEM_FIELDS.CATEGORY),
    platform: getSystemNodeId(db, SYSTEM_FIELDS.PLATFORM),
    docs: getSystemNodeId(db, SYSTEM_FIELDS.DOCS),
    checkCmd: getSystemNodeId(db, SYSTEM_FIELDS.CHECK_COMMAND),
    installInstr: getSystemNodeId(db, SYSTEM_FIELDS.INSTALL_INSTRUCTIONS),
    legacyId: getSystemNodeId(db, SYSTEM_FIELDS.LEGACY_ID),
    deps: getSystemNodeId(db, SYSTEM_FIELDS.DEPENDENCIES),
    tags: getSystemNodeId(db, SYSTEM_FIELDS.TAGS),
    parent: getSystemNodeId(db, SYSTEM_FIELDS.PARENT),
    command: getSystemNodeId(db, SYSTEM_FIELDS.COMMAND),
    commandId: getSystemNodeId(db, SYSTEM_FIELDS.COMMAND_ID),
    mode: getSystemNodeId(db, SYSTEM_FIELDS.MODE),
    target: getSystemNodeId(db, SYSTEM_FIELDS.TARGET),
    icon: getSystemNodeId(db, SYSTEM_FIELDS.ICON),
    color: getSystemNodeId(db, SYSTEM_FIELDS.COLOR),
    scriptSource: getSystemNodeId(db, SYSTEM_FIELDS.SCRIPT_SOURCE),
    cwd: getSystemNodeId(db, SYSTEM_FIELDS.CWD),
    platforms: getSystemNodeId(db, SYSTEM_FIELDS.PLATFORMS),
    requires: getSystemNodeId(db, SYSTEM_FIELDS.REQUIRES),
    options: getSystemNodeId(db, SYSTEM_FIELDS.OPTIONS),
  }

  // Supertag shortcuts
  const ST = {
    item: getSystemNodeId(db, SYSTEM_SUPERTAGS.ITEM),
    tool: getSystemNodeId(db, SYSTEM_SUPERTAGS.TOOL),
    repo: getSystemNodeId(db, SYSTEM_SUPERTAGS.REPO),
    tag: getSystemNodeId(db, SYSTEM_SUPERTAGS.TAG),
    command: getSystemNodeId(db, SYSTEM_SUPERTAGS.COMMAND),
  }

  // Track created items for dependency resolution
  const itemNodeIds = new Map<string, string>()

  // ============================================================================
  // Step 2: Seed all tags from tags.json
  // ============================================================================
  console.log('[2/5] Seeding tags from tags.json...')
  const tagsJsonPath = resolve(dataDir, 'tags.json')
  const tagsData = loadJsonFile<{
    tags: Array<{
      id: number
      name: string
      parentId: number | null
      order: number
      color: string | null
      icon: string | null
    }>
  }>(tagsJsonPath)

  // Build legacy ID to node ID mapping for parent resolution
  const legacyTagIdToNodeId = new Map<number, string>()
  let tagsCount = 0

  if (tagsData?.tags) {
    // First pass: create all tag nodes
    for (const tag of tagsData.tags) {
      // Check if tag already exists by content
      const existing = db
        .select()
        .from(nodes)
        .all()
        .find(
          (n) => n.content === tag.name && !n.systemId?.startsWith('supertag:'),
        )

      let nodeId: string
      if (existing) {
        nodeId = existing.id
        // Delete existing properties to re-seed
        db.delete(nodeProperties).where(eq(nodeProperties.nodeId, nodeId)).run()
      } else {
        nodeId = uuidv7()
        db.insert(nodes)
          .values({
            id: nodeId,
            content: tag.name,
            contentPlain: tag.name.toLowerCase(),
            createdAt: new Date(),
            updatedAt: new Date(),
          })
          .run()
      }

      // Assign #Tag supertag
      addProperty(db, nodeId, F.supertag, JSON.stringify(ST.tag))

      // Set legacyId for backwards compatibility
      addProperty(db, nodeId, F.legacyId, JSON.stringify(tag.id))

      // Set optional properties
      if (tag.color) addProperty(db, nodeId, F.color, JSON.stringify(tag.color))
      if (tag.icon) addProperty(db, nodeId, F.icon, JSON.stringify(tag.icon))

      legacyTagIdToNodeId.set(tag.id, nodeId)
      tagNodeIds.set(tag.name, nodeId)
      tagsCount++
    }

    // Second pass: resolve parent relationships
    for (const tag of tagsData.tags) {
      if (tag.parentId) {
        const nodeId = legacyTagIdToNodeId.get(tag.id)
        const parentNodeId = legacyTagIdToNodeId.get(tag.parentId)
        if (nodeId && parentNodeId) {
          addProperty(db, nodeId, F.parent, JSON.stringify(parentNodeId))
        }
      }
    }
  }
  console.log(`  Seeded ${tagsCount} tags`)

  // ============================================================================
  // Step 3: Seed items from manifests
  // ============================================================================
  console.log('[3/5] Seeding items from manifests...')
  const appDirs = readdirSync(appsDir).filter((name) => {
    const fullPath = join(appsDir, name)
    return (
      statSync(fullPath).isDirectory() &&
      existsSync(join(fullPath, 'manifest.json'))
    )
  })

  let itemsCount = 0
  let commandsCount = 0

  for (const appDir of appDirs) {
    const manifestPath = join(appsDir, appDir, 'manifest.json')
    const manifest = loadJsonFile<Record<string, unknown>>(manifestPath)
    if (!manifest) continue

    const validationResult = ItemSchema.safeParse(manifest)
    if (!validationResult.success) {
      console.error(`❌ Validation failed for ${appDir}, skipping...`)
      continue
    }

    const item = validationResult.data
    const systemId = `item:${item.id}`

    // Check if node already exists
    const existing = db
      .select()
      .from(nodes)
      .where(eq(nodes.systemId, systemId))
      .get()
    let nodeId: string

    if (existing) {
      nodeId = existing.id
      // Delete existing properties to re-seed
      db.delete(nodeProperties).where(eq(nodeProperties.nodeId, nodeId)).run()
    } else {
      nodeId = uuidv7()
      db.insert(nodes)
        .values({
          id: nodeId,
          content: item.name,
          contentPlain: item.name.toLowerCase(),
          systemId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run()
    }

    itemNodeIds.set(item.id, nodeId)

    // Assign supertag
    let supertagId = ST.item
    if (item.type === 'tool') supertagId = ST.tool
    else if (item.type === 'remote-repo') supertagId = ST.repo
    addProperty(db, nodeId, F.supertag, JSON.stringify(supertagId))

    // Properties
    addProperty(db, nodeId, F.type, JSON.stringify(item.type))
    addProperty(db, nodeId, F.path, JSON.stringify(item.path))
    if (item.description)
      addProperty(db, nodeId, F.description, JSON.stringify(item.description))
    if (item.homepage)
      addProperty(db, nodeId, F.homepage, JSON.stringify(item.homepage))
    if ((item as any).platform)
      addProperty(
        db,
        nodeId,
        F.platform,
        JSON.stringify((item as any).platform),
      )
    if (item.docs) addProperty(db, nodeId, F.docs, JSON.stringify(item.docs))
    if ((item as any).checkCommand)
      addProperty(
        db,
        nodeId,
        F.checkCmd,
        JSON.stringify((item as any).checkCommand),
      )
    if ((item as any).installInstructions)
      addProperty(
        db,
        nodeId,
        F.installInstr,
        JSON.stringify((item as any).installInstructions),
      )
    if (item.metadata?.category)
      addProperty(
        db,
        nodeId,
        F.category,
        JSON.stringify(item.metadata.category),
      )
    addProperty(db, nodeId, F.legacyId, JSON.stringify(item.id))

    // Tags
    const manifestTags: TagRef[] = item.metadata?.tags ?? []
    for (let i = 0; i < manifestTags.length; i++) {
      const tagNodeId = getOrCreateTagNode(db, manifestTags[i].name, F, ST)
      addProperty(db, nodeId, F.tags, JSON.stringify(tagNodeId), i)
    }

    // Commands
    for (const cmd of item.commands || []) {
      const cmdNodeId = uuidv7()
      db.insert(nodes)
        .values({
          id: cmdNodeId,
          content: cmd.name,
          contentPlain: cmd.name.toLowerCase(),
          ownerId: nodeId, // Item owns its commands
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .run()

      addProperty(db, cmdNodeId, F.supertag, JSON.stringify(ST.command))
      // Note: parent relationship is established via ownerId on the node itself
      addProperty(db, cmdNodeId, F.commandId, JSON.stringify(cmd.id))
      addProperty(db, cmdNodeId, F.command, JSON.stringify(cmd.command))
      addProperty(db, cmdNodeId, F.mode, JSON.stringify(cmd.mode))
      addProperty(db, cmdNodeId, F.target, JSON.stringify(cmd.target))
      addProperty(db, cmdNodeId, F.icon, JSON.stringify(cmd.icon))
      addProperty(db, cmdNodeId, F.category, JSON.stringify(cmd.category))
      if (cmd.description)
        addProperty(
          db,
          cmdNodeId,
          F.description,
          JSON.stringify(cmd.description),
        )
      if (cmd.scriptSource)
        addProperty(
          db,
          cmdNodeId,
          F.scriptSource,
          JSON.stringify(cmd.scriptSource),
        )
      if (cmd.cwd) addProperty(db, cmdNodeId, F.cwd, JSON.stringify(cmd.cwd))
      if (cmd.platforms)
        addProperty(db, cmdNodeId, F.platforms, JSON.stringify(cmd.platforms))
      if (cmd.requires)
        addProperty(db, cmdNodeId, F.requires, JSON.stringify(cmd.requires))
      if (cmd.options)
        addProperty(db, cmdNodeId, F.options, JSON.stringify(cmd.options))

      commandsCount++
    }

    itemsCount++
  }

  console.log(`  Seeded ${itemsCount} items, ${commandsCount} commands`)

  // Resolve dependencies (second pass)
  console.log('[4/5] Resolving dependencies...')
  let depCount = 0

  for (const appDir of appDirs) {
    const manifestPath = join(appsDir, appDir, 'manifest.json')
    const manifest = loadJsonFile<Record<string, unknown>>(manifestPath)
    if (!manifest) continue

    const validationResult = ItemSchema.safeParse(manifest)
    if (!validationResult.success) continue

    const item = validationResult.data
    const nodeId = itemNodeIds.get(item.id)
    if (!nodeId || !item.dependencies) continue

    for (let i = 0; i < item.dependencies.length; i++) {
      const depNodeId = itemNodeIds.get(item.dependencies[i])
      if (depNodeId) {
        addProperty(db, nodeId, F.deps, JSON.stringify(depNodeId), i)
        depCount++
      }
    }
  }
  console.log(`  Created ${depCount} dependency relationships`)

  // ============================================================================
  // Step 5: Seed inbox items from legacy table
  // ============================================================================
  console.log('[5/6] Seeding inbox items from legacy table...')

  // Import inbox table dynamically to avoid circular deps
  const { inbox } = await import('../src/db/schema')

  const inboxSupertagId = getSystemNodeId(db, SYSTEM_SUPERTAGS.INBOX)
  const statusFieldId = getSystemNodeId(db, SYSTEM_FIELDS.STATUS)
  const notesFieldId = getSystemNodeId(db, SYSTEM_FIELDS.NOTES)

  const legacyInboxItems = db.select().from(inbox).all()
  let inboxCount = 0
  let inboxSkipped = 0

  for (const item of legacyInboxItems) {
    // Check if already migrated (by legacyId)
    const existingProp = db
      .select()
      .from(nodeProperties)
      .where(eq(nodeProperties.fieldNodeId, F.legacyId))
      .all()
      .find((p) => {
        try {
          return JSON.parse(p.value || '') === item.id
        } catch {
          return false
        }
      })

    // Also verify it has #Inbox supertag
    if (existingProp) {
      const nodeSupertags = db
        .select()
        .from(nodeProperties)
        .where(eq(nodeProperties.nodeId, existingProp.nodeId))
        .all()
        .filter((p) => p.fieldNodeId === F.supertag)

      const hasInboxSupertag = nodeSupertags.some((p) => {
        try {
          return JSON.parse(p.value || '') === inboxSupertagId
        } catch {
          return false
        }
      })

      if (hasInboxSupertag) {
        inboxSkipped++
        continue
      }
    }

    // Create new inbox node
    const nodeId = uuidv7()
    db.insert(nodes)
      .values({
        id: nodeId,
        content: item.title,
        contentPlain: item.title.toLowerCase(),
        createdAt: item.createdAt || new Date(),
        updatedAt: item.updatedAt || new Date(),
      })
      .run()

    // Assign #Inbox supertag
    addProperty(db, nodeId, F.supertag, JSON.stringify(inboxSupertagId))

    // Set legacyId
    addProperty(db, nodeId, F.legacyId, JSON.stringify(item.id))

    // Set status
    addProperty(db, nodeId, statusFieldId, JSON.stringify(item.status))

    // Set notes if present
    if (item.notes) {
      addProperty(db, nodeId, notesFieldId, JSON.stringify(item.notes))
    }

    inboxCount++
  }
  console.log(`  Seeded ${inboxCount} inbox items (${inboxSkipped} skipped)`)

  // Summary
  console.log('[6/6] Done!')
  const totalNodes = db.select().from(nodes).all().length
  const totalProps = db.select().from(nodeProperties).all().length

  console.log('\n' + '='.repeat(50))
  console.log('✅ Node seed complete!')
  console.log(`   Total nodes: ${totalNodes}`)
  console.log(`   Total properties: ${totalProps}`)
  console.log(
    `   Items: ${itemsCount}, Commands: ${commandsCount}, Inbox: ${inboxCount}`,
  )
  console.log('='.repeat(50) + '\n')
}

seedNodes().catch(console.error)
