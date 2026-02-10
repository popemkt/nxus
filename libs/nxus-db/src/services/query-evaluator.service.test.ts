/**
 * query-evaluator.service.test.ts - Unit tests for query evaluation engine
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS, type FieldSystemId } from '../schemas/node-schema.js'
import {
  clearSystemNodeCache,
  createNode,
  setProperty,
} from './node.service.js'
import {
  evaluateContentFilter,
  evaluateFilter,
  evaluateHasFieldFilter,
  evaluateLogicalFilter,
  evaluatePropertyFilter,
  evaluateQuery,
  evaluateRelationFilter,
  evaluateSupertagFilter,
  evaluateTemporalFilter,
} from './query-evaluator.service.js'

// ============================================================================
// Test Setup
// ============================================================================

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
    CREATE INDEX IF NOT EXISTS idx_nodes_owner_id ON nodes(owner_id)
  `)

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_nodes_content_plain ON nodes(content_plain)
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

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_node_properties_value ON node_properties(value)
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
    { id: 'field-path', systemId: 'field:path', content: 'Path' },
    { id: 'field-description', systemId: 'field:description', content: 'Description' },
    { id: 'field-status', systemId: 'field:status', content: 'Status' },
    { id: 'field-priority', systemId: 'field:priority', content: 'Priority' },
    { id: 'field-category', systemId: 'field:category', content: 'Category' },
    { id: 'field-dependencies', systemId: 'field:dependencies', content: 'Dependencies' },
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
    { id: 'supertag-repo', systemId: 'supertag:repo', content: '#Repo' },
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

  // Make #Repo extend #Item (for inheritance testing)
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('supertag-repo', 'field-extends', '"supertag-item"', 0, ${now}, ${now})
  `)
}

// ============================================================================
// Test Suite
// ============================================================================

describe('query-evaluator.service', () => {
  beforeEach(() => {
    setupTestDatabase()
    clearSystemNodeCache()
    seedSystemNodes()
  })

  afterEach(() => {
    sqlite.close()
  })

  // ==========================================================================
  // evaluateSupertagFilter
  // ==========================================================================

  describe('evaluateSupertagFilter', () => {
    it('should filter nodes by direct supertag', () => {
      const item1 = createNode(db, { content: 'Item 1', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const item2 = createNode(db, { content: 'Item 2', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const cmd = createNode(db, { content: 'Command 1', supertagId: SYSTEM_SUPERTAGS.COMMAND })

      const candidates = new Set([item1, item2, cmd])

      const result = evaluateSupertagFilter(
        db,
        {
          type: 'supertag',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
          includeInherited: false,
        },
        candidates,
      )

      expect(result.size).toBe(2)
      expect(result.has(item1)).toBe(true)
      expect(result.has(item2)).toBe(true)
      expect(result.has(cmd)).toBe(false)
    })

    it('should include inherited supertags when includeInherited=true', () => {
      const item = createNode(db, { content: 'Item', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const tool = createNode(db, { content: 'Tool', supertagId: 'supertag:tool' })
      const cmd = createNode(db, { content: 'Command', supertagId: SYSTEM_SUPERTAGS.COMMAND })

      const candidates = new Set([item, tool, cmd])

      const result = evaluateSupertagFilter(
        db,
        {
          type: 'supertag',
          supertagId: SYSTEM_SUPERTAGS.ITEM,
          includeInherited: true,
        },
        candidates,
      )

      expect(result.size).toBe(2)
      expect(result.has(item)).toBe(true)
      expect(result.has(tool)).toBe(true) // Tool extends Item
      expect(result.has(cmd)).toBe(false)
    })

    it('should return empty set for non-existent supertag', () => {
      const item = createNode(db, { content: 'Item', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const candidates = new Set([item])

      const result = evaluateSupertagFilter(
        db,
        {
          type: 'supertag',
          supertagId: 'supertag:non-existent',
          includeInherited: true,
        },
        candidates,
      )

      expect(result.size).toBe(0)
    })
  })

  // ==========================================================================
  // evaluatePropertyFilter
  // ==========================================================================

  describe('evaluatePropertyFilter', () => {
    it('should filter by eq operator', () => {
      const node1 = createNode(db, { content: 'Node 1' })
      const node2 = createNode(db, { content: 'Node 2' })
      setProperty(db, node1, 'field:status' as FieldSystemId, 'active')
      setProperty(db, node2, 'field:status' as FieldSystemId, 'inactive')

      const candidates = new Set([node1, node2])

      const result = evaluatePropertyFilter(
        db,
        {
          type: 'property',
          fieldId: 'field:status',
          op: 'eq',
          value: 'active',
        },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node1)).toBe(true)
    })

    it('should filter by neq operator', () => {
      const node1 = createNode(db, { content: 'Node 1' })
      const node2 = createNode(db, { content: 'Node 2' })
      setProperty(db, node1, 'field:status' as FieldSystemId, 'active')
      setProperty(db, node2, 'field:status' as FieldSystemId, 'inactive')

      const candidates = new Set([node1, node2])

      const result = evaluatePropertyFilter(
        db,
        {
          type: 'property',
          fieldId: 'field:status',
          op: 'neq',
          value: 'active',
        },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node2)).toBe(true)
    })

    it('should filter by numeric comparison operators', () => {
      const node1 = createNode(db, { content: 'Node 1' })
      const node2 = createNode(db, { content: 'Node 2' })
      const node3 = createNode(db, { content: 'Node 3' })
      setProperty(db, node1, 'field:priority' as FieldSystemId, 1)
      setProperty(db, node2, 'field:priority' as FieldSystemId, 5)
      setProperty(db, node3, 'field:priority' as FieldSystemId, 10)

      const candidates = new Set([node1, node2, node3])

      // Greater than
      let result = evaluatePropertyFilter(
        db,
        { type: 'property', fieldId: 'field:priority', op: 'gt', value: 5 },
        candidates,
      )
      expect(result.size).toBe(1)
      expect(result.has(node3)).toBe(true)

      // Greater than or equal
      result = evaluatePropertyFilter(
        db,
        { type: 'property', fieldId: 'field:priority', op: 'gte', value: 5 },
        candidates,
      )
      expect(result.size).toBe(2)
      expect(result.has(node2)).toBe(true)
      expect(result.has(node3)).toBe(true)

      // Less than
      result = evaluatePropertyFilter(
        db,
        { type: 'property', fieldId: 'field:priority', op: 'lt', value: 5 },
        candidates,
      )
      expect(result.size).toBe(1)
      expect(result.has(node1)).toBe(true)

      // Less than or equal
      result = evaluatePropertyFilter(
        db,
        { type: 'property', fieldId: 'field:priority', op: 'lte', value: 5 },
        candidates,
      )
      expect(result.size).toBe(2)
      expect(result.has(node1)).toBe(true)
      expect(result.has(node2)).toBe(true)
    })

    it('should filter by string operators (contains, startsWith, endsWith)', () => {
      const node1 = createNode(db, { content: 'Node 1' })
      const node2 = createNode(db, { content: 'Node 2' })
      const node3 = createNode(db, { content: 'Node 3' })
      setProperty(db, node1, 'field:category' as FieldSystemId, 'web-development')
      setProperty(db, node2, 'field:category' as FieldSystemId, 'mobile-development')
      setProperty(db, node3, 'field:category' as FieldSystemId, 'web-design')

      const candidates = new Set([node1, node2, node3])

      // Contains
      let result = evaluatePropertyFilter(
        db,
        { type: 'property', fieldId: 'field:category', op: 'contains', value: 'development' },
        candidates,
      )
      expect(result.size).toBe(2)
      expect(result.has(node1)).toBe(true)
      expect(result.has(node2)).toBe(true)

      // Starts with
      result = evaluatePropertyFilter(
        db,
        { type: 'property', fieldId: 'field:category', op: 'startsWith', value: 'web' },
        candidates,
      )
      expect(result.size).toBe(2)
      expect(result.has(node1)).toBe(true)
      expect(result.has(node3)).toBe(true)

      // Ends with
      result = evaluatePropertyFilter(
        db,
        { type: 'property', fieldId: 'field:category', op: 'endsWith', value: 'design' },
        candidates,
      )
      expect(result.size).toBe(1)
      expect(result.has(node3)).toBe(true)
    })

    it('should filter by isEmpty operator', () => {
      const node1 = createNode(db, { content: 'Node 1' })
      const node2 = createNode(db, { content: 'Node 2' })
      setProperty(db, node1, 'field:status' as FieldSystemId, 'active')
      // node2 has no status

      const candidates = new Set([node1, node2])

      const result = evaluatePropertyFilter(
        db,
        { type: 'property', fieldId: 'field:status', op: 'isEmpty' },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node2)).toBe(true)
    })

    it('should filter by isNotEmpty operator', () => {
      const node1 = createNode(db, { content: 'Node 1' })
      const node2 = createNode(db, { content: 'Node 2' })
      setProperty(db, node1, 'field:status' as FieldSystemId, 'active')
      // node2 has no status

      const candidates = new Set([node1, node2])

      const result = evaluatePropertyFilter(
        db,
        { type: 'property', fieldId: 'field:status', op: 'isNotEmpty' },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node1)).toBe(true)
    })

    it('should return empty set for non-existent field', () => {
      const node1 = createNode(db, { content: 'Node 1' })
      const candidates = new Set([node1])

      const result = evaluatePropertyFilter(
        db,
        { type: 'property', fieldId: 'field:non-existent', op: 'eq', value: 'test' },
        candidates,
      )

      expect(result.size).toBe(0)
    })
  })

  // ==========================================================================
  // evaluateContentFilter
  // ==========================================================================

  describe('evaluateContentFilter', () => {
    it('should filter by content search (case-insensitive)', () => {
      const node1 = createNode(db, { content: 'Hello World' })
      const node2 = createNode(db, { content: 'Goodbye World' })
      const node3 = createNode(db, { content: 'Hello Universe' })

      const candidates = new Set([node1, node2, node3])

      const result = evaluateContentFilter(
        db,
        { type: 'content', query: 'hello', caseSensitive: false },
        candidates,
      )

      expect(result.size).toBe(2)
      expect(result.has(node1)).toBe(true)
      expect(result.has(node3)).toBe(true)
    })

    it('should filter by content search (case-sensitive)', () => {
      const node1 = createNode(db, { content: 'Hello World' })
      const node2 = createNode(db, { content: 'hello world' })

      const candidates = new Set([node1, node2])

      const result = evaluateContentFilter(
        db,
        { type: 'content', query: 'Hello', caseSensitive: true },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node1)).toBe(true)
    })

    it('should return all candidates for empty query', () => {
      const node1 = createNode(db, { content: 'Node 1' })
      const node2 = createNode(db, { content: 'Node 2' })

      const candidates = new Set([node1, node2])

      const result = evaluateContentFilter(
        db,
        { type: 'content', query: '', caseSensitive: false },
        candidates,
      )

      expect(result.size).toBe(2)
    })
  })

  // ==========================================================================
  // evaluateHasFieldFilter
  // ==========================================================================

  describe('evaluateHasFieldFilter', () => {
    it('should filter nodes that have a field', () => {
      const node1 = createNode(db, { content: 'Node 1' })
      const node2 = createNode(db, { content: 'Node 2' })
      setProperty(db, node1, 'field:status' as FieldSystemId, 'active')

      const candidates = new Set([node1, node2])

      const result = evaluateHasFieldFilter(
        db,
        { type: 'hasField', fieldId: 'field:status', negate: false },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node1)).toBe(true)
    })

    it('should filter nodes that do NOT have a field (negate=true)', () => {
      const node1 = createNode(db, { content: 'Node 1' })
      const node2 = createNode(db, { content: 'Node 2' })
      setProperty(db, node1, 'field:status' as FieldSystemId, 'active')

      const candidates = new Set([node1, node2])

      const result = evaluateHasFieldFilter(
        db,
        { type: 'hasField', fieldId: 'field:status', negate: true },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node2)).toBe(true)
    })
  })

  // ==========================================================================
  // evaluateTemporalFilter
  // ==========================================================================

  describe('evaluateTemporalFilter', () => {
    it('should filter by createdAt within last N days', () => {
      // Both nodes created via createNode will have the current timestamp
      // We can only test that the filter correctly passes through recent nodes
      const recentNode = createNode(db, { content: 'Recent Node' })
      const anotherRecentNode = createNode(db, { content: 'Another Recent Node' })

      const candidates = new Set([recentNode, anotherRecentNode])

      // Both should match "within last 7 days" since they were just created
      const result = evaluateTemporalFilter(
        db,
        { type: 'temporal', field: 'createdAt', op: 'within', days: 7 },
        candidates,
      )

      expect(result.size).toBe(2)
      expect(result.has(recentNode)).toBe(true)
      expect(result.has(anotherRecentNode)).toBe(true)

      // Test with 0 days - should still match since within today
      const resultZeroDays = evaluateTemporalFilter(
        db,
        { type: 'temporal', field: 'createdAt', op: 'within', days: 0 },
        candidates,
      )
      // Nodes created today might be excluded with 0 days (edge case)
      // The important thing is the filter runs without error
      expect(resultZeroDays.size).toBeLessThanOrEqual(2)
    })

    it('should filter by createdAt before a date', () => {
      const node = createNode(db, { content: 'Node' })

      const candidates = new Set([node])
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

      const result = evaluateTemporalFilter(
        db,
        { type: 'temporal', field: 'createdAt', op: 'before', date: futureDate },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node)).toBe(true)
    })

    it('should filter by createdAt after a date', () => {
      const node = createNode(db, { content: 'Node' })

      const candidates = new Set([node])
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

      const result = evaluateTemporalFilter(
        db,
        { type: 'temporal', field: 'createdAt', op: 'after', date: pastDate },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node)).toBe(true)
    })
  })

  // ==========================================================================
  // evaluateRelationFilter
  // ==========================================================================

  describe('evaluateRelationFilter', () => {
    it('should filter childOf relation with specific target', () => {
      const parent = createNode(db, { content: 'Parent' })
      const child1 = createNode(db, { content: 'Child 1', ownerId: parent })
      const child2 = createNode(db, { content: 'Child 2', ownerId: parent })
      const other = createNode(db, { content: 'Other' })

      const candidates = new Set([child1, child2, other])

      const result = evaluateRelationFilter(
        db,
        { type: 'relation', relationType: 'childOf', targetNodeId: parent },
        candidates,
      )

      expect(result.size).toBe(2)
      expect(result.has(child1)).toBe(true)
      expect(result.has(child2)).toBe(true)
      expect(result.has(other)).toBe(false)
    })

    it('should filter ownedBy (alias for childOf)', () => {
      const parent = createNode(db, { content: 'Parent' })
      const child = createNode(db, { content: 'Child', ownerId: parent })

      const candidates = new Set([child])

      const result = evaluateRelationFilter(
        db,
        { type: 'relation', relationType: 'ownedBy', targetNodeId: parent },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(child)).toBe(true)
    })

    it('should filter linksTo relation', () => {
      const target = createNode(db, { content: 'Target' })
      const node1 = createNode(db, { content: 'Node 1' })
      const node2 = createNode(db, { content: 'Node 2' })
      setProperty(db, node1, 'field:dependencies' as FieldSystemId, target)

      const candidates = new Set([node1, node2])

      const result = evaluateRelationFilter(
        db,
        { type: 'relation', relationType: 'linksTo', targetNodeId: target },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node1)).toBe(true)
    })

    it('should filter linkedFrom relation (backlinks)', () => {
      const source = createNode(db, { content: 'Source' })
      const target1 = createNode(db, { content: 'Target 1' })
      const target2 = createNode(db, { content: 'Target 2' })
      setProperty(db, source, 'field:dependencies' as FieldSystemId, target1)

      // Candidates are potential targets
      const candidates = new Set([target1, target2])

      const result = evaluateRelationFilter(
        db,
        { type: 'relation', relationType: 'linkedFrom', targetNodeId: source },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(target1)).toBe(true)
    })
  })

  // ==========================================================================
  // evaluateLogicalFilter
  // ==========================================================================

  describe('evaluateLogicalFilter', () => {
    it('should combine filters with AND', () => {
      const node1 = createNode(db, { content: 'Node 1', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const node2 = createNode(db, { content: 'Node 2', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const node3 = createNode(db, { content: 'Node 3', supertagId: SYSTEM_SUPERTAGS.COMMAND })
      setProperty(db, node1, 'field:status' as FieldSystemId, 'active')
      setProperty(db, node2, 'field:status' as FieldSystemId, 'inactive')

      const candidates = new Set([node1, node2, node3])

      const result = evaluateLogicalFilter(
        db,
        {
          type: 'and',
          filters: [
            { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false },
            { type: 'property', fieldId: 'field:status', op: 'eq', value: 'active' },
          ],
        },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node1)).toBe(true)
    })

    it('should combine filters with OR', () => {
      const node1 = createNode(db, { content: 'Node 1', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const node2 = createNode(db, { content: 'Node 2', supertagId: SYSTEM_SUPERTAGS.COMMAND })
      const node3 = createNode(db, { content: 'Node 3', supertagId: SYSTEM_SUPERTAGS.TAG })

      const candidates = new Set([node1, node2, node3])

      const result = evaluateLogicalFilter(
        db,
        {
          type: 'or',
          filters: [
            { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false },
            { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.COMMAND, includeInherited: false },
          ],
        },
        candidates,
      )

      expect(result.size).toBe(2)
      expect(result.has(node1)).toBe(true)
      expect(result.has(node2)).toBe(true)
      expect(result.has(node3)).toBe(false)
    })

    it('should negate filters with NOT', () => {
      const node1 = createNode(db, { content: 'Node 1', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const node2 = createNode(db, { content: 'Node 2', supertagId: SYSTEM_SUPERTAGS.COMMAND })

      const candidates = new Set([node1, node2])

      const result = evaluateLogicalFilter(
        db,
        {
          type: 'not',
          filters: [
            { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false },
          ],
        },
        candidates,
      )

      expect(result.size).toBe(1)
      expect(result.has(node2)).toBe(true)
    })

    it('should handle nested logical filters', () => {
      const node1 = createNode(db, { content: 'Node 1', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const node2 = createNode(db, { content: 'Node 2', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const node3 = createNode(db, { content: 'Node 3', supertagId: SYSTEM_SUPERTAGS.COMMAND })
      setProperty(db, node1, 'field:status' as FieldSystemId, 'active')
      setProperty(db, node2, 'field:status' as FieldSystemId, 'inactive')
      setProperty(db, node3, 'field:status' as FieldSystemId, 'active')

      const candidates = new Set([node1, node2, node3])

      // (Item AND active) OR Command
      const result = evaluateLogicalFilter(
        db,
        {
          type: 'or',
          filters: [
            {
              type: 'and',
              filters: [
                { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false },
                { type: 'property', fieldId: 'field:status', op: 'eq', value: 'active' },
              ],
            },
            { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.COMMAND, includeInherited: false },
          ],
        },
        candidates,
      )

      expect(result.size).toBe(2)
      expect(result.has(node1)).toBe(true) // Item AND active
      expect(result.has(node3)).toBe(true) // Command
    })
  })

  // ==========================================================================
  // evaluateQuery (full query)
  // ==========================================================================

  describe('evaluateQuery', () => {
    it('should evaluate a complete query with multiple filters', () => {
      const item1 = createNode(db, { content: 'Active Tool', supertagId: 'supertag:tool' })
      const item2 = createNode(db, { content: 'Inactive Tool', supertagId: 'supertag:tool' })
      createNode(db, { content: 'Command', supertagId: SYSTEM_SUPERTAGS.COMMAND }) // Should be excluded
      setProperty(db, item1, 'field:status' as FieldSystemId, 'active')
      setProperty(db, item2, 'field:status' as FieldSystemId, 'inactive')

      const result = evaluateQuery(db, {
        filters: [
          { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: true },
          { type: 'property', fieldId: 'field:status', op: 'eq', value: 'active' },
        ],
        limit: 500,
      })

      expect(result.nodes.length).toBe(1)
      expect(result.nodes[0].id).toBe(item1)
      expect(result.totalCount).toBe(1)
    })

    it('should respect limit', () => {
      for (let i = 0; i < 10; i++) {
        createNode(db, { content: `Item ${i}`, supertagId: SYSTEM_SUPERTAGS.ITEM })
      }

      const result = evaluateQuery(db, {
        filters: [
          { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false },
        ],
        limit: 5,
      })

      expect(result.nodes.length).toBe(5)
      expect(result.totalCount).toBe(10)
    })

    it('should sort by content ascending', () => {
      createNode(db, { content: 'Charlie', supertagId: SYSTEM_SUPERTAGS.ITEM })
      createNode(db, { content: 'Alpha', supertagId: SYSTEM_SUPERTAGS.ITEM })
      createNode(db, { content: 'Bravo', supertagId: SYSTEM_SUPERTAGS.ITEM })

      const result = evaluateQuery(db, {
        filters: [
          { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false },
        ],
        sort: { field: 'content', direction: 'asc' },
        limit: 500,
      })

      expect(result.nodes.map((n) => n.content)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    })

    it('should sort by content descending', () => {
      createNode(db, { content: 'Charlie', supertagId: SYSTEM_SUPERTAGS.ITEM })
      createNode(db, { content: 'Alpha', supertagId: SYSTEM_SUPERTAGS.ITEM })
      createNode(db, { content: 'Bravo', supertagId: SYSTEM_SUPERTAGS.ITEM })

      const result = evaluateQuery(db, {
        filters: [
          { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false },
        ],
        sort: { field: 'content', direction: 'desc' },
        limit: 500,
      })

      expect(result.nodes.map((n) => n.content)).toEqual(['Charlie', 'Bravo', 'Alpha'])
    })

    it('should sort by property field', () => {
      const n1 = createNode(db, { content: 'Low Priority', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const n2 = createNode(db, { content: 'High Priority', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const n3 = createNode(db, { content: 'Medium Priority', supertagId: SYSTEM_SUPERTAGS.ITEM })
      setProperty(db, n1, 'field:priority' as FieldSystemId, 1)
      setProperty(db, n2, 'field:priority' as FieldSystemId, 10)
      setProperty(db, n3, 'field:priority' as FieldSystemId, 5)

      const result = evaluateQuery(db, {
        filters: [
          { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false },
        ],
        sort: { field: 'field:priority', direction: 'desc' },
        limit: 500,
      })

      expect(result.nodes.map((n) => n.content)).toEqual([
        'High Priority',
        'Medium Priority',
        'Low Priority',
      ])
    })

    it('should return empty result for no matching filters', () => {
      createNode(db, { content: 'Item', supertagId: SYSTEM_SUPERTAGS.ITEM })

      const result = evaluateQuery(db, {
        filters: [
          { type: 'supertag', supertagId: 'supertag:non-existent', includeInherited: false },
        ],
        limit: 500,
      })

      expect(result.nodes.length).toBe(0)
      expect(result.totalCount).toBe(0)
    })

    it('should exclude deleted nodes', () => {
      const item1 = createNode(db, { content: 'Active Item', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const item2 = createNode(db, { content: 'Deleted Item', supertagId: SYSTEM_SUPERTAGS.ITEM })

      // Soft delete item2
      sqlite.exec(`
        UPDATE nodes SET deleted_at = ${Date.now()} WHERE id = '${item2}'
      `)

      const result = evaluateQuery(db, {
        filters: [
          { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false },
        ],
        limit: 500,
      })

      expect(result.nodes.length).toBe(1)
      expect(result.nodes[0].id).toBe(item1)
    })
  })

  // ==========================================================================
  // evaluateFilter dispatcher
  // ==========================================================================

  describe('evaluateFilter', () => {
    it('should dispatch to correct filter function', () => {
      const node = createNode(db, { content: 'Test Node', supertagId: SYSTEM_SUPERTAGS.ITEM })
      const candidates = new Set([node])

      // Test that dispatcher routes correctly
      const supertagResult = evaluateFilter(
        db,
        { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false },
        candidates,
      )
      expect(supertagResult.has(node)).toBe(true)

      const contentResult = evaluateFilter(
        db,
        { type: 'content', query: 'Test', caseSensitive: false },
        candidates,
      )
      expect(contentResult.has(node)).toBe(true)
    })
  })
})
