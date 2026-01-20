/**
 * bootstrap-nodes.ts - Insert foundational nodes for node-based architecture
 *
 * Usage: npx tsx scripts/bootstrap-nodes.ts
 *
 * Creates the meta-supertags, system supertags, and field definitions.
 * Uses simplified 2-table schema: nodes + node_properties.
 * Supertags are assigned via field:supertag property values.
 */

import { eq } from 'drizzle-orm'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { uuidv7 } from 'uuidv7'
import { getDatabase, initDatabase } from '../src/db/client'
import {
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
} from '../src/db/node-schema'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// UUID cache for system nodes (systemId -> UUID)
const systemNodeIds = new Map<string, string>()

/**
 * Get or create UUID for a system node
 */
function getSystemNodeId(systemId: string): string {
  if (!systemNodeIds.has(systemId)) {
    systemNodeIds.set(systemId, uuidv7())
  }
  return systemNodeIds.get(systemId)!
}

/**
 * Upsert a node by systemId
 */
function upsertSystemNode(
  db: ReturnType<typeof getDatabase>,
  systemId: string,
  content: string,
): string {
  const existing = db
    .select()
    .from(nodes)
    .where(eq(nodes.systemId, systemId))
    .get()

  if (existing) {
    systemNodeIds.set(systemId, existing.id)
    console.log(`  ✓ Found existing: ${content}`)
    return existing.id
  }

  const id = getSystemNodeId(systemId)
  db.insert(nodes)
    .values({
      id,
      content,
      contentPlain: content.toLowerCase(),
      systemId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run()
  console.log(`  + Created: ${content}`)
  return id
}

/**
 * Add a property to a node (upsert by node+field)
 */
function setProperty(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  fieldNodeId: string,
  value: string,
  order: number = 0,
): void {
  const existing = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.nodeId, nodeId))
    .all()
    .find((p) => p.fieldNodeId === fieldNodeId && p.value === value)

  if (!existing) {
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
}

/**
 * Assign a supertag to a node (via field:supertag property)
 */
function assignSupertag(
  db: ReturnType<typeof getDatabase>,
  nodeId: string,
  supertagNodeId: string,
  supertagFieldId: string,
  order: number = 0,
): void {
  setProperty(
    db,
    nodeId,
    supertagFieldId,
    JSON.stringify(supertagNodeId),
    order,
  )
}

async function bootstrap() {
  console.log('\n' + '='.repeat(50))
  console.log('  Bootstrap Nodes: Creating System Schema')
  console.log('  (Simplified 2-table model)')
  console.log('='.repeat(50) + '\n')

  console.log('[1/5] Initializing database...')
  initDatabase()
  const db = getDatabase()

  // ============================================================================
  // Step 1: Create field:supertag first (chicken-and-egg bootstrap)
  // ============================================================================
  console.log('\n[2/5] Creating core system fields...')

  // field:supertag - the field that assigns supertags to nodes
  const supertagFieldId = upsertSystemNode(
    db,
    SYSTEM_FIELDS.SUPERTAG,
    'supertag',
  )

  // field:extends - for supertag inheritance
  const extendsFieldId = upsertSystemNode(db, SYSTEM_FIELDS.EXTENDS, 'extends')

  // field:field_type - for defining field types
  const fieldTypeFieldId = upsertSystemNode(
    db,
    SYSTEM_FIELDS.FIELD_TYPE,
    'fieldType',
  )

  // ============================================================================
  // Step 2: Create meta-supertags
  // ============================================================================
  console.log('\n[3/5] Creating meta-supertags...')

  // #Supertag - the supertag that makes something a supertag
  const supertagId = upsertSystemNode(
    db,
    SYSTEM_SUPERTAGS.SUPERTAG,
    '#Supertag',
  )

  // #Field - makes something a field definition
  const fieldId = upsertSystemNode(db, SYSTEM_SUPERTAGS.FIELD, '#Field')

  // #System - marks system-level nodes
  const systemId = upsertSystemNode(db, SYSTEM_SUPERTAGS.SYSTEM, '#System')

  // Self-referential: #Supertag has supertag #Supertag
  assignSupertag(db, supertagId, supertagId, supertagFieldId)
  assignSupertag(db, fieldId, supertagId, supertagFieldId)
  assignSupertag(db, systemId, supertagId, supertagFieldId)

  // Mark all as system
  assignSupertag(db, supertagId, systemId, supertagFieldId, 1)
  assignSupertag(db, fieldId, systemId, supertagFieldId, 1)
  assignSupertag(db, systemId, systemId, supertagFieldId, 1)

  // The core fields are #Field #System
  assignSupertag(db, supertagFieldId, fieldId, supertagFieldId)
  assignSupertag(db, supertagFieldId, systemId, supertagFieldId, 1)
  assignSupertag(db, extendsFieldId, fieldId, supertagFieldId)
  assignSupertag(db, extendsFieldId, systemId, supertagFieldId, 1)
  assignSupertag(db, fieldTypeFieldId, fieldId, supertagFieldId)
  assignSupertag(db, fieldTypeFieldId, systemId, supertagFieldId, 1)

  // Set field types
  setProperty(db, supertagFieldId, fieldTypeFieldId, JSON.stringify('nodes'))
  setProperty(db, extendsFieldId, fieldTypeFieldId, JSON.stringify('node'))
  setProperty(db, fieldTypeFieldId, fieldTypeFieldId, JSON.stringify('select'))

  // ============================================================================
  // Step 3: Create entity supertags
  // ============================================================================
  console.log('\n[4/5] Creating entity supertags...')

  const entitySupertags = [
    { systemId: SYSTEM_SUPERTAGS.ITEM, content: '#Item', extends: null },
    {
      systemId: SYSTEM_SUPERTAGS.TOOL,
      content: '#Tool',
      extends: SYSTEM_SUPERTAGS.ITEM,
    },
    {
      systemId: SYSTEM_SUPERTAGS.REPO,
      content: '#Repo',
      extends: SYSTEM_SUPERTAGS.ITEM,
    },
    { systemId: SYSTEM_SUPERTAGS.TAG, content: '#Tag', extends: null },
    { systemId: SYSTEM_SUPERTAGS.COMMAND, content: '#Command', extends: null },
    {
      systemId: SYSTEM_SUPERTAGS.WORKSPACE,
      content: '#Workspace',
      extends: null,
    },
  ]

  for (const st of entitySupertags) {
    const id = upsertSystemNode(db, st.systemId, st.content)
    assignSupertag(db, id, supertagId, supertagFieldId)
    assignSupertag(db, id, systemId, supertagFieldId, 1)
    if (st.extends) {
      const parentId = systemNodeIds.get(st.extends)
      if (parentId) {
        setProperty(db, id, extendsFieldId, JSON.stringify(parentId))
      }
    }
  }

  // ============================================================================
  // Step 4: Create common field definitions
  // ============================================================================
  console.log('\n[5/5] Creating common fields...')

  const commonFields = [
    { systemId: SYSTEM_FIELDS.TYPE, content: 'type', fieldType: 'select' },
    { systemId: SYSTEM_FIELDS.PATH, content: 'path', fieldType: 'text' },
    { systemId: SYSTEM_FIELDS.HOMEPAGE, content: 'homepage', fieldType: 'url' },
    {
      systemId: SYSTEM_FIELDS.DESCRIPTION,
      content: 'description',
      fieldType: 'text',
    },
    { systemId: SYSTEM_FIELDS.COLOR, content: 'color', fieldType: 'text' },
    { systemId: SYSTEM_FIELDS.ICON, content: 'icon', fieldType: 'text' },
    {
      systemId: SYSTEM_FIELDS.LEGACY_ID,
      content: 'legacyId',
      fieldType: 'text',
    },
    {
      systemId: SYSTEM_FIELDS.DEPENDENCIES,
      content: 'dependencies',
      fieldType: 'nodes',
    },
    { systemId: SYSTEM_FIELDS.TAGS, content: 'tags', fieldType: 'nodes' },
    {
      systemId: SYSTEM_FIELDS.COMMANDS,
      content: 'commands',
      fieldType: 'nodes',
    },
    { systemId: SYSTEM_FIELDS.PARENT, content: 'parent', fieldType: 'node' },
    {
      systemId: SYSTEM_FIELDS.CHECK_COMMAND,
      content: 'checkCommand',
      fieldType: 'text',
    },
    {
      systemId: SYSTEM_FIELDS.INSTALL_INSTRUCTIONS,
      content: 'installInstructions',
      fieldType: 'text',
    },
    {
      systemId: SYSTEM_FIELDS.CATEGORY,
      content: 'category',
      fieldType: 'text',
    },
    {
      systemId: SYSTEM_FIELDS.PLATFORM,
      content: 'platform',
      fieldType: 'json',
    },
    { systemId: SYSTEM_FIELDS.DOCS, content: 'docs', fieldType: 'json' },
    // Command-specific
    { systemId: SYSTEM_FIELDS.COMMAND, content: 'command', fieldType: 'text' },
    {
      systemId: SYSTEM_FIELDS.COMMAND_ID,
      content: 'commandId',
      fieldType: 'text',
    },
    { systemId: SYSTEM_FIELDS.MODE, content: 'mode', fieldType: 'select' },
    { systemId: SYSTEM_FIELDS.TARGET, content: 'target', fieldType: 'select' },
    {
      systemId: SYSTEM_FIELDS.SCRIPT_SOURCE,
      content: 'scriptSource',
      fieldType: 'text',
    },
    { systemId: SYSTEM_FIELDS.CWD, content: 'cwd', fieldType: 'text' },
    {
      systemId: SYSTEM_FIELDS.PLATFORMS,
      content: 'platforms',
      fieldType: 'json',
    },
    {
      systemId: SYSTEM_FIELDS.REQUIRES,
      content: 'requires',
      fieldType: 'json',
    },
    { systemId: SYSTEM_FIELDS.OPTIONS, content: 'options', fieldType: 'json' },
    { systemId: SYSTEM_FIELDS.PARAMS, content: 'params', fieldType: 'json' },
    {
      systemId: SYSTEM_FIELDS.REQUIREMENTS,
      content: 'requirements',
      fieldType: 'json',
    },
  ]

  for (const field of commonFields) {
    const id = upsertSystemNode(db, field.systemId, field.content)
    assignSupertag(db, id, fieldId, supertagFieldId)
    assignSupertag(db, id, systemId, supertagFieldId, 1)
    setProperty(db, id, fieldTypeFieldId, JSON.stringify(field.fieldType))
  }

  // ============================================================================
  // Summary
  // ============================================================================
  const nodeCount = db.select().from(nodes).all().length
  const propertyCount = db.select().from(nodeProperties).all().length

  console.log('\n' + '='.repeat(50))
  console.log('✅ Bootstrap complete!')
  console.log(`   Nodes: ${nodeCount}`)
  console.log(`   Properties: ${propertyCount}`)
  console.log('='.repeat(50) + '\n')
}

bootstrap().catch(console.error)
