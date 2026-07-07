/**
 * supertag-fields.test.ts — Tests for supertag field definitions,
 * default-child-supertag, field constraints, and inheritance.
 *
 * These features are part of the Tana gap-closer work:
 * - S1/S2/S3: Self-collecting field options
 * - F2/F3/F7: Field constraints (required, hideWhen, pinned)
 * - F5/F6: Default child supertags & content templates
 * - T1: Supertag configuration
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  FIELD_NAMES,
  type FieldContentName,
  type FieldSystemId,
} from '../schemas/node-schema.js'
import {
  addPropertyValue,
  addNodeSupertag,
  assembleNode,
  assembleNodeWithInheritance,
  clearProperty,
  clearSystemNodeCache,
  createNode,
  getAncestorSupertags,
  getNodeIdsBySupertagWithInheritance,
  getProperty,
  getSupertagFieldDefinitions,
  setProperty,
  type AssembledNode,
} from './node.service.js'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>

function setupTestDatabase(): BetterSQLite3Database<typeof schema> {
  sqlite = new Database(':memory:')
  db = drizzle(sqlite, { schema })

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      content TEXT,
      content_plain TEXT,
      system_id TEXT UNIQUE,
      owner_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER
    )
  `)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_system_id ON nodes(system_id)`)

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS node_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL,
      field_node_id TEXT NOT NULL,
      value TEXT,
      "order" INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_node_properties_node ON node_properties(node_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_node_properties_field ON node_properties(field_node_id)`)

  return db
}

function seedSystemNodes() {
  const now = Date.now()

  const systemFields = [
    { id: 'field-supertag', systemId: SYSTEM_FIELDS.SUPERTAG, content: 'supertag' },
    { id: 'field-extends', systemId: SYSTEM_FIELDS.EXTENDS, content: 'extends' },
    { id: 'field-type', systemId: SYSTEM_FIELDS.FIELD_TYPE, content: 'fieldType' },
    { id: 'field-required', systemId: SYSTEM_FIELDS.REQUIRED, content: 'required' },
    { id: 'field-hide-when', systemId: SYSTEM_FIELDS.HIDE_WHEN, content: 'hideWhen' },
    { id: 'field-pinned', systemId: SYSTEM_FIELDS.PINNED, content: 'pinned' },
    { id: 'field-default-child', systemId: SYSTEM_FIELDS.DEFAULT_CHILD_SUPERTAG, content: 'defaultChildSupertag' },
    { id: 'field-template', systemId: SYSTEM_FIELDS.CONTENT_TEMPLATE, content: 'contentTemplate' },
    { id: 'field-auto-collect', systemId: SYSTEM_FIELDS.AUTO_COLLECT, content: 'autoCollect' },
    { id: 'field-instance-supertag', systemId: SYSTEM_FIELDS.INSTANCE_SUPERTAG, content: 'instanceSupertag' },
    { id: 'field-path', systemId: 'field:path' as FieldSystemId, content: 'path' },
    { id: 'field-description', systemId: 'field:description' as FieldSystemId, content: 'description' },
  ]

  for (const field of systemFields) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${field.id}', '${field.content}', '${field.content.toLowerCase()}', '${field.systemId}', ${now}, ${now})
    `)
  }

  const systemSupertags = [
    { id: 'supertag-supertag', systemId: SYSTEM_SUPERTAGS.SUPERTAG, content: '#Supertag' },
    { id: 'supertag-field', systemId: SYSTEM_SUPERTAGS.FIELD, content: '#Field' },
    { id: 'supertag-item', systemId: SYSTEM_SUPERTAGS.ITEM, content: '#Item' },
    { id: 'supertag-command', systemId: SYSTEM_SUPERTAGS.COMMAND, content: '#Command' },
    { id: 'supertag-tag', systemId: SYSTEM_SUPERTAGS.TAG, content: '#Tag' },
    { id: 'supertag-tool', systemId: 'supertag:tool', content: '#Tool' },
  ]

  for (const st of systemSupertags) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${st.id}', '${st.content}', '${st.content.toLowerCase()}', '${st.systemId}', ${now}, ${now})
    `)
  }

  // Make #Tool extend #Item
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('supertag-tool', 'field-extends', '"supertag-item"', 0, ${now}, ${now})
  `)
}

function createTestSupertag(name: string): { id: string; systemId: string } {
  const suffix = name.toLowerCase().replace(/[^a-z0-9]+/g, '_')
  const systemId = `supertag:test_${suffix}`
  const id = createNode(db, { content: `#${name}`, systemId })
  addNodeSupertag(db, id, SYSTEM_SUPERTAGS.SUPERTAG)
  return { id, systemId }
}

function createTestField(
  name: string,
  slug: string,
): { id: string; systemId: FieldSystemId; fieldName: FieldContentName } {
  const systemId = `field:test_${slug}` as FieldSystemId
  const id = createNode(db, { content: name, systemId })
  addNodeSupertag(db, id, SYSTEM_SUPERTAGS.FIELD)
  setProperty(db, id, SYSTEM_FIELDS.FIELD_TYPE, 'text')
  return { id, systemId, fieldName: name as FieldContentName }
}

describe('supertag field definitions & constraints', () => {
  beforeEach(() => {
    setupTestDatabase()
    clearSystemNodeCache()
    seedSystemNodes()
  })

  afterEach(() => {
    sqlite.close()
  })

  // ─── Supertag Field Definitions ────────────────────────────────────

  describe('getSupertagFieldDefinitions', () => {
    it('returns empty map for supertag with no field definitions', () => {
      const defs = getSupertagFieldDefinitions(db, 'supertag-item')
      expect(defs.size).toBe(0)
    })

    it('returns field definitions declared on a supertag', () => {
      // Create a custom supertag
      const supertagId = createNode(db, { content: 'Person', supertagId: SYSTEM_SUPERTAGS.SUPERTAG })
      // Assign a system ID
      sqlite.exec(`UPDATE nodes SET system_id = 'supertag:person' WHERE id = '${supertagId}'`)

      // Create a field definition node
      const fieldNodeId = createNode(db, { content: 'Email' })
      addNodeSupertag(db, fieldNodeId, SYSTEM_SUPERTAGS.FIELD)
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.FIELD_TYPE, 'email')

      // Assign a system ID to the field
      const fieldSystemId = `field:email_${fieldNodeId.slice(0, 8)}`
      sqlite.exec(`UPDATE nodes SET system_id = '${fieldSystemId}' WHERE id = '${fieldNodeId}'`)

      // Link field to supertag (declare the field in the schema)
      setProperty(db, supertagId, fieldNodeId as unknown as FieldSystemId, JSON.stringify(null))

      const defs = getSupertagFieldDefinitions(db, supertagId)
      expect(defs.size).toBeGreaterThan(0)
      // Field should be discoverable by its system ID or node ID
      let found = false
      for (const [, def] of defs) {
        if (def.fieldNodeId === fieldNodeId) {
          found = true
          expect(def.fieldName).toBe('Email')
        }
      }
      expect(found).toBe(true)
    })
  })

  // ─── Supertag Inheritance ──────────────────────────────────────────

  describe('getAncestorSupertags', () => {
    it('returns empty array for supertag with no extends', () => {
      const ancestors = getAncestorSupertags(db, 'supertag-item')
      expect(ancestors).toEqual([])
    })

    it('returns parent supertag when extends is set', () => {
      // supertag-tool extends supertag-item (from seed)
      const ancestors = getAncestorSupertags(db, 'supertag-tool')
      expect(ancestors).toContain('supertag-item')
    })

    it('diamond story: walks every parent once in deterministic BFS order', () => {
      const root = createTestSupertag('Root')
      const left = createTestSupertag('Left')
      const right = createTestSupertag('Right')
      const child = createTestSupertag('Child')

      addPropertyValue(db, left.id, SYSTEM_FIELDS.EXTENDS, root.id)
      addPropertyValue(db, right.id, SYSTEM_FIELDS.EXTENDS, root.id)
      addPropertyValue(db, child.id, SYSTEM_FIELDS.EXTENDS, left.id)
      addPropertyValue(db, child.id, SYSTEM_FIELDS.EXTENDS, right.id)

      expect(getAncestorSupertags(db, child.id)).toEqual([left.id, right.id, root.id])
    })

    it('cycle story: self-extension and two-node cycles terminate', () => {
      const self = createTestSupertag('SelfCycle')
      const a = createTestSupertag('CycleA')
      const b = createTestSupertag('CycleB')

      addPropertyValue(db, self.id, SYSTEM_FIELDS.EXTENDS, self.id)
      addPropertyValue(db, a.id, SYSTEM_FIELDS.EXTENDS, b.id)
      addPropertyValue(db, b.id, SYSTEM_FIELDS.EXTENDS, a.id)

      expect(getAncestorSupertags(db, self.id)).toEqual([])
      expect(getAncestorSupertags(db, a.id)).toEqual([b.id])
    })
  })

  describe('multi-parent inheritance assembly', () => {
    it('diamond story: inherits root fields once and fields from both parents', () => {
      const root = createTestSupertag('DiamondRoot')
      const left = createTestSupertag('DiamondLeft')
      const right = createTestSupertag('DiamondRight')
      const child = createTestSupertag('DiamondChild')
      const rootField = createTestField('Root Field', 'diamond_root')
      const leftField = createTestField('Left Field', 'diamond_left')
      const rightField = createTestField('Right Field', 'diamond_right')

      setProperty(db, root.id, rootField.systemId, 'root default')
      setProperty(db, left.id, leftField.systemId, 'left default')
      setProperty(db, right.id, rightField.systemId, 'right default')
      addPropertyValue(db, left.id, SYSTEM_FIELDS.EXTENDS, root.id)
      addPropertyValue(db, right.id, SYSTEM_FIELDS.EXTENDS, root.id)
      addPropertyValue(db, child.id, SYSTEM_FIELDS.EXTENDS, left.id)
      addPropertyValue(db, child.id, SYSTEM_FIELDS.EXTENDS, right.id)

      const nodeId = createNode(db, { content: 'Diamond instance' })
      addNodeSupertag(db, nodeId, child.systemId)

      const assembled = assembleNodeWithInheritance(db, nodeId)
      if (!assembled) throw new Error('Expected assembled diamond instance')
      expect(getProperty(assembled, rootField.fieldName)).toBe('root default')
      expect(getProperty(assembled, leftField.fieldName)).toBe('left default')
      expect(getProperty(assembled, rightField.fieldName)).toBe('right default')
    })

    it('deterministic order story: earlier direct parent wins same-field diamond ties', () => {
      const left = createTestSupertag('OrderLeft')
      const right = createTestSupertag('OrderRight')
      const child = createTestSupertag('OrderChild')
      const sharedField = createTestField('Shared Field', 'shared_order')

      setProperty(db, left.id, sharedField.systemId, 'left default')
      setProperty(db, right.id, sharedField.systemId, 'right default')
      addPropertyValue(db, child.id, SYSTEM_FIELDS.EXTENDS, left.id)
      addPropertyValue(db, child.id, SYSTEM_FIELDS.EXTENDS, right.id)

      const nodeId = createNode(db, { content: 'Order instance' })
      addNodeSupertag(db, nodeId, child.systemId)

      const assembled = assembleNodeWithInheritance(db, nodeId)
      if (!assembled) throw new Error('Expected assembled order instance')
      expect(getProperty(assembled, sharedField.fieldName)).toBe('left default')
    })

    it('single-parent seed story: existing #Tool inherits #Item unchanged', () => {
      const itemField = createTestField('Seed Field', 'seed_field')
      setProperty(db, 'supertag-item', itemField.systemId, 'seed default')

      const nodeId = createNode(db, { content: 'Tool instance' })
      addNodeSupertag(db, nodeId, 'supertag:tool')

      const assembled = assembleNodeWithInheritance(db, nodeId)
      if (!assembled) throw new Error('Expected assembled tool instance')
      expect(getProperty(assembled, itemField.fieldName)).toBe('seed default')
    })
  })

  describe('supertag query inheritance', () => {
    it('symmetry story: descendant expansion follows the same DAG depth as ancestors', () => {
      const root = createTestSupertag('QueryRoot')
      const middle = createTestSupertag('QueryMiddle')
      const leaf = createTestSupertag('QueryLeaf')

      addPropertyValue(db, middle.id, SYSTEM_FIELDS.EXTENDS, root.id)
      addPropertyValue(db, leaf.id, SYSTEM_FIELDS.EXTENDS, middle.id)

      const nodeId = createNode(db, { content: 'Leaf instance' })
      addNodeSupertag(db, nodeId, leaf.systemId)

      expect(getAncestorSupertags(db, leaf.id)).toEqual([middle.id, root.id])
      expect(getNodeIdsBySupertagWithInheritance(db, root.id)).toContain(nodeId)
    })
  })

  // ─── Field Constraints ─────────────────────────────────────────────

  describe('field constraint properties', () => {
    let fieldNodeId: string

    beforeEach(() => {
      // Create a field definition node
      fieldNodeId = createNode(db, { content: 'Priority' })
      addNodeSupertag(db, fieldNodeId, SYSTEM_SUPERTAGS.FIELD)
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.FIELD_TYPE, 'select')
    })

    it('sets and reads "required" constraint on a field node', () => {
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.REQUIRED, 'true')

      const node = assembleNode(db, fieldNodeId) as AssembledNode
      const required = getProperty(node, FIELD_NAMES.REQUIRED)
      expect(required).toBe('true')
    })

    it('sets and reads "hideWhen" constraint', () => {
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.HIDE_WHEN, 'when_empty')

      const node = assembleNode(db, fieldNodeId) as AssembledNode
      const hideWhen = getProperty(node, FIELD_NAMES.HIDE_WHEN)
      expect(hideWhen).toBe('when_empty')
    })

    it('sets and reads "pinned" constraint', () => {
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.PINNED, 'true')

      const node = assembleNode(db, fieldNodeId) as AssembledNode
      const pinned = getProperty(node, FIELD_NAMES.PINNED)
      expect(pinned).toBe('true')
    })

    it('clears constraint with clearProperty', () => {
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.REQUIRED, 'true')
      clearProperty(db, fieldNodeId, SYSTEM_FIELDS.REQUIRED)

      const node = assembleNode(db, fieldNodeId) as AssembledNode
      const required = getProperty(node, FIELD_NAMES.REQUIRED)
      expect(required).toBeUndefined()
    })

    it('updates hideWhen from one value to another', () => {
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.HIDE_WHEN, 'when_empty')
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.HIDE_WHEN, 'when_not_empty')

      const node = assembleNode(db, fieldNodeId) as AssembledNode
      const hideWhen = getProperty(node, FIELD_NAMES.HIDE_WHEN)
      expect(hideWhen).toBe('when_not_empty')
    })

    it('sets multiple constraints on the same field node', () => {
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.REQUIRED, 'true')
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.PINNED, 'true')
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.HIDE_WHEN, 'never')

      const node = assembleNode(db, fieldNodeId) as AssembledNode
      expect(getProperty(node, FIELD_NAMES.REQUIRED)).toBe('true')
      expect(getProperty(node, FIELD_NAMES.PINNED)).toBe('true')
      expect(getProperty(node, FIELD_NAMES.HIDE_WHEN)).toBe('never')
    })
  })

  // ─── Default Child Supertag ────────────────────────────────────────

  describe('default child supertag configuration', () => {
    it('sets and reads default_child_supertag on a supertag node', () => {
      const parentTag = createNode(db, { content: 'Project', supertagId: SYSTEM_SUPERTAGS.SUPERTAG })
      const childTag = createNode(db, { content: 'Task', supertagId: SYSTEM_SUPERTAGS.SUPERTAG })

      setProperty(db, parentTag, SYSTEM_FIELDS.DEFAULT_CHILD_SUPERTAG, JSON.stringify(childTag))

      const node = assembleNode(db, parentTag) as AssembledNode
      const defaultChild = getProperty<string>(node, FIELD_NAMES.DEFAULT_CHILD_SUPERTAG)
      expect(defaultChild).toBe(JSON.stringify(childTag))
    })

    it('clears default child supertag', () => {
      const parentTag = createNode(db, { content: 'Project', supertagId: SYSTEM_SUPERTAGS.SUPERTAG })
      const childTag = createNode(db, { content: 'Task', supertagId: SYSTEM_SUPERTAGS.SUPERTAG })

      setProperty(db, parentTag, SYSTEM_FIELDS.DEFAULT_CHILD_SUPERTAG, JSON.stringify(childTag))
      clearProperty(db, parentTag, SYSTEM_FIELDS.DEFAULT_CHILD_SUPERTAG)

      const node = assembleNode(db, parentTag) as AssembledNode
      const defaultChild = getProperty<string>(node, FIELD_NAMES.DEFAULT_CHILD_SUPERTAG)
      expect(defaultChild).toBeUndefined()
    })
  })

  // ─── Content Template ──────────────────────────────────────────────

  describe('content template configuration', () => {
    it('sets and reads content_template as JSON', () => {
      const tagId = createNode(db, { content: 'Meeting', supertagId: SYSTEM_SUPERTAGS.SUPERTAG })
      const template = JSON.stringify({ children: [{ content: 'Agenda' }, { content: 'Notes' }, { content: 'Action items' }] })

      setProperty(db, tagId, SYSTEM_FIELDS.CONTENT_TEMPLATE, template)

      const node = assembleNode(db, tagId) as AssembledNode
      const stored = getProperty<string>(node, FIELD_NAMES.CONTENT_TEMPLATE)
      expect(stored).toBe(template)

      const parsed = JSON.parse(stored!)
      expect(parsed.children).toHaveLength(3)
      expect(parsed.children[0].content).toBe('Agenda')
    })
  })

  // ─── Supertag with Field + Constraints ─────────────────────────────

  describe('supertag with field definitions and constraints', () => {
    it('creates a supertag with a required, pinned field', () => {
      // Create supertag
      const supertagId = createNode(db, { content: 'Bug Report', supertagId: SYSTEM_SUPERTAGS.SUPERTAG })
      sqlite.exec(`UPDATE nodes SET system_id = 'supertag:bug_report' WHERE id = '${supertagId}'`)

      // Create field
      const fieldNodeId = createNode(db, { content: 'Severity' })
      addNodeSupertag(db, fieldNodeId, SYSTEM_SUPERTAGS.FIELD)
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.FIELD_TYPE, 'select')
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.REQUIRED, 'true')
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.PINNED, 'true')
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.HIDE_WHEN, 'never')
      const fieldSystemId = `field:severity_${fieldNodeId.slice(0, 8)}`
      sqlite.exec(`UPDATE nodes SET system_id = '${fieldSystemId}' WHERE id = '${fieldNodeId}'`)

      // Link field to supertag
      setProperty(db, supertagId, fieldNodeId as unknown as FieldSystemId, JSON.stringify(null))

      // Verify field is part of the supertag's definitions
      const defs = getSupertagFieldDefinitions(db, supertagId)
      let foundField = false
      for (const [, def] of defs) {
        if (def.fieldNodeId === fieldNodeId) {
          foundField = true
        }
      }
      expect(foundField).toBe(true)

      // Verify constraint properties on the field node
      const fieldNode = assembleNode(db, fieldNodeId) as AssembledNode
      expect(getProperty(fieldNode, FIELD_NAMES.REQUIRED)).toBe('true')
      expect(getProperty(fieldNode, FIELD_NAMES.PINNED)).toBe('true')
      expect(getProperty(fieldNode, FIELD_NAMES.HIDE_WHEN)).toBe('never')
      expect(getProperty(fieldNode, FIELD_NAMES.FIELD_TYPE)).toBe('select')
    })
  })

  // ─── Auto-collect configuration ────────────────────────────────────

  describe('auto-collect field configuration', () => {
    it('sets auto_collect on a field node', () => {
      const fieldNodeId = createNode(db, { content: 'Category' })
      addNodeSupertag(db, fieldNodeId, SYSTEM_SUPERTAGS.FIELD)
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.FIELD_TYPE, 'select')
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.AUTO_COLLECT, 'true')

      const node = assembleNode(db, fieldNodeId) as AssembledNode
      expect(getProperty(node, FIELD_NAMES.AUTO_COLLECT)).toBe('true')
    })
  })

  // ─── Instance supertag configuration ───────────────────────────────

  describe('instance supertag field configuration', () => {
    it('sets instance_supertag reference on a field node', () => {
      // Create a supertag for instances
      const personTagId = createNode(db, { content: 'Person', supertagId: SYSTEM_SUPERTAGS.SUPERTAG })

      // Create an instance-type field
      const fieldNodeId = createNode(db, { content: 'Assigned To' })
      addNodeSupertag(db, fieldNodeId, SYSTEM_SUPERTAGS.FIELD)
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.FIELD_TYPE, 'instance')
      setProperty(db, fieldNodeId, SYSTEM_FIELDS.INSTANCE_SUPERTAG, JSON.stringify(personTagId))

      const node = assembleNode(db, fieldNodeId) as AssembledNode
      expect(getProperty(node, FIELD_NAMES.FIELD_TYPE)).toBe('instance')
      expect(getProperty(node, FIELD_NAMES.INSTANCE_SUPERTAG)).toBe(JSON.stringify(personTagId))
    })
  })
})
