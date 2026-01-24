/**
 * assemble-full-items.ts - Show full assembled items as JSON
 *
 * Usage: npx tsx scripts/assemble-full-items.ts [itemId]
 *
 * Examples:
 *   npx tsx scripts/assemble-full-items.ts claude-code
 *   npx tsx scripts/assemble-full-items.ts  # Shows first 3
 */

import { eq } from 'drizzle-orm'
import {
  getDatabase,
  initDatabase,
  SYSTEM_SUPERTAGS,
  itemCommands,
  items,
  itemTags,
  tags,
  findNode,
  getNodesBySupertagWithInheritance,
  getProperty,
  type Item,
  type TagRef,
} from '@nxus/db/server'
import { nodeToCommand, nodeToItem } from '../src/services/nodes/adapters'

function getFullLegacyItem(
  db: ReturnType<typeof getDatabase>,
  itemId: string,
): Item | null {
  const record = db.select().from(items).where(eq(items.id, itemId)).get()
  if (!record) return null

  // Get commands
  const cmds = db
    .select()
    .from(itemCommands)
    .where(eq(itemCommands.appId, itemId))
    .all()
    .filter((c) => !c.deletedAt)

  // Get tags
  const tagRecords = db
    .select({ id: tags.id, name: tags.name })
    .from(itemTags)
    .innerJoin(tags, eq(itemTags.tagId, tags.id))
    .where(eq(itemTags.appId, itemId))
    .all()

  return {
    id: record.id,
    name: record.name,
    description: record.description,
    type: record.type as Item['type'],
    path: record.path,
    homepage: record.homepage ?? undefined,
    thumbnail: record.thumbnail ?? undefined,
    platform: record.platform ?? undefined,
    docs: record.docs ?? undefined,
    dependencies: record.dependencies ?? undefined,
    metadata: {
      tags: tagRecords,
      category: (record.metadata as any)?.category ?? 'uncategorized',
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    },
    installConfig: record.installConfig ?? undefined,
    checkCommand: record.checkCommand ?? undefined,
    installInstructions: record.installInstructions ?? undefined,
    configSchema: record.configSchema ?? undefined,
    status: 'not-installed',
    commands: cmds.map((c) => ({
      id: c.commandId,
      name: c.name,
      description: c.description ?? undefined,
      icon: c.icon,
      category: c.category,
      target: c.target as any,
      mode: c.mode as any,
      command: c.command,
      scriptSource: c.scriptSource as any,
      cwd: c.cwd ?? undefined,
      platforms: c.platforms ?? undefined,
      requires: c.requires ?? undefined,
      options: c.options ?? undefined,
    })),
  } as Item
}

function getFullNodeItem(
  db: ReturnType<typeof getDatabase>,
  legacyId: string,
): Item | null {
  // Find the node by systemId or legacyId
  let node = findNode(db, `item:${legacyId}`)
  if (!node) return null

  // Get all tags for lookup
  const tagNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.TAG)
  const tagLookup = new Map<string, TagRef>()
  for (const tagNode of tagNodes) {
    const id = getProperty<number>(tagNode, 'legacyId')
    tagLookup.set(tagNode.id, { id: id || 0, name: tagNode.content || '' })
  }

  // Get commands for this item
  const commandNodes = getNodesBySupertagWithInheritance(
    db,
    SYSTEM_SUPERTAGS.COMMAND,
  )
  const commands = commandNodes
    .filter((cmd) => getProperty<string>(cmd, 'parent') === node!.id)
    .map(nodeToCommand)

  return nodeToItem(node, {
    resolveTagRefs: (tagNodeIds) =>
      tagNodeIds.map((id) => tagLookup.get(id)).filter((t): t is TagRef => !!t),
    resolveCommands: () => commands,
  })
}

async function main() {
  initDatabase()
  const db = getDatabase()

  const itemId = process.argv[2]

  if (itemId) {
    // Show specific item
    console.log('\n' + '='.repeat(60))
    console.log(`  Full Item Comparison: ${itemId}`)
    console.log('='.repeat(60))

    console.log('\n📦 LEGACY ITEM:')
    console.log('-'.repeat(40))
    const legacy = getFullLegacyItem(db, itemId)
    console.log(JSON.stringify(legacy, null, 2))

    console.log('\n\n🔷 NODE ITEM:')
    console.log('-'.repeat(40))
    const node = getFullNodeItem(db, itemId)
    console.log(JSON.stringify(node, null, 2))
  } else {
    // Show first 3
    const allItems = db.select().from(items).limit(3).all()

    for (const item of allItems) {
      console.log('\n' + '='.repeat(60))
      console.log(`  Item: ${item.id}`)
      console.log('='.repeat(60))

      const legacy = getFullLegacyItem(db, item.id)
      const node = getFullNodeItem(db, item.id)

      console.log('\nLegacy:')
      console.log(JSON.stringify(legacy, null, 2).slice(0, 500) + '...')

      console.log('\nNode:')
      console.log(JSON.stringify(node, null, 2).slice(0, 500) + '...')

      // Quick check
      const match =
        legacy?.id === node?.id &&
        legacy?.name === node?.name &&
        legacy?.type === node?.type
      console.log(`\n${match ? '✅ Core fields match' : '❌ Mismatch'}`)
    }
  }
}

main().catch(console.error)
