/**
 * inspect-node.ts - Dev tool to inspect a node and its properties
 *
 * Usage:
 *   npx tsx scripts/inspect-node.ts <systemId|nodeId>
 *
 * Examples:
 *   npx tsx scripts/inspect-node.ts supertag:item
 *   npx tsx scripts/inspect-node.ts item:claude-code
 *   npx tsx scripts/inspect-node.ts abc123-uuid
 */

import { eq, getDatabase,
  initDatabase,
  nodeProperties,
  nodes,
  or } from '@nxus/db/server'

interface AssembledNode {
  id: string
  content: string | null
  systemId: string | null
  ownerId: string | null
  createdAt: Date
  updatedAt: Date
  properties: Record<
    string,
    Array<{ value: unknown; fieldName: string; order: number }>
  >
  supertags: Array<string>
  rawProperties: Array<{
    fieldNodeId: string
    fieldName: string
    value: string
    order: number
  }>
}

async function inspectNode(identifier: string) {
  initDatabase()
  const db = getDatabase()

  // Find node by systemId or id
  const node = db
    .select()
    .from(nodes)
    .where(or(eq(nodes.systemId, identifier), eq(nodes.id, identifier)))
    .get()

  if (!node) {
    console.error(`❌ Node not found: ${identifier}`)
    console.log('\nAvailable system nodes:')
    const systemNodes = db
      .select({ systemId: nodes.systemId, content: nodes.content })
      .from(nodes)
      .all()
      .filter((n) => n.systemId)
      .slice(0, 20)
    for (const n of systemNodes) {
      console.log(`  ${n.systemId} → ${n.content}`)
    }
    return
  }

  // Get all properties
  const props = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.nodeId, node.id))
    .all()

  // Build field name lookup
  const fieldNameCache = new Map<string, string>()
  for (const prop of props) {
    if (!fieldNameCache.has(prop.fieldNodeId)) {
      const fieldNode = db
        .select()
        .from(nodes)
        .where(eq(nodes.id, prop.fieldNodeId))
        .get()
      fieldNameCache.set(
        prop.fieldNodeId,
        fieldNode?.content || prop.fieldNodeId,
      )
    }
  }

  // Assemble node
  const assembled: AssembledNode = {
    id: node.id,
    content: node.content,
    systemId: node.systemId,
    ownerId: node.ownerId,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    properties: {},
    supertags: [],
    rawProperties: [],
  }

  // Group by field
  for (const prop of props) {
    const fieldName = fieldNameCache.get(prop.fieldNodeId) || prop.fieldNodeId
    let parsedValue: unknown = prop.value
    try {
      parsedValue = JSON.parse(prop.value || 'null')
    } catch {
      // Keep as string
    }

    if (!assembled.properties[fieldName]) {
      assembled.properties[fieldName] = []
    }
    assembled.properties[fieldName].push({
      value: parsedValue,
      fieldName,
      order: prop.order || 0,
    })

    assembled.rawProperties.push({
      fieldNodeId: prop.fieldNodeId,
      fieldName,
      value: prop.value || '',
      order: prop.order || 0,
    })

    // Track supertags
    if (fieldName === 'supertag') {
      const supertagNode = db
        .select()
        .from(nodes)
        .where(eq(nodes.id, parsedValue as string))
        .get()
      if (supertagNode) {
        assembled.supertags.push(supertagNode.content || supertagNode.id)
      }
    }
  }

  // Pretty print
  console.log('\n' + '='.repeat(60))
  console.log(`  Node: ${assembled.content || '(no content)'}`)
  console.log('='.repeat(60))
  console.log(`\n📌 Core Fields:`)
  console.log(`   ID: ${assembled.id}`)
  console.log(`   SystemId: ${assembled.systemId || '(none)'}`)
  console.log(`   OwnerId: ${assembled.ownerId || '(none)'}`)
  console.log(`   Created: ${assembled.createdAt}`)

  if (assembled.supertags.length > 0) {
    console.log(`\n🏷️  Supertags: ${assembled.supertags.join(', ')}`)
  }

  console.log(
    `\n📋 Properties (${Object.keys(assembled.properties).length} fields):`,
  )
  for (const [fieldName, values] of Object.entries(assembled.properties)) {
    if (fieldName === 'supertag') continue // Already shown
    if (values.length === 1 && values[0]) {
      const v = values[0].value
      const display =
        typeof v === 'string' && v.length > 50 ? v.slice(0, 50) + '...' : v
      console.log(`   ${fieldName}: ${JSON.stringify(display)}`)
    } else {
      console.log(`   ${fieldName}: [${values.length} values]`)
      for (const val of values) {
        console.log(`     - ${JSON.stringify(val.value)}`)
      }
    }
  }

  console.log('\n' + '='.repeat(60) + '\n')
}

// Parse args
const identifier = process.argv[2]
if (!identifier) {
  console.log('Usage: npx tsx scripts/inspect-node.ts <systemId|nodeId>')
  console.log('\nExamples:')
  console.log('  npx tsx scripts/inspect-node.ts supertag:item')
  console.log('  npx tsx scripts/inspect-node.ts item:claude-code')
  process.exit(1)
}

inspectNode(identifier).catch(console.error)
