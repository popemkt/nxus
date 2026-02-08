/**
 * migrate-to-nodes.ts - Migrate existing data to node-based schema
 *
 * Usage: npx tsx scripts/migrate-to-nodes.ts
 *
 * Migrates items, tags, and commands from old tables to the node architecture.
 */

import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS,
  eq,
  getDatabase,
  initDatabase,
  isNull,
  itemCommands,
  itemTags,
  items,
  nodeProperties,
  nodes,
  tags } from '@nxus/db/server'
import { uuidv7 } from 'uuidv7'

// ID mappings: oldId → newNodeId
const itemIdMap = new Map<string, string>()
const tagIdMap = new Map<number, string>()
const commandIdMap = new Map<string, string>()

// System node ID cache
const systemNodeIds = new Map<string, string>()

/**
 * Get system node UUID by systemId
 */
function getSystemNodeId(
  db: ReturnType<typeof getDatabase>,
  systemId: string,
): string | null {
  if (systemNodeIds.has(systemId)) {
    return systemNodeIds.get(systemId)!
  }
  const node = db.select().from(nodes).where(eq(nodes.systemId, systemId)).get()
  if (!node) {
    return null
  }
  systemNodeIds.set(systemId, node.id)
  return node.id
}

/**
 * Add a property to a node
 */
