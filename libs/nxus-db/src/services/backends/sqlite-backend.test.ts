/**
 * sqlite-backend.test.ts - Tests for the SqliteBackend wrapper
 *
 * Verifies that SqliteBackend correctly delegates to the underlying
 * node.service.ts functions through the async NodeBackend interface.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../schemas/item-schema.js'
import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  FIELD_NAMES,
} from '../../schemas/node-schema.js'
import { clearSystemNodeCache } from '../node.service.js'
import { SqliteBackend } from './sqlite-backend.js'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let backend: SqliteBackend

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

  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_nodes_system_id ON nodes(system_id)`,
  )

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

  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_node_properties_node ON node_properties(node_id)`,
  )

  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_node_properties_field ON node_properties(field_node_id)`,
  )

  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_node_properties_value ON node_properties(value)`,
  )

  return db
}

function seedSystemNodes() {
  const now = Date.now()

  const systemFields = [
    { id: 'field-supertag', systemId: SYSTEM_FIELDS.SUPERTAG, content: 'Supertag' },
    { id: 'field-extends', systemId: SYSTEM_FIELDS.EXTENDS, content: 'Extends' },
    { id: 'field-type', systemId: SYSTEM_FIELDS.FIELD_TYPE, content: 'Field Type' },
    { id: 'field-path', systemId: 'field:path', content: 'path' },
    { id: 'field-description', systemId: 'field:description', content: 'description' },
    { id: 'field-status', systemId: 'field:status', content: 'status' },
    { id: 'field-parent', systemId: 'field:parent', content: 'parent' },
  ]

  for (const field of systemFields) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${field.id}', '${field.content}', '${field.content.toLowerCase()}', '${field.systemId}', ${now}, ${now})
    `)
  }

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

describe('SqliteBackend', () => {
  beforeEach(() => {
    setupTestDatabase()
    clearSystemNodeCache()
    seedSystemNodes()

    backend = new SqliteBackend()
    backend.initWithDb(db)
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('init guard', () => {
    it('should throw when calling methods before init', async () => {
      const uninitBackend = new SqliteBackend()
      await expect(uninitBackend.assembleNode('some-id')).rejects.toThrow(
        'SqliteBackend not initialized',
      )
    })
  })

  describe('createNode → assembleNode round-trip', () => {
    it('should create a node and assemble it back', async () => {
      const nodeId = await backend.createNode({ content: 'Test Node' })
      expect(nodeId).toBeTruthy()

      const node = await backend.assembleNode(nodeId)
      expect(node).not.toBeNull()
      expect(node!.content).toBe('Test Node')
      expect(node!.id).toBe(nodeId)
    })

    it('should create a node with systemId', async () => {
      const nodeId = await backend.createNode({
        content: 'System Node',
        systemId: 'test:backend-node',
      })

      const node = await backend.findNodeBySystemId('test:backend-node')
      expect(node).not.toBeNull()
      expect(node!.id).toBe(nodeId)
      expect(node!.systemId).toBe('test:backend-node')
    })

    it('should create a node with supertag', async () => {
      const nodeId = await backend.createNode({
        content: 'My Item',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })

      const node = await backend.assembleNode(nodeId)
      expect(node).not.toBeNull()
      expect(node!.supertags).toHaveLength(1)
      expect(node!.supertags[0].systemId).toBe(SYSTEM_SUPERTAGS.ITEM)
    })
  })

  describe('setProperty → assembleNode → verify property', () => {
    it('should set a property and see it in assembly', async () => {
      const nodeId = await backend.createNode({ content: 'Node' })
      await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/usr/bin/test')

      const node = await backend.assembleNode(nodeId)
      expect(node).not.toBeNull()
      expect(node!.properties[FIELD_NAMES.PATH]).toBeDefined()
      expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/usr/bin/test')
    })

    it('should update an existing property', async () => {
      const nodeId = await backend.createNode({ content: 'Node' })
      await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/first')
      await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/second')

      const node = await backend.assembleNode(nodeId)
      expect(node!.properties[FIELD_NAMES.PATH]).toHaveLength(1)
      expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/second')
    })
  })

  describe('addPropertyValue (multi-value)', () => {
    it('should add multiple values with correct ordering', async () => {
      const nodeId = await backend.createNode({ content: 'Node' })
      await backend.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'val1')
      await backend.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'val2')
      await backend.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'val3')

      const node = await backend.assembleNode(nodeId)
      const pathProps = node!.properties[FIELD_NAMES.PATH]
      expect(pathProps).toHaveLength(3)

      // Verify ordering
      const sorted = [...pathProps].sort((a, b) => a.order - b.order)
      expect(sorted[0].value).toBe('val1')
      expect(sorted[1].value).toBe('val2')
      expect(sorted[2].value).toBe('val3')
    })
  })

  describe('clearProperty', () => {
    it('should remove all values for a field', async () => {
      const nodeId = await backend.createNode({ content: 'Node' })
      await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/test')

      const before = await backend.assembleNode(nodeId)
      expect(before!.properties[FIELD_NAMES.PATH]).toBeDefined()

      await backend.clearProperty(nodeId, SYSTEM_FIELDS.PATH)

      const after = await backend.assembleNode(nodeId)
      expect(after!.properties[FIELD_NAMES.PATH]).toBeUndefined()
    })
  })

  describe('addNodeSupertag → assembleNode → verify supertag', () => {
    it('should add a supertag to a node', async () => {
      const nodeId = await backend.createNode({ content: 'Plain Node' })

      const added = await backend.addNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
      expect(added).toBe(true)

      const node = await backend.assembleNode(nodeId)
      expect(node!.supertags).toHaveLength(1)
      expect(node!.supertags[0].systemId).toBe(SYSTEM_SUPERTAGS.ITEM)
    })

    it('should return false when adding duplicate supertag', async () => {
      const nodeId = await backend.createNode({
        content: 'Item',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })

      const added = await backend.addNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
      expect(added).toBe(false)
    })
  })

  describe('removeNodeSupertag', () => {
    it('should remove a supertag from a node', async () => {
      const nodeId = await backend.createNode({
        content: 'Item',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })

      const removed = await backend.removeNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
      expect(removed).toBe(true)

      const node = await backend.assembleNode(nodeId)
      expect(node!.supertags).toHaveLength(0)
    })
  })

  describe('deleteNode → findNodeById returns soft-deleted', () => {
    it('should soft-delete a node', async () => {
      const nodeId = await backend.createNode({ content: 'To Delete' })
      await backend.deleteNode(nodeId)

      const node = await backend.findNodeById(nodeId)
      expect(node).not.toBeNull()
      expect(node!.deletedAt).not.toBeNull()
    })
  })

  describe('updateNodeContent', () => {
    it('should update the content of a node', async () => {
      const nodeId = await backend.createNode({ content: 'Original' })
      await backend.updateNodeContent(nodeId, 'Updated')

      const node = await backend.assembleNode(nodeId)
      expect(node!.content).toBe('Updated')
    })
  })

  describe('linkNodes', () => {
    it('should link two nodes via a field', async () => {
      const parentId = await backend.createNode({ content: 'Parent' })
      const childId = await backend.createNode({ content: 'Child' })

      await backend.linkNodes(childId, SYSTEM_FIELDS.PARENT, parentId)

      const child = await backend.assembleNode(childId)
      expect(child!.properties[FIELD_NAMES.PARENT]).toBeDefined()
      expect(child!.properties[FIELD_NAMES.PARENT][0].value).toBe(parentId)
    })
  })

  describe('getNodeSupertags', () => {
    it('should return supertag info for a node', async () => {
      const nodeId = await backend.createNode({
        content: 'Tagged Node',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })

      const supertags = await backend.getNodeSupertags(nodeId)
      expect(supertags).toHaveLength(1)
      expect(supertags[0].systemId).toBe(SYSTEM_SUPERTAGS.ITEM)
      expect(supertags[0].content).toBe('#Item')
    })
  })

  describe('getNodesBySupertags', () => {
    it('should find nodes by supertag', async () => {
      await backend.createNode({
        content: 'Item 1',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })
      await backend.createNode({
        content: 'Item 2',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })
      await backend.createNode({
        content: 'Command',
        supertagId: SYSTEM_SUPERTAGS.COMMAND,
      })

      const items = await backend.getNodesBySupertags([SYSTEM_SUPERTAGS.ITEM])
      expect(items).toHaveLength(2)
    })
  })

  describe('assembleNodeWithInheritance', () => {
    it('should include inherited supertag fields', async () => {
      // Set a field definition on the #Item supertag (default path for items)
      await backend.setProperty(
        'supertag-item',
        SYSTEM_FIELDS.DESCRIPTION,
        'default-description',
      )

      // Create a tool (which extends #Item)
      const nodeId = await backend.createNode({
        content: 'My Tool',
        supertagId: 'supertag:tool',
      })

      const node = await backend.assembleNodeWithInheritance(nodeId)
      expect(node).not.toBeNull()
      // The inherited description from #Item should appear
      expect(node!.properties[FIELD_NAMES.DESCRIPTION]).toBeDefined()
      expect(node!.properties[FIELD_NAMES.DESCRIPTION][0].value).toBe(
        'default-description',
      )
    })
  })

  describe('getNodesBySupertagWithInheritance', () => {
    it('should include nodes with inherited supertags', async () => {
      await backend.createNode({
        content: 'Direct Item',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })
      await backend.createNode({
        content: 'Tool (inherits Item)',
        supertagId: 'supertag:tool',
      })

      const items = await backend.getNodesBySupertagWithInheritance(
        SYSTEM_SUPERTAGS.ITEM,
      )
      expect(items).toHaveLength(2)
      expect(items.map((n) => n.content)).toContain('Direct Item')
      expect(items.map((n) => n.content)).toContain('Tool (inherits Item)')
    })
  })

  describe('getAncestorSupertags', () => {
    it('should walk the extends chain', async () => {
      const ancestors = await backend.getAncestorSupertags('supertag-tool')
      expect(ancestors).toContain('supertag-item')
    })
  })

  describe('evaluateQuery', () => {
    it('should evaluate a supertag query', async () => {
      await backend.createNode({
        content: 'Item A',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })
      await backend.createNode({
        content: 'Item B',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })

      const result = await backend.evaluateQuery({
        filters: [
          {
            type: 'supertag',
            supertagId: SYSTEM_SUPERTAGS.ITEM,
            includeInherited: false,
          },
        ],
        limit: 500,
      })

      expect(result.nodes).toHaveLength(2)
      expect(result.totalCount).toBe(2)
      expect(result.evaluatedAt).toBeInstanceOf(Date)
    })
  })

  describe('save', () => {
    it('should be a no-op (does not throw)', async () => {
      await expect(backend.save()).resolves.toBeUndefined()
    })
  })
})
