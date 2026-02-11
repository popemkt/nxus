/**
 * backend-equivalence.test.ts - Parametric tests verifying both backends
 * produce equivalent AssembledNode output.
 *
 * Uses describe.each to run the same test suite against both SqliteBackend
 * and SurrealBackend. Tests compare content, properties, and supertags
 * (not IDs, since formats differ: UUID vs RecordId string).
 */

import type { Surreal } from 'surrealdb'
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
import {
  setupTestGraphDatabase,
  teardownTestGraphDatabase,
} from '../../client/__tests__/graph-test-utils.js'
import type { NodeBackend } from './types.js'
import { SqliteBackend } from './sqlite-backend.js'
import { SurrealBackend } from './surreal-backend.js'

// ---------------------------------------------------------------------------
// Factory functions for creating test backends
// ---------------------------------------------------------------------------

interface TestContext {
  backend: NodeBackend
  cleanup: () => Promise<void>
}

async function createTestSqliteBackend(): Promise<TestContext> {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })

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
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_node_properties_value ON node_properties(value)`)

  // Seed system nodes
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

  clearSystemNodeCache()

  const backend = new SqliteBackend()
  backend.initWithDb(db)

  return {
    backend,
    cleanup: async () => { sqlite.close() },
  }
}

async function createTestSurrealBackend(): Promise<TestContext> {
  const db = await setupTestGraphDatabase()
  const backend = new SurrealBackend()
  backend.initWithDb(db)

  return {
    backend,
    cleanup: async () => { await teardownTestGraphDatabase(db) },
  }
}

// ---------------------------------------------------------------------------
// Parametric test suite
// ---------------------------------------------------------------------------

describe.each(['sqlite', 'surreal'] as const)(
  'Backend equivalence (%s)',
  (backendType) => {
    let backend: NodeBackend
    let cleanup: () => Promise<void>

    beforeEach(async () => {
      const ctx = backendType === 'sqlite'
        ? await createTestSqliteBackend()
        : await createTestSurrealBackend()
      backend = ctx.backend
      cleanup = ctx.cleanup
    })

    afterEach(async () => {
      await cleanup()
    })

    // -----------------------------------------------------------------------
    // createNode → assembleNode round-trip
    // -----------------------------------------------------------------------

    describe('createNode → assembleNode', () => {
      it('should create and assemble a node with correct content', async () => {
        const nodeId = await backend.createNode({ content: 'Equivalence Test' })
        expect(nodeId).toBeTruthy()

        const node = await backend.assembleNode(nodeId)
        expect(node).not.toBeNull()
        expect(node!.content).toBe('Equivalence Test')
        expect(node!.id).toBe(nodeId)
        expect(node!.properties).toBeDefined()
        expect(node!.supertags).toEqual([])
        expect(node!.createdAt).toBeInstanceOf(Date)
        expect(node!.updatedAt).toBeInstanceOf(Date)
        expect(node!.deletedAt).toBeNull()
      })

      it('should create a node with systemId', async () => {
        const nodeId = await backend.createNode({
          content: 'System Node',
          systemId: 'test:equiv-node',
        })

        const node = await backend.findNodeBySystemId('test:equiv-node')
        expect(node).not.toBeNull()
        expect(node!.id).toBe(nodeId)
        expect(node!.systemId).toBe('test:equiv-node')
        expect(node!.content).toBe('System Node')
      })
    })

    // -----------------------------------------------------------------------
    // setProperty → assembleNode → getProperty round-trip
    // -----------------------------------------------------------------------

    describe('setProperty → assembleNode round-trip', () => {
      it('should set a property and see it in assembled node', async () => {
        const nodeId = await backend.createNode({ content: 'Prop Node' })
        await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/test/path')

        const node = await backend.assembleNode(nodeId)
        expect(node).not.toBeNull()
        expect(node!.properties[FIELD_NAMES.PATH]).toBeDefined()
        expect(node!.properties[FIELD_NAMES.PATH]).toHaveLength(1)
        expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/test/path')
        expect(node!.properties[FIELD_NAMES.PATH][0].fieldName).toBe('path')
      })

      it('should replace property on re-set', async () => {
        const nodeId = await backend.createNode({ content: 'Node' })
        await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/first')
        await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/second')

        const node = await backend.assembleNode(nodeId)
        expect(node!.properties[FIELD_NAMES.PATH]).toHaveLength(1)
        expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/second')
      })

      it('should set multiple different properties', async () => {
        const nodeId = await backend.createNode({ content: 'Multi-prop' })
        await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/test')
        await backend.setProperty(nodeId, SYSTEM_FIELDS.DESCRIPTION, 'A desc')
        await backend.setProperty(nodeId, SYSTEM_FIELDS.STATUS, 'active')

        const node = await backend.assembleNode(nodeId)
        expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/test')
        expect(node!.properties[FIELD_NAMES.DESCRIPTION][0].value).toBe('A desc')
        expect(node!.properties[FIELD_NAMES.STATUS][0].value).toBe('active')
      })
    })

    // -----------------------------------------------------------------------
    // addPropertyValue × N → verify ordering preserved
    // -----------------------------------------------------------------------

    describe('addPropertyValue ordering', () => {
      it('should preserve order across multiple addPropertyValue calls', async () => {
        const nodeId = await backend.createNode({ content: 'Multi' })
        await backend.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'val1')
        await backend.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'val2')
        await backend.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'val3')

        const node = await backend.assembleNode(nodeId)
        const pathProps = node!.properties[FIELD_NAMES.PATH]
        expect(pathProps).toHaveLength(3)

        const sorted = [...pathProps].sort((a, b) => a.order - b.order)
        expect(sorted[0].value).toBe('val1')
        expect(sorted[1].value).toBe('val2')
        expect(sorted[2].value).toBe('val3')
      })
    })

    // -----------------------------------------------------------------------
    // clearProperty → verify property removed
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // addNodeSupertag → verify supertag in assembled node
    // -----------------------------------------------------------------------

    describe('addNodeSupertag', () => {
      it('should add supertag visible in assembled node', async () => {
        const nodeId = await backend.createNode({ content: 'Plain' })
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

    // -----------------------------------------------------------------------
    // removeNodeSupertag → verify supertag removed
    // -----------------------------------------------------------------------

    describe('removeNodeSupertag', () => {
      it('should remove supertag from node', async () => {
        const nodeId = await backend.createNode({
          content: 'Item',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })

        const removed = await backend.removeNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
        expect(removed).toBe(true)

        const node = await backend.assembleNode(nodeId)
        expect(node!.supertags).toHaveLength(0)
      })

      it('should return false when removing non-existent supertag', async () => {
        const nodeId = await backend.createNode({ content: 'Node' })
        const removed = await backend.removeNodeSupertag(nodeId, SYSTEM_SUPERTAGS.ITEM)
        expect(removed).toBe(false)
      })
    })

    // -----------------------------------------------------------------------
    // deleteNode → findNodeById returns null or soft-deleted
    // -----------------------------------------------------------------------

    describe('deleteNode', () => {
      it('should soft-delete a node', async () => {
        const nodeId = await backend.createNode({ content: 'To Delete' })
        await backend.deleteNode(nodeId)

        // findNodeById returns the record (with deletedAt set)
        const node = await backend.findNodeById(nodeId)
        expect(node).not.toBeNull()
        expect(node!.deletedAt).not.toBeNull()
      })
    })

    // -----------------------------------------------------------------------
    // getNodesBySupertags returns correct nodes
    // -----------------------------------------------------------------------

    describe('getNodesBySupertags', () => {
      it('should return nodes matching supertag', async () => {
        await backend.createNode({
          content: 'Item 1',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        await backend.createNode({
          content: 'Item 2',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        await backend.createNode({
          content: 'Command 1',
          supertagId: SYSTEM_SUPERTAGS.COMMAND,
        })

        const items = await backend.getNodesBySupertags([SYSTEM_SUPERTAGS.ITEM])
        expect(items).toHaveLength(2)
        expect(items.map((n) => n.content).sort()).toEqual(['Item 1', 'Item 2'])
      })

      it('should return empty for non-existent supertag', async () => {
        const items = await backend.getNodesBySupertags(['supertag:nonexistent'])
        expect(items).toHaveLength(0)
      })
    })

    // -----------------------------------------------------------------------
    // updateNodeContent → content updated in assembled node
    // -----------------------------------------------------------------------

    describe('updateNodeContent', () => {
      it('should update content visible in assembled node', async () => {
        const nodeId = await backend.createNode({ content: 'Original' })
        await backend.updateNodeContent(nodeId, 'Updated')

        const node = await backend.assembleNode(nodeId)
        expect(node!.content).toBe('Updated')
      })
    })

    // -----------------------------------------------------------------------
    // evaluateQuery with supertag filter → same nodes returned
    // -----------------------------------------------------------------------

    describe('evaluateQuery', () => {
      it('should find nodes by supertag filter', async () => {
        await backend.createNode({
          content: 'Item A',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        await backend.createNode({
          content: 'Item B',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        await backend.createNode({
          content: 'Command',
          supertagId: SYSTEM_SUPERTAGS.COMMAND,
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
        expect(result.nodes.map((n) => n.content).sort()).toEqual(['Item A', 'Item B'])
      })

      it('should find nodes by content filter', async () => {
        await backend.createNode({ content: 'Hello World' })
        await backend.createNode({ content: 'Goodbye World' })
        await backend.createNode({ content: 'Hello Mars' })

        const result = await backend.evaluateQuery({
          filters: [
            { type: 'content', query: 'hello', caseSensitive: false },
          ],
          limit: 500,
        })

        // Both backends may also include system nodes whose content matches.
        // At minimum, our two "Hello" nodes should be present.
        const contents = result.nodes.map((n) => n.content)
        expect(contents).toContain('Hello World')
        expect(contents).toContain('Hello Mars')
        expect(contents).not.toContain('Goodbye World')
      })

      it('should find nodes by property filter', async () => {
        const id1 = await backend.createNode({ content: 'Active' })
        await backend.setProperty(id1, SYSTEM_FIELDS.STATUS, 'active')

        const id2 = await backend.createNode({ content: 'Inactive' })
        await backend.setProperty(id2, SYSTEM_FIELDS.STATUS, 'inactive')

        await backend.createNode({ content: 'No Status' })

        const result = await backend.evaluateQuery({
          filters: [
            { type: 'property', fieldId: SYSTEM_FIELDS.STATUS, op: 'eq', value: 'active' },
          ],
          limit: 500,
        })

        expect(result.nodes).toHaveLength(1)
        expect(result.nodes[0].content).toBe('Active')
      })

      it('should exclude soft-deleted nodes', async () => {
        const id = await backend.createNode({
          content: 'To Delete',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
        })
        await backend.deleteNode(id)

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

        expect(result.nodes).toHaveLength(0)
      })
    })

    // -----------------------------------------------------------------------
    // linkNodes
    // -----------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // save (no-op)
    // -----------------------------------------------------------------------

    describe('save', () => {
      it('should not throw', async () => {
        await expect(backend.save()).resolves.toBeUndefined()
      })
    })
  },
)