function addProperty(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  fieldNodeId: string,
  value: string,
  order: number = 0,
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

async function migrate() {
  console.log('\n' + '='.repeat(50))
  console.log('  Migrate to Nodes: Converting existing data')
  console.log('='.repeat(50) + '\n')

  console.log('[1/6] Initializing database...')
  initDatabase()
  const db = getDatabase()

  // Get required field IDs (will throw if missing)
  const requiredFields = [
    SYSTEM_FIELDS.SUPERTAG,
    SYSTEM_FIELDS.TYPE,
    SYSTEM_FIELDS.PATH,
    SYSTEM_FIELDS.HOMEPAGE,
    SYSTEM_FIELDS.DESCRIPTION,
    SYSTEM_FIELDS.COLOR,
    SYSTEM_FIELDS.ICON,
    SYSTEM_FIELDS.LEGACY_ID,
    SYSTEM_FIELDS.DEPENDENCIES,
    SYSTEM_FIELDS.TAGS,
    SYSTEM_FIELDS.PARENT,
    SYSTEM_FIELDS.CHECK_COMMAND,
    SYSTEM_FIELDS.INSTALL_INSTRUCTIONS,
    SYSTEM_FIELDS.COMMAND,
    SYSTEM_FIELDS.COMMAND_ID,
    SYSTEM_FIELDS.MODE,
    SYSTEM_FIELDS.TARGET,
    SYSTEM_FIELDS.CATEGORY,
    SYSTEM_FIELDS.PLATFORM,
    SYSTEM_FIELDS.DOCS,
    SYSTEM_FIELDS.SCRIPT_SOURCE,
    SYSTEM_FIELDS.CWD,
    SYSTEM_FIELDS.PLATFORMS,
    SYSTEM_FIELDS.REQUIRES,
    SYSTEM_FIELDS.OPTIONS,
    SYSTEM_FIELDS.PARAMS,
    SYSTEM_FIELDS.REQUIREMENTS,
  ]

  for (const fieldSysId of requiredFields) {
    const id = getSystemNodeId(db, fieldSysId)
    if (!id) {
      console.error(
        `Missing field: ${fieldSysId}. Run bootstrap-nodes.ts first.`,
      )
      return
    }
  }

  // Field shortcuts
  const F = {
    supertag: getSystemNodeId(db, SYSTEM_FIELDS.SUPERTAG)!,
    type: getSystemNodeId(db, SYSTEM_FIELDS.TYPE)!,
    path: getSystemNodeId(db, SYSTEM_FIELDS.PATH)!,
    homepage: getSystemNodeId(db, SYSTEM_FIELDS.HOMEPAGE)!,
    description: getSystemNodeId(db, SYSTEM_FIELDS.DESCRIPTION)!,
    color: getSystemNodeId(db, SYSTEM_FIELDS.COLOR)!,
    icon: getSystemNodeId(db, SYSTEM_FIELDS.ICON)!,
    legacyId: getSystemNodeId(db, SYSTEM_FIELDS.LEGACY_ID)!,
    deps: getSystemNodeId(db, SYSTEM_FIELDS.DEPENDENCIES)!,
    tags: getSystemNodeId(db, SYSTEM_FIELDS.TAGS)!,
    parent: getSystemNodeId(db, SYSTEM_FIELDS.PARENT)!,
    checkCmd: getSystemNodeId(db, SYSTEM_FIELDS.CHECK_COMMAND)!,
    installInstr: getSystemNodeId(db, SYSTEM_FIELDS.INSTALL_INSTRUCTIONS)!,
    command: getSystemNodeId(db, SYSTEM_FIELDS.COMMAND)!,
    commandId: getSystemNodeId(db, SYSTEM_FIELDS.COMMAND_ID)!,
    mode: getSystemNodeId(db, SYSTEM_FIELDS.MODE)!,
    target: getSystemNodeId(db, SYSTEM_FIELDS.TARGET)!,
    category: getSystemNodeId(db, SYSTEM_FIELDS.CATEGORY)!,
    platform: getSystemNodeId(db, SYSTEM_FIELDS.PLATFORM)!,
    docs: getSystemNodeId(db, SYSTEM_FIELDS.DOCS)!,
    scriptSource: getSystemNodeId(db, SYSTEM_FIELDS.SCRIPT_SOURCE)!,
    cwd: getSystemNodeId(db, SYSTEM_FIELDS.CWD)!,
    platforms: getSystemNodeId(db, SYSTEM_FIELDS.PLATFORMS)!,
    requires: getSystemNodeId(db, SYSTEM_FIELDS.REQUIRES)!,
    options: getSystemNodeId(db, SYSTEM_FIELDS.OPTIONS)!,
    params: getSystemNodeId(db, SYSTEM_FIELDS.PARAMS)!,
    requirements: getSystemNodeId(db, SYSTEM_FIELDS.REQUIREMENTS)!,
  }

  // Supertag shortcuts
  const ST = {
    item: getSystemNodeId(db, SYSTEM_SUPERTAGS.ITEM)!,
    tool: getSystemNodeId(db, SYSTEM_SUPERTAGS.TOOL)!,
    repo: getSystemNodeId(db, SYSTEM_SUPERTAGS.REPO)!,
    tag: getSystemNodeId(db, SYSTEM_SUPERTAGS.TAG)!,
    command: getSystemNodeId(db, SYSTEM_SUPERTAGS.COMMAND)!,
  }

  // ============================================================================
  // Step 2: Migrate Tags
  // ============================================================================
  console.log('\n[2/6] Migrating tags...')
  const allTags = db.select().from(tags).all()
  let tagCount = 0

  for (const tag of allTags) {
    const nodeId = uuidv7()
    tagIdMap.set(tag.id, nodeId)

    db.insert(nodes)
      .values({
        id: nodeId,
        content: tag.name,
        contentPlain: tag.name.toLowerCase(),
        createdAt: tag.createdAt,
        updatedAt: tag.updatedAt,
      })
      .run()

    // Assign #Tag supertag
    addProperty(db, nodeId, F.supertag, JSON.stringify(ST.tag))

    // Properties
    if (tag.color) addProperty(db, nodeId, F.color, JSON.stringify(tag.color))
    if (tag.icon) addProperty(db, nodeId, F.icon, JSON.stringify(tag.icon))
    addProperty(db, nodeId, F.legacyId, JSON.stringify(tag.id))

    tagCount++
  }

  // Second pass: parent relationships
  for (const tag of allTags) {
    if (tag.parentId) {
      const nodeId = tagIdMap.get(tag.id)
      const parentNodeId = tagIdMap.get(tag.parentId)
      if (nodeId && parentNodeId) {
        addProperty(db, nodeId, F.parent, JSON.stringify(parentNodeId))
      }
    }
  }
  console.log(`  Migrated ${tagCount} tags`)

  // ============================================================================
  // Step 3: Migrate Items
  // ============================================================================
  console.log('\n[3/6] Migrating items...')
  const allItems = db.select().from(items).all()
  let itemCount = 0

  for (const item of allItems) {
    const nodeId = uuidv7()
    itemIdMap.set(item.id, nodeId)

    db.insert(nodes)
      .values({
        id: nodeId,
        content: item.name,
        contentPlain: item.name.toLowerCase(),
        systemId: `item:${item.id}`,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      })
      .run()

    // Assign supertag based on type
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
    if (item.checkCommand)
      addProperty(db, nodeId, F.checkCmd, JSON.stringify(item.checkCommand))
    if (item.installInstructions)
      addProperty(
        db,
        nodeId,
        F.installInstr,
        JSON.stringify(item.installInstructions),
      )
    if (item.platform)
      addProperty(db, nodeId, F.platform, JSON.stringify(item.platform))
    if (item.docs) addProperty(db, nodeId, F.docs, JSON.stringify(item.docs))
    // Category from metadata
    const metadata = item.metadata as { category?: string } | null
    if (metadata?.category)
      addProperty(db, nodeId, F.category, JSON.stringify(metadata.category))
    addProperty(db, nodeId, F.legacyId, JSON.stringify(item.id))

    itemCount++
  }
  console.log(`  Migrated ${itemCount} items`)

  // ============================================================================
  // Step 4: Migrate Commands
  // ============================================================================
  console.log('\n[4/6] Migrating commands...')
  const allCommands = db
    .select()
    .from(itemCommands)
    .where(isNull(itemCommands.deletedAt))
    .all()
  let commandCount = 0

  for (const cmd of allCommands) {
    const nodeId = uuidv7()
    commandIdMap.set(cmd.id, nodeId)

    db.insert(nodes)
      .values({
        id: nodeId,
        content: cmd.name,
        contentPlain: cmd.name.toLowerCase(),
        createdAt: cmd.createdAt,
        updatedAt: cmd.updatedAt,
      })
      .run()

    // Assign #Command supertag
    addProperty(db, nodeId, F.supertag, JSON.stringify(ST.command))

    // Link to parent item
    const parentItemNodeId = itemIdMap.get(cmd.appId)
    if (parentItemNodeId) {
      addProperty(db, nodeId, F.parent, JSON.stringify(parentItemNodeId))
    }

    // Command properties
    addProperty(db, nodeId, F.commandId, JSON.stringify(cmd.commandId))
    addProperty(db, nodeId, F.command, JSON.stringify(cmd.command))
    addProperty(db, nodeId, F.mode, JSON.stringify(cmd.mode))
    addProperty(db, nodeId, F.target, JSON.stringify(cmd.target))
    addProperty(db, nodeId, F.icon, JSON.stringify(cmd.icon))
    addProperty(db, nodeId, F.category, JSON.stringify(cmd.category))
    if (cmd.description)
      addProperty(db, nodeId, F.description, JSON.stringify(cmd.description))
    if (cmd.scriptSource)
      addProperty(db, nodeId, F.scriptSource, JSON.stringify(cmd.scriptSource))
    if (cmd.cwd) addProperty(db, nodeId, F.cwd, JSON.stringify(cmd.cwd))
    if (cmd.platforms)
      addProperty(db, nodeId, F.platforms, JSON.stringify(cmd.platforms))
    if (cmd.requires)
      addProperty(db, nodeId, F.requires, JSON.stringify(cmd.requires))
    if (cmd.options)
      addProperty(db, nodeId, F.options, JSON.stringify(cmd.options))
    if (cmd.params)
      addProperty(db, nodeId, F.params, JSON.stringify(cmd.params))
    if (cmd.requirements)
      addProperty(db, nodeId, F.requirements, JSON.stringify(cmd.requirements))

    commandCount++
  }
  console.log(`  Migrated ${commandCount} commands`)

  // ============================================================================
  // Step 5: Create Item-Tag relationships
  // ============================================================================
  console.log('\n[5/6] Creating tag relationships...')
  const allItemTags = db.select().from(itemTags).all()
  let relationCount = 0

  for (const it of allItemTags) {
    const itemNodeId = itemIdMap.get(it.appId)
    const tagNodeId = tagIdMap.get(it.tagId)
    if (itemNodeId && tagNodeId) {
      addProperty(
        db,
        itemNodeId,
        F.tags,
        JSON.stringify(tagNodeId),
        relationCount,
      )
      relationCount++
    }
  }
  console.log(`  Created ${relationCount} item-tag relationships`)

  // ============================================================================
  // Step 6: Create dependency relationships
  // ============================================================================
  console.log('\n[6/6] Creating dependency relationships...')
  let depCount = 0

  for (const item of allItems) {
    const nodeId = itemIdMap.get(item.id)
    if (!nodeId || !item.dependencies) continue

    for (let i = 0; i < item.dependencies.length; i++) {
      const depId = item.dependencies[i]
      const depNodeId = itemIdMap.get(depId)
      if (depNodeId) {
        addProperty(db, nodeId, F.deps, JSON.stringify(depNodeId), i)
        depCount++
      }
    }
  }
  console.log(`  Created ${depCount} dependency relationships`)

  // ============================================================================
  // Summary
  // ============================================================================
  const totalNodes = db.select().from(nodes).all().length
  const totalProps = db.select().from(nodeProperties).all().length

  console.log('\n' + '='.repeat(50))
  console.log('✅ Migration complete!')
  console.log(`   Total nodes: ${totalNodes}`)
  console.log(`   Total properties: ${totalProps}`)
  console.log(
    `   Items: ${itemCount}, Tags: ${tagCount}, Commands: ${commandCount}`,
  )
  console.log('='.repeat(50) + '\n')
}

migrate().catch(console.error)
