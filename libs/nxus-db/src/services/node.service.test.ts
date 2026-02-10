/**
 * node.service.test.ts - Unit tests for node service operations
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS, FIELD_NAMES, type FieldSystemId, type FieldContentName } from '../schemas/node-schema.js'
import {
  assembleNode,
  clearSystemNodeCache,
  createNode,
  deleteNode,
  findNode,
  findNodeById,
  findNodeBySystemId,
  getNodesBySupertagWithInheritance,
  getProperty,
  getPropertyValues,
  getSystemNode,
  setProperty,
  updateNodeContent,
  type AssembledNode,
} from './node.service.js'

// In-memory database for testing
let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>

function setupTestDatabase(): BetterSQLite3Database<typeof schema> {
  sqlite = new Database(':memory:')
  db = drizzle(sqlite, { schema })

  // Create tables
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

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_nodes_system_id ON nodes(system_id)
  `)

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

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_node_properties_node ON node_properties(node_id)
  `)

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_node_properties_field ON node_properties(field_node_id)
  `)

  return db
}

function seedSystemNodes() {
  const now = Date.now()

  // Create system field nodes
  const systemFields = [
    { id: 'field-supertag', systemId: SYSTEM_FIELDS.SUPERTAG, content: 'Supertag' },
    { id: 'field-extends', systemId: SYSTEM_FIELDS.EXTENDS, content: 'Extends' },
    { id: 'field-type', systemId: SYSTEM_FIELDS.FIELD_TYPE, content: 'Field Type' },
    { id: 'field-path', systemId: 'field:path', content: 'path' },
    { id: 'field-description', systemId: 'field:description', content: 'description' },
  ]

  for (const field of systemFields) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${field.id}', '${field.content}', '${field.content.toLowerCase()}', '${field.systemId}', ${now}, ${now})
    `)
  }

  // Create system supertag nodes
  const systemSupertags = [
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

  // Make #Tool extend #Item (for inheritance testing)
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('supertag-tool', 'field-extends', '"supertag-item"', 0, ${now}, ${now})
  `)
}

describe('node.service', () => {
  beforeEach(() => {
    setupTestDatabase()
    clearSystemNodeCache()
    seedSystemNodes()
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('getSystemNode', () => {
    it('should find system node by systemId', () => {
      const node = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
      expect(node).not.toBeNull()
      expect(node?.id).toBe('field-supertag')
      expect(node?.content).toBe('Supertag')
    })

    it('should cache system nodes', () => {
      const node1 = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
      const node2 = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
      expect(node1).toBe(node2) // Same reference from cache
    })

    it('should return null for non-existent systemId', () => {
      const node = getSystemNode(db, 'non-existent:id')
      expect(node).toBeNull()
    })
  })

  describe('createNode', () => {
    it('should create a basic node', () => {
      const nodeId = createNode(db, { content: 'Test Node' })
      expect(nodeId).toBeTruthy()
      expect(nodeId.length).toBeGreaterThan(0)

      const node = findNodeById(db, nodeId)
      expect(node).not.toBeNull()
      expect(node?.content).toBe('Test Node')
    })

    it('should create a node with systemId', () => {
      const nodeId = createNode(db, {
        content: 'System Test',
        systemId: 'test:system-node',
      })

      const node = findNodeBySystemId(db, 'test:system-node')
      expect(node).not.toBeNull()
      expect(node?.id).toBe(nodeId)
      expect(node?.content).toBe('System Test')
    })

    it('should create a node with supertag', () => {
      const nodeId = createNode(db, {
        content: 'My Item',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })

      const node = findNodeById(db, nodeId)
      expect(node).not.toBeNull()
      expect(node?.supertags.length).toBe(1)
      expect(node?.supertags[0].systemId).toBe(SYSTEM_SUPERTAGS.ITEM)
    })
  })

  describe('findNode', () => {
    it('should find node by UUID', () => {
      const nodeId = createNode(db, { content: 'Find Me' })
      const node = findNode(db, nodeId)
      expect(node).not.toBeNull()
      expect(node?.content).toBe('Find Me')
    })

    it('should find node by systemId', () => {
      createNode(db, {
        content: 'System Find',
        systemId: 'test:findable',
      })

      const node = findNode(db, 'test:findable')
      expect(node).not.toBeNull()
      expect(node?.content).toBe('System Find')
    })

    it('should return null for non-existent node', () => {
      const node = findNode(db, 'non-existent-id')
      expect(node).toBeNull()
    })
  })

  describe('updateNodeContent', () => {
    it('should update node content', () => {
      const nodeId = createNode(db, { content: 'Original' })
      updateNodeContent(db, nodeId, 'Updated Content')

      const node = findNodeById(db, nodeId)
      expect(node?.content).toBe('Updated Content')
    })
  })

  describe('deleteNode', () => {
    it('should soft-delete a node', () => {
      const nodeId = createNode(db, { content: 'To Delete' })
      deleteNode(db, nodeId)

      const node = findNodeById(db, nodeId)
      expect(node?.deletedAt).not.toBeNull()
    })
  })

  describe('setProperty', () => {
    it('should set a property on a node', () => {
      const nodeId = createNode(db, { content: 'Node With Property' })
      setProperty(db, nodeId, SYSTEM_FIELDS.PATH, '/usr/bin/test')

      const node = findNodeById(db, nodeId)
      expect(node?.properties[FIELD_NAMES.PATH]).toBeDefined()
      expect(node?.properties[FIELD_NAMES.PATH][0].value).toBe('/usr/bin/test')
    })

    it('should update existing property', () => {
      const nodeId = createNode(db, { content: 'Node' })
      setProperty(db, nodeId, SYSTEM_FIELDS.PATH, '/first/path')
      setProperty(db, nodeId, SYSTEM_FIELDS.PATH, '/second/path')

      const node = findNodeById(db, nodeId)
      expect(node?.properties[FIELD_NAMES.PATH]).toHaveLength(1)
      expect(node?.properties[FIELD_NAMES.PATH][0].value).toBe('/second/path')
    })

    it('should throw for non-existent field', () => {
      const nodeId = createNode(db, { content: 'Node' })
      expect(() => {
        setProperty(db, nodeId, 'non-existent:field' as FieldSystemId, 'value')
      }).toThrow('Field not found')
    })
  })

  describe('assembleNode', () => {
    it('should assemble node with all properties', () => {
      const nodeId = createNode(db, {
        content: 'Full Node',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })
      setProperty(db, nodeId, SYSTEM_FIELDS.PATH, '/test/path')
      setProperty(db, nodeId, SYSTEM_FIELDS.DESCRIPTION, 'A test description')

      const node = assembleNode(db, nodeId)
      expect(node).not.toBeNull()
      expect(node?.content).toBe('Full Node')
      expect(node?.supertags.length).toBe(1)
      expect(node?.properties[FIELD_NAMES.PATH]).toBeDefined()
      expect(node?.properties[FIELD_NAMES.DESCRIPTION]).toBeDefined()
    })
  })

  describe('getNodesBySupertagWithInheritance', () => {
    it('should get nodes with direct supertag', () => {
      createNode(db, {
        content: 'Item 1',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })
      createNode(db, {
        content: 'Item 2',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })

      const items = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)
      expect(items.length).toBe(2)
    })

    it('should include nodes with inherited supertags', () => {
      // Create an item with #Item supertag
      createNode(db, {
        content: 'Direct Item',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })

      // Create a tool with #Tool supertag (which extends #Item)
      createNode(db, {
        content: 'Tool (inherits Item)',
        supertagId: 'supertag:tool',
      })

      // Query for #Item should include both
      const items = getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)
      expect(items.length).toBe(2)
      expect(items.map((n) => n.content)).toContain('Direct Item')
      expect(items.map((n) => n.content)).toContain('Tool (inherits Item)')
    })
  })

  describe('property helpers', () => {
    it('getProperty should return single value', () => {
      const nodeId = createNode(db, { content: 'Node' })
      setProperty(db, nodeId, SYSTEM_FIELDS.PATH, '/my/path')

      const node = findNodeById(db, nodeId) as AssembledNode
      const path = getProperty<string>(node, FIELD_NAMES.PATH)
      expect(path).toBe('/my/path')
    })

    it('getProperty should return undefined for missing field', () => {
      const nodeId = createNode(db, { content: 'Node' })
      const node = findNodeById(db, nodeId) as AssembledNode
      const missing = getProperty<string>(node, 'NonExistent' as FieldContentName)
      expect(missing).toBeUndefined()
    })

    it('getPropertyValues should return array of values', () => {
      const nodeId = createNode(db, { content: 'Node' })
      setProperty(db, nodeId, SYSTEM_FIELDS.PATH, 'value1', 0)
      setProperty(db, nodeId, SYSTEM_FIELDS.PATH, 'value2', 1)

      const node = findNodeById(db, nodeId) as AssembledNode
      const values = getPropertyValues<string>(node, FIELD_NAMES.PATH)
      expect(values).toHaveLength(2)
      expect(values).toContain('value1')
      expect(values).toContain('value2')
    })
  })
})
