/**
 * facade.test.ts - Tests for the NodeFacade class
 *
 * Verifies that NodeFacade correctly delegates to a backend and
 * enforces the initialization guard.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  FIELD_NAMES,
} from '../schemas/node-schema.js'
import { clearSystemNodeCache } from './node.service.js'
import { SqliteBackend } from './backends/sqlite-backend.js'
import { NodeFacade } from './facade.js'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let facade: NodeFacade

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
  ]

  for (const st of systemSupertags) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${st.id}', '${st.content}', '${st.content.toLowerCase()}', '${st.systemId}', ${now}, ${now})
    `)
  }
}

describe('NodeFacade', () => {
  beforeEach(() => {
    setupTestDatabase()
    clearSystemNodeCache()
    seedSystemNodes()

    // Create a SqliteBackend backed by the in-memory DB, then inject into facade
    const backend = new SqliteBackend()
    backend.initWithDb(db)

    facade = new NodeFacade()
    facade.initWithBackend(backend)
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('initialization guard', () => {
    it('should throw when calling methods before init', async () => {
      const uninitFacade = new NodeFacade()
      await expect(uninitFacade.assembleNode('some-id')).rejects.toThrow(
        'NodeFacade not initialized',
      )
    })
  })

  describe('init idempotency', () => {
    it('should not error when initWithBackend is called and facade is already initialized', () => {
      // Facade is already initialized in beforeEach — calling initWithBackend again should work
      const backend = new SqliteBackend()
      backend.initWithDb(db)
      facade.initWithBackend(backend)
      // No error thrown
    })
  })

  describe('createNode → assembleNode round-trip', () => {
    it('should create a node and assemble it via the facade', async () => {
      const nodeId = await facade.createNode({ content: 'Facade Node' })
      expect(nodeId).toBeTruthy()

      const node = await facade.assembleNode(nodeId)
      expect(node).not.toBeNull()
      expect(node!.content).toBe('Facade Node')
      expect(node!.id).toBe(nodeId)
    })
  })

  describe('AssembledNode shape', () => {
    it('should return a proper AssembledNode with expected fields', async () => {
      const nodeId = await facade.createNode({
        content: 'Shape Test',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })

      const node = await facade.assembleNode(nodeId)
      expect(node).not.toBeNull()

      // Verify AssembledNode shape
      expect(node!.id).toBe(nodeId)
      expect(node!.content).toBe('Shape Test')
      expect(node!.createdAt).toBeInstanceOf(Date)
      expect(node!.updatedAt).toBeInstanceOf(Date)
      expect(node!.properties).toBeDefined()
      expect(Array.isArray(node!.supertags)).toBe(true)
      expect(node!.supertags).toHaveLength(1)
    })
  })

  describe('property operations', () => {
    it('should set and retrieve a property', async () => {
      const nodeId = await facade.createNode({ content: 'Prop Node' })
      await facade.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/test/path')

      const node = await facade.assembleNode(nodeId)
      expect(node!.properties[FIELD_NAMES.PATH]).toBeDefined()
      expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/test/path')
    })

    it('should add multiple property values', async () => {
      const nodeId = await facade.createNode({ content: 'Multi' })
      await facade.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'a')
      await facade.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'b')

      const node = await facade.assembleNode(nodeId)
      expect(node!.properties[FIELD_NAMES.PATH]).toHaveLength(2)
    })

    it('should clear a property', async () => {
      const nodeId = await facade.createNode({ content: 'Clear' })
      await facade.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/x')
      await facade.clearProperty(nodeId, SYSTEM_FIELDS.PATH)

      const node = await facade.assembleNode(nodeId)
      expect(node!.properties[FIELD_NAMES.PATH]).toBeUndefined()
    })
  })

  describe('supertag operations', () => {
    it('should add a supertag', async () => {
      const nodeId = await facade.createNode({ content: 'Tag Me' })
      const added = await facade.addNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
      expect(added).toBe(true)

      const node = await facade.assembleNode(nodeId)
      expect(node!.supertags).toHaveLength(1)
      expect(node!.supertags[0].systemId).toBe(SYSTEM_SUPERTAGS.ITEM)
    })

    it('should remove a supertag', async () => {
      const nodeId = await facade.createNode({
        content: 'Tagged',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })
      await facade.removeNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)

      const node = await facade.assembleNode(nodeId)
      expect(node!.supertags).toHaveLength(0)
    })
  })

  describe('deleteNode', () => {
    it('should soft-delete a node', async () => {
      const nodeId = await facade.createNode({ content: 'Doomed' })
      await facade.deleteNode(nodeId)

      const node = await facade.findNodeById(nodeId)
      expect(node).not.toBeNull()
      expect(node!.deletedAt).not.toBeNull()
    })
  })

  describe('findNodeBySystemId', () => {
    it('should find a node by system ID', async () => {
      const nodeId = await facade.createNode({
        content: 'System',
        systemId: 'test:facade-node',
      })

      const node = await facade.findNodeBySystemId('test:facade-node')
      expect(node).not.toBeNull()
      expect(node!.id).toBe(nodeId)
    })
  })

  describe('evaluateQuery', () => {
    it('should evaluate a query via the facade', async () => {
      await facade.createNode({
        content: 'Q1',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })
      await facade.createNode({
        content: 'Q2',
        supertagId: SYSTEM_SUPERTAGS.ITEM,
      })

      const result = await facade.evaluateQuery({
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
    it('should not throw', async () => {
      await expect(facade.save()).resolves.toBeUndefined()
    })
  })
})
