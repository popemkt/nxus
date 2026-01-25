/**
 * compare-legacy-vs-nodes.ts - Verify node data matches legacy data
 *
 * Usage: npx tsx scripts/compare-legacy-vs-nodes.ts
 */

import { isNull } from '@nxus/db/server'
import {
  getDatabase,
  initDatabase,
  SYSTEM_SUPERTAGS,
  itemCommands,
  items,
  tags,
  getNodesBySupertagWithInheritance,
  getProperty,
} from '@nxus/db/server'
import { nodeToCommand, nodeToItem } from '@nxus/workbench/server'

function compareItems() {
  const db = getDatabase()

  // Legacy items
  const legacyItems = db.select().from(items).all()

  // Node items
  const nodeItems = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)

  console.log('\n📦 ITEMS COMPARISON')
  console.log('='.repeat(60))
  console.log(`Legacy: ${legacyItems.length}, Nodes: ${nodeItems.length}`)

  // Compare a specific item
  const legacyClaude = legacyItems.find((i) => i.id === 'claude-code')
  const nodeClaude = nodeItems.find(
    (n) => getProperty<string>(n, 'legacyId') === 'claude-code',
  )

  if (legacyClaude && nodeClaude) {
    const converted = nodeToItem(nodeClaude)
    console.log('\n🔍 Sample: claude-code')
    console.log('-'.repeat(40))
    console.log('Field          | Legacy                | Node')
    console.log('-'.repeat(40))
    console.log(
      `id             | ${legacyClaude.id.padEnd(21)} | ${converted.id}`,
    )
    console.log(
      `name           | ${legacyClaude.name.padEnd(21)} | ${converted.name}`,
    )
    console.log(
      `type           | ${legacyClaude.type.padEnd(21)} | ${converted.type}`,
    )
    console.log(
      `path           | ${(legacyClaude.path || '').slice(0, 21).padEnd(21)} | ${(converted.path || '').slice(0, 21)}`,
    )
    console.log(
      `checkCommand   | ${(legacyClaude.checkCommand || '').slice(0, 21).padEnd(21)} | ${(converted.checkCommand || '').slice(0, 21)}`,
    )

    const match =
      legacyClaude.id === converted.id &&
      legacyClaude.name === converted.name &&
      legacyClaude.type === converted.type
    console.log(`\n${match ? '✅ MATCH' : '❌ MISMATCH'}`)
  }
}

function compareTags() {
  const db = getDatabase()

  // Legacy tags
  const legacyTags = db.select().from(tags).all()

  // Node tags
  const nodeTags = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.TAG)

  console.log('\n\n🏷️  TAGS COMPARISON')
  console.log('='.repeat(60))
  console.log(`Legacy: ${legacyTags.length}, Nodes: ${nodeTags.length}`)

  // List first 5
  console.log('\nSample tags:')
  console.log('-'.repeat(40))
  console.log('Legacy Name           | Node Name')
  console.log('-'.repeat(40))
  for (let i = 0; i < Math.min(5, legacyTags.length); i++) {
    const legacyTag = legacyTags[i]
    const nodeTag = nodeTags.find(
      (n) => getProperty<number>(n, 'legacyId') === legacyTag.id,
    )
    console.log(
      `${legacyTag.name.padEnd(21)} | ${nodeTag?.content || '(not found)'}`,
    )
  }
}

function compareCommands() {
  const db = getDatabase()

  // Legacy commands
  const legacyCommands = db
    .select()
    .from(itemCommands)
    .where(isNull(itemCommands.deletedAt))
    .all()

  // Node commands
  const nodeCommands = getNodesBySupertagWithInheritance(
    db,
    SYSTEM_SUPERTAGS.COMMAND,
  )

  console.log('\n\n⚡ COMMANDS COMPARISON')
  console.log('='.repeat(60))
  console.log(`Legacy: ${legacyCommands.length}, Nodes: ${nodeCommands.length}`)

  // Compare a specific command
  const legacyCmd = legacyCommands.find((c) => c.appId === 'claude-code')
  const nodeCmd = nodeCommands.find((n) => {
    const parentId = getProperty<string>(n, 'parent')
    const parent = parentId
      ? getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM).find(
          (i) => i.id === parentId,
        )
      : null
    return parent && getProperty<string>(parent, 'legacyId') === 'claude-code'
  })

  if (legacyCmd && nodeCmd) {
    const converted = nodeToCommand(nodeCmd)
    console.log('\n🔍 Sample command (claude-code):')
    console.log('-'.repeat(40))
    console.log(`Legacy: ${legacyCmd.name}`)
    console.log(`Node:   ${converted.name}`)
    console.log(`Mode:   ${legacyCmd.mode} vs ${converted.mode}`)
  }
}

async function main() {
  console.log('\n' + '='.repeat(60))
  console.log('  Legacy vs Node Data Comparison')
  console.log('='.repeat(60))

  initDatabase()

  compareItems()
  compareTags()
  compareCommands()

  console.log('\n' + '='.repeat(60) + '\n')
}

main().catch(console.error)
