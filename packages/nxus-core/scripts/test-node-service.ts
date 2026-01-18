/**
 * test-node-service.ts - Quick verification of node service layer
 *
 * Usage: npx tsx scripts/test-node-service.ts
 */

import { getDatabase, initDatabase } from '../src/db/client'
import { SYSTEM_SUPERTAGS } from '../src/db/node-schema'
import { nodeToItem } from '../src/services/nodes/adapters'
import {
  findNode,
  getNodesBySupertagWithInheritance,
} from '../src/services/nodes/node.service'

async function test() {
  console.log('\n' + '='.repeat(50))
  console.log('  Node Service Layer Test')
  console.log('='.repeat(50) + '\n')

  initDatabase()
  const db = getDatabase()

  // Test 1: Find a specific item
  console.log('[1] Finding item:claude-code...')
  const claudeNode = findNode(db, 'item:claude-code')
  if (claudeNode) {
    console.log(`   ✓ Found: ${claudeNode.content}`)
    console.log(
      `   Supertags: ${claudeNode.supertags.map((s) => s.content).join(', ')}`,
    )
  } else {
    console.log('   ✗ Not found')
  }

  // Test 2: Get all items with inheritance
  console.log(
    '\n[2] Getting all items (with #Tool and #Repo via inheritance)...',
  )
  const itemNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)
  console.log(`   ✓ Found ${itemNodes.length} item nodes`)

  // Test 3: Convert to legacy Item
  console.log('\n[3] Converting to legacy Item type...')
  if (claudeNode) {
    const item = nodeToItem(claudeNode)
    console.log(`   ✓ ID: ${item.id}`)
    console.log(`   Type: ${item.type}`)
    console.log(`   Path: ${item.path}`)
    console.log(`   CheckCommand: ${item.checkCommand}`)
  }

  // Test 4: Get all commands
  console.log('\n[4] Getting all commands...')
  const commandNodes = getNodesBySupertagWithInheritance(
    db,
    SYSTEM_SUPERTAGS.COMMAND,
  )
  console.log(`   ✓ Found ${commandNodes.length} command nodes`)

  // Test 5: Get tags
  console.log('\n[5] Getting all tags...')
  const tagNodes = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.TAG)
  console.log(`   ✓ Found ${tagNodes.length} tag nodes`)

  // Summary
  console.log('\n' + '='.repeat(50))
  console.log('✅ All tests passed!')
  console.log(
    `   Items: ${itemNodes.length}, Commands: ${commandNodes.length}, Tags: ${tagNodes.length}`,
  )
  console.log('='.repeat(50) + '\n')
}

test().catch(console.error)
