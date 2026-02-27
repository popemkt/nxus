/**
 * mini-app-example.ts - Example showing how to use @nxus/db in a mini-app
 *
 * This example demonstrates:
 * 1. Initializing the database
 * 2. Creating nodes with supertags
 * 3. Setting properties on nodes
 * 4. Querying nodes by supertag (with inheritance)
 * 5. Using property helpers
 *
 * Run with: npx tsx examples/mini-app-example.ts
 */

import {
  initDatabase,
  getDatabase,
  createNode,
  findNode,
  findNodeBySystemId,
  setProperty,
  getProperty,
  getPropertyValues,
  getNodesBySupertagWithInheritance,
  SYSTEM_SUPERTAGS,
  type AssembledNode,
} from '../src/server.js'

async function main() {
  console.log('='.repeat(60))
  console.log('  @nxus/db Mini-App Example')
  console.log('='.repeat(60))
  console.log()

  // Step 1: Initialize the database
  console.log('[1] Initializing database...')
  initDatabase()
  const db = getDatabase()
  console.log('   ✓ Database initialized')
  console.log()

  // Step 2: Query existing nodes by supertag
  console.log('[2] Querying all #Item nodes (with inheritance)...')
  const items = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)
  console.log(`   ✓ Found ${items.length} item nodes`)

  if (items.length > 0) {
    console.log('   First 3 items:')
    for (const item of items.slice(0, 3)) {
      console.log(`     - ${item.content} (${item.systemId ?? item.id})`)
    }
  }
  console.log()

  // Step 3: Find a specific node
  console.log('[3] Finding a specific node by systemId...')
  const tool = findNodeBySystemId(db, 'supertag:tool')
  if (tool) {
    console.log(`   ✓ Found: ${tool.content}`)
    console.log(`   Supertags: ${tool.supertags.map((s) => s.content).join(', ') || 'none'}`)
  } else {
    console.log('   ✗ Node not found')
  }
  console.log()

  // Step 4: Demonstrate property access
  console.log('[4] Accessing node properties...')
  if (items.length > 0) {
    const firstItem = items[0]
    console.log(`   Node: ${firstItem.content}`)
    console.log('   Properties:')

    for (const [fieldName, values] of Object.entries(firstItem.properties)) {
      const displayValue =
        values.length === 1
          ? JSON.stringify(values[0].value)
          : `[${values.map((v) => JSON.stringify(v.value)).join(', ')}]`
      console.log(`     ${fieldName}: ${displayValue}`)
    }
  }
  console.log()

  // Step 5: Get all commands
  console.log('[5] Querying all #Command nodes...')
  const commands = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.COMMAND)
  console.log(`   ✓ Found ${commands.length} command nodes`)

  if (commands.length > 0) {
    console.log('   First 3 commands:')
    for (const cmd of commands.slice(0, 3)) {
      const mode = getProperty<string>(cmd, 'mode') || 'execute'
      console.log(`     - ${cmd.content} [${mode}]`)
    }
  }
  console.log()

  // Step 6: Get all tags
  console.log('[6] Querying all #Tag nodes...')
  const tags = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.TAG)
  console.log(`   ✓ Found ${tags.length} tag nodes`)
  console.log()

  // Summary
  console.log('='.repeat(60))
  console.log('  Summary')
  console.log('='.repeat(60))
  console.log(`   Items:    ${items.length}`)
  console.log(`   Commands: ${commands.length}`)
  console.log(`   Tags:     ${tags.length}`)
  console.log()
  console.log('This example demonstrates how a mini-app can:')
  console.log('  1. Import from @nxus/db/server for database access')
  console.log('  2. Query nodes by supertag with inheritance support')
  console.log('  3. Access node properties using helper functions')
  console.log('  4. Work with the existing nxus data')
  console.log()
}

main().catch(console.error)
