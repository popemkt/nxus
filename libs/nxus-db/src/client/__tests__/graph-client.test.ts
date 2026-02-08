/**
 * graph-client.test.ts - Comprehensive tests for SurrealDB graph database client
 *
 * Verifies:
 * - Embedded in-memory connection and lifecycle
 * - Schema initialization (tables, fields, indexes, relations)
 * - System supertag bootstrap
 * - Connection management (get, close, reset)
 * - Helper utilities (toRecordId, createTestNode, getDefinedTables)
 */

import type { Surreal } from 'surrealdb'
import { RecordId, StringRecordId } from 'surrealdb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  setupTestGraphDatabase,
  teardownTestGraphDatabase,
  getSystemSupertags,
  createTestNode,
  getDefinedTables,
} from './graph-test-utils.js'
import {
  getGraphDatabase,
  resetGraphDatabase,
  closeGraphDatabase,
  createEmbeddedGraphDatabase,
  setGraphDatabase,
  toRecordId,
} from '../graph-client.js'

let db: Surreal

beforeEach(async () => {
  db = await setupTestGraphDatabase()
})

afterEach(async () => {
  await teardownTestGraphDatabase(db)
})

// =============================================================================
// Connection lifecycle
// =============================================================================

describe('Embedded connection', () => {
  it('should connect to in-memory SurrealDB', () => {
    expect(db).toBeDefined()
  })

  it('should execute basic queries', async () => {
    const [result] = await db.query<[number]>('RETURN 1 + 1')
    expect(result).toBe(2)
  })

  it('should be accessible via getGraphDatabase() after setup', () => {
    const instance = getGraphDatabase()
    expect(instance).toBe(db)
  })

  it('should support skipSchema option', async () => {
    const bare = await createEmbeddedGraphDatabase({
      namespace: 'bare',
      database: 'bare',
      skipSchema: true,
    })

    try {
      // Without schema init, system supertags should not exist
      const [supertags] = await bare.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM supertag`,
      )
      expect(supertags).toHaveLength(0)
    } finally {
      await bare.close()
    }
  })

  it('should support custom namespace and database', async () => {
    const custom = await createEmbeddedGraphDatabase({
      namespace: 'custom_ns',
      database: 'custom_db',
    })

    try {
      // Should have schema initialized in the custom namespace/database
      const [result] = await custom.query<[number]>('RETURN 42')
      expect(result).toBe(42)

      // Should be able to create nodes (schema was initialized)
      const [nodes] = await custom.query<[Array<Record<string, unknown>>]>(
        `CREATE node SET content = 'custom', created_at = time::now(), updated_at = time::now()`,
      )
      expect(nodes[0]).toBeDefined()
      expect(nodes[0].content).toBe('custom')
    } finally {
      await custom.close()
    }
  })
})

describe('Connection management', () => {
  it('getGraphDatabase should throw when not initialized', () => {
    // Reset singleton so it's uninitialized
    resetGraphDatabase()

    expect(() => getGraphDatabase()).toThrow(
      'Graph database not initialized. Call initGraphDatabase() first.',
    )

    // Restore for afterEach cleanup
    setGraphDatabase(db)
  })

  it('closeGraphDatabase should close connection and reset singleton', async () => {
    // Set the singleton to our test db
    setGraphDatabase(db)

    await closeGraphDatabase()

    // After closing, getGraphDatabase should throw
    expect(() => getGraphDatabase()).toThrow(
      'Graph database not initialized',
    )

    // Re-create for afterEach cleanup
    db = await setupTestGraphDatabase()
  })

  it('closeGraphDatabase should be safe to call when no connection exists', async () => {
    resetGraphDatabase()

    // Should not throw when there's nothing to close
    await expect(closeGraphDatabase()).resolves.toBeUndefined()

    // Restore for afterEach cleanup
    setGraphDatabase(db)
  })

  it('resetGraphDatabase should clear singleton without closing', () => {
    resetGraphDatabase()

    expect(() => getGraphDatabase()).toThrow()

    // Restore for afterEach cleanup
    setGraphDatabase(db)
  })

  it('setGraphDatabase should make instance available via getGraphDatabase', async () => {
    const other = await createEmbeddedGraphDatabase({
      namespace: 'other',
      database: 'other',
    })

    try {
      setGraphDatabase(other)
      expect(getGraphDatabase()).toBe(other)
    } finally {
      await other.close()
      // Restore original
      setGraphDatabase(db)
    }
  })
})

// =============================================================================
// Schema: Tables
// =============================================================================

describe('Schema initialization', () => {
  it('should create all expected tables', async () => {
    const tables = await getDefinedTables(db)

    const expectedTables = [
      'node',
      'supertag',
      'has_supertag',
      'extends',
      'part_of',
      'dependency_of',
      'references',
      'tagged_with',
    ]

    for (const table of expectedTables) {
      expect(tables).toContain(table)
    }
  })

  // ---------------------------------------------------------------------------
  // Node table
  // ---------------------------------------------------------------------------

  it('should create node table with all expected fields', async () => {
    const [result] = await db.query<[Array<Record<string, unknown>>]>(
      `CREATE node SET
        content = 'test',
        content_plain = 'test',
        system_id = 'test-1',
        props = { foo: 'bar' },
        created_at = time::now(),
        updated_at = time::now()
      `,
    )
    const node = result[0]
    expect(node).toBeDefined()
    expect(node.content).toBe('test')
    expect(node.content_plain).toBe('test')
    expect(node.system_id).toBe('test-1')
    expect(node.props).toEqual({ foo: 'bar' })
    expect(node.created_at).toBeDefined()
    expect(node.updated_at).toBeDefined()
    expect(node.deleted_at).toBeUndefined()
  })

  it('should allow node with only required defaults (content optional)', async () => {
    // content, content_plain, system_id, deleted_at are all option<T>
    // created_at and updated_at have defaults
    const [result] = await db.query<[Array<Record<string, unknown>>]>(
      `CREATE node SET props = {}`,
    )
    const node = result[0]
    expect(node).toBeDefined()
    expect(node.created_at).toBeDefined()
    expect(node.updated_at).toBeDefined()
    // Optional fields should be absent / NONE
    expect(node.content).toBeUndefined()
    expect(node.system_id).toBeUndefined()
    expect(node.deleted_at).toBeUndefined()
  })

  it('should support deleted_at for soft delete', async () => {
    const [created] = await db.query<[Array<Record<string, unknown>>]>(
      `CREATE node SET content = 'will delete', created_at = time::now(), updated_at = time::now()`,
    )
    const node = created[0]
    expect(node.deleted_at).toBeUndefined()

    // Soft-delete
    const [updated] = await db.query<[Array<Record<string, unknown>>]>(
      `UPDATE $id SET deleted_at = time::now()`,
      { id: node.id },
    )
    expect(updated[0].deleted_at).toBeDefined()
  })

  it('should support flexible props with nested objects and arrays', async () => {
    const [result] = await db.query<[Array<Record<string, unknown>>]>(
      `CREATE node SET
        content = 'complex props',
        props = {
          tags: ['a', 'b'],
          meta: { nested: true, count: 42 },
          url: 'https://example.com'
        },
        created_at = time::now(),
        updated_at = time::now()
      `,
    )
    const node = result[0]
    const props = node.props as Record<string, unknown>
    expect(props.tags).toEqual(['a', 'b'])
    expect(props.meta).toEqual({ nested: true, count: 42 })
    expect(props.url).toBe('https://example.com')
  })

  // ---------------------------------------------------------------------------
  // Supertag table
  // ---------------------------------------------------------------------------

  it('should create supertag table with all expected fields', async () => {
    const [result] = await db.query<[Array<Record<string, unknown>>]>(
      `CREATE supertag SET
        name = 'TestTag',
        system_id = 'supertag:test',
        color = '#ff0000',
        icon = 'Star',
        created_at = time::now()
      `,
    )
    const tag = result[0]
    expect(tag).toBeDefined()
    expect(tag.name).toBe('TestTag')
    expect(tag.system_id).toBe('supertag:test')
    expect(tag.color).toBe('#ff0000')
    expect(tag.icon).toBe('Star')
  })

  it('should support field_schema as flexible array on supertag', async () => {
    const fieldSchema = [
      { name: 'priority', type: 'select', options: ['low', 'medium', 'high'] },
      { name: 'due_date', type: 'date' },
    ]
    const [result] = await db.query<[Array<Record<string, unknown>>]>(
      `CREATE supertag SET
        name = 'Task',
        system_id = 'supertag:task',
        field_schema = $schema,
        created_at = time::now()
      `,
      { schema: fieldSchema },
    )
    const tag = result[0]
    expect(tag.field_schema).toEqual(fieldSchema)
  })

  // ---------------------------------------------------------------------------
  // Relation tables
  // ---------------------------------------------------------------------------

  it('should create all 6 relation tables', async () => {
    // Create test data for relations
    const [nodes] = await db.query<[Array<{ id: RecordId }>]>(
      `CREATE node SET content = 'A', created_at = time::now(), updated_at = time::now();
       CREATE node SET content = 'B', created_at = time::now(), updated_at = time::now();`,
    )
    const nodeA = nodes[0]
    const [nodesB] = await db.query<[Array<{ id: RecordId }>]>(
      `SELECT * FROM node WHERE content = 'B'`,
    )
    const nodeB = nodesB[0]

    // Test each relation type
    const relationTypes = [
      'part_of',
      'dependency_of',
      'references',
      'tagged_with',
    ]

    for (const relType of relationTypes) {
      const [rel] = await db.query<[Array<Record<string, unknown>>]>(
        `RELATE $from->${relType}->$to SET created_at = time::now()`,
        { from: nodeA.id, to: nodeB.id },
      )
      expect(rel[0]).toBeDefined()
      expect(rel[0].in).toBeDefined()
      expect(rel[0].out).toBeDefined()
    }

    // Test has_supertag (node -> supertag)
    const [hasSt] = await db.query<[Array<Record<string, unknown>>]>(
      `RELATE $from->has_supertag->$to SET order = 0, created_at = time::now()`,
      { from: nodeA.id, to: new StringRecordId('supertag:item') },
    )
    expect(hasSt[0]).toBeDefined()

    // Test extends (supertag -> supertag)
    await db.query(
      `CREATE supertag SET name = 'Child', system_id = 'supertag:child', created_at = time::now()`,
    )
    const [ext] = await db.query<[Array<Record<string, unknown>>]>(
      `RELATE $from->extends->$to SET created_at = time::now()`,
      {
        from: new StringRecordId('supertag:child'),
        to: new StringRecordId('supertag:item'),
      },
    )
    expect(ext[0]).toBeDefined()
  })

  it('should store order metadata on part_of relation', async () => {
    const nodeA = await createTestNode(db, { content: 'Parent' })
    const nodeB = await createTestNode(db, { content: 'Child 1' })
    const nodeC = await createTestNode(db, { content: 'Child 2' })

    await db.query(
      `RELATE $from->part_of->$to SET order = 0, created_at = time::now()`,
      { from: nodeB.id, to: nodeA.id },
    )
    await db.query(
      `RELATE $from->part_of->$to SET order = 1, created_at = time::now()`,
      { from: nodeC.id, to: nodeA.id },
    )

    const [rels] = await db.query<
      [Array<{ order: number; in: RecordId; out: RecordId }>]
    >(`SELECT * FROM part_of WHERE out = $parent ORDER BY order`, {
      parent: nodeA.id,
    })

    expect(rels).toHaveLength(2)
    expect(rels[0].order).toBe(0)
    expect(rels[1].order).toBe(1)
  })

  it('should store context metadata on references relation', async () => {
    const nodeA = await createTestNode(db, { content: 'Source' })
    const nodeB = await createTestNode(db, { content: 'Target' })

    await db.query(
      `RELATE $from->references->$to SET context = $ctx, created_at = time::now()`,
      { from: nodeA.id, to: nodeB.id, ctx: 'mentioned in discussion' },
    )

    const [rels] = await db.query<[Array<{ context: string }>]>(
      `SELECT context FROM references WHERE in = $from`,
      { from: nodeA.id },
    )

    expect(rels).toHaveLength(1)
    expect(rels[0].context).toBe('mentioned in discussion')
  })

  it('should store order metadata on has_supertag relation', async () => {
    const node = await createTestNode(db, { content: 'Multi-tagged' })

    await db.query(
      `RELATE $from->has_supertag->$to SET order = 0, created_at = time::now()`,
      { from: node.id, to: new StringRecordId('supertag:item') },
    )
    await db.query(
      `RELATE $from->has_supertag->$to SET order = 1, created_at = time::now()`,
      { from: node.id, to: new StringRecordId('supertag:tag') },
    )

    const [rels] = await db.query<[Array<{ order: number }>]>(
      `SELECT order FROM has_supertag WHERE in = $node ORDER BY order`,
      { node: node.id },
    )

    expect(rels).toHaveLength(2)
    expect(rels[0].order).toBe(0)
    expect(rels[1].order).toBe(1)
  })

  it('should enforce relation type constraints (has_supertag: node -> supertag)', async () => {
    const nodeA = await createTestNode(db, { content: 'A' })
    const nodeB = await createTestNode(db, { content: 'B' })

    // has_supertag only allows IN node OUT supertag — relating node->node should fail
    await expect(
      db.query(
        `RELATE $from->has_supertag->$to SET created_at = time::now()`,
        { from: nodeA.id, to: nodeB.id },
      ),
    ).rejects.toThrow()
  })

  it('should enforce relation type constraints (extends: supertag -> supertag)', async () => {
    const node = await createTestNode(db, { content: 'Not a supertag' })

    // extends only allows IN supertag OUT supertag — relating node->supertag should fail
    await expect(
      db.query(
        `RELATE $from->extends->$to SET created_at = time::now()`,
        { from: node.id, to: new StringRecordId('supertag:item') },
      ),
    ).rejects.toThrow()
  })

  // ---------------------------------------------------------------------------
  // Indexes
  // ---------------------------------------------------------------------------

  it('should enforce unique system_id index on node', async () => {
    await db.query(
      `CREATE node SET system_id = 'unique-1', created_at = time::now(), updated_at = time::now()`,
    )

    await expect(
      db.query(
        `CREATE node SET system_id = 'unique-1', created_at = time::now(), updated_at = time::now()`,
      ),
    ).rejects.toThrow()
  })

  it('should enforce unique system_id index on supertag', async () => {
    await db.query(
      `CREATE supertag SET name = 'Dup', system_id = 'supertag:dup', created_at = time::now()`,
    )

    await expect(
      db.query(
        `CREATE supertag SET name = 'Dup2', system_id = 'supertag:dup', created_at = time::now()`,
      ),
    ).rejects.toThrow()
  })

  it('should allow querying by content_plain index', async () => {
    await createTestNode(db, { content: 'Searchable Content' })
    await createTestNode(db, { content: 'Other stuff' })

    const [found] = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM node WHERE content_plain = 'searchable content'`,
    )
    expect(found).toHaveLength(1)
    expect(found[0].content).toBe('Searchable Content')
  })

  it('should allow querying by deleted_at index', async () => {
    const alive = await createTestNode(db, { content: 'Alive' })
    const deleted = await createTestNode(db, { content: 'Deleted' })

    await db.query(`UPDATE $id SET deleted_at = time::now()`, {
      id: deleted.id,
    })

    // Query non-deleted nodes (deleted_at is NONE)
    const [active] = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM node WHERE deleted_at IS NONE`,
    )
    const activeContents = active.map((n) => n.content)
    expect(activeContents).toContain('Alive')
    expect(activeContents).not.toContain('Deleted')
  })

  // ---------------------------------------------------------------------------
  // System supertags
  // ---------------------------------------------------------------------------

  it('should bootstrap exactly 4 system supertags', async () => {
    const supertags = await getSystemSupertags(db)

    expect(supertags.length).toBe(4)

    const names = supertags.map((s) => s.name).sort()
    expect(names).toEqual(['Command', 'Field', 'Item', 'Tag'])

    const systemIds = supertags.map((s) => s.system_id).sort()
    expect(systemIds).toEqual([
      'supertag:command',
      'supertag:field',
      'supertag:item',
      'supertag:tag',
    ])
  })

  it('should bootstrap supertags with correct icons', async () => {
    const [supertags] = await db.query<
      [Array<{ system_id: string; icon: string }>]
    >(`SELECT system_id, icon FROM supertag ORDER BY system_id`)

    const iconMap = Object.fromEntries(
      supertags.map((s) => [s.system_id, s.icon]),
    )
    expect(iconMap['supertag:command']).toBe('Terminal')
    expect(iconMap['supertag:field']).toBe('TextAa')
    expect(iconMap['supertag:item']).toBe('Package')
    expect(iconMap['supertag:tag']).toBe('Tag')
  })

  it('should use UPSERT for system supertags (idempotent re-init)', async () => {
    // Get initial supertags
    const before = await getSystemSupertags(db)
    expect(before).toHaveLength(4)

    // Re-initialize schema (simulates server restart)
    const { initGraphSchema } = await import('../graph-client.js')
    await initGraphSchema(db)

    // Should still have exactly 4 — not duplicated
    const after = await getSystemSupertags(db)
    expect(after).toHaveLength(4)
  })

  it('system supertags should have stable record IDs', async () => {
    // Verify that bootstrap uses known record IDs (supertag:item, etc.)
    const [item] = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM supertag:item`,
    )
    expect(item).toHaveLength(1)
    expect(item[0].name).toBe('Item')

    const [tag] = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM supertag:tag`,
    )
    expect(tag).toHaveLength(1)
    expect(tag[0].name).toBe('Tag')

    const [field] = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM supertag:field`,
    )
    expect(field).toHaveLength(1)
    expect(field[0].name).toBe('Field')

    const [cmd] = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM supertag:command`,
    )
    expect(cmd).toHaveLength(1)
    expect(cmd[0].name).toBe('Command')
  })
})

// =============================================================================
// toRecordId helper
// =============================================================================

describe('toRecordId helper', () => {
  it('should return RecordId as-is', () => {
    const rid = new RecordId('node', 'abc123')
    expect(toRecordId(rid)).toBe(rid)
  })

  it('should convert string with colon to StringRecordId', () => {
    const result = toRecordId('node:abc123')
    expect(result).toBeInstanceOf(StringRecordId)
  })

  it('should handle supertag record id strings', () => {
    const result = toRecordId('supertag:item')
    expect(result).toBeInstanceOf(StringRecordId)
  })
})

// =============================================================================
// Test utilities
// =============================================================================

describe('Test utilities', () => {
  it('createTestNode should create a node with content', async () => {
    const node = await createTestNode(db, {
      content: 'Hello World',
      system_id: 'test-node-1',
      props: { priority: 'high' },
    })

    expect(node).toBeDefined()
    expect(node.content).toBe('Hello World')
    expect(node.content_plain).toBe('hello world')
    expect(node.system_id).toBe('test-node-1')
    expect(node.props).toEqual({ priority: 'high' })
  })

  it('createTestNode should assign supertag when provided', async () => {
    const node = await createTestNode(db, {
      content: 'Tagged Node',
      supertag: 'supertag:item',
    })

    // Verify the supertag relation exists
    const [relations] = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM has_supertag WHERE in = $nodeId`,
      { nodeId: node.id },
    )
    expect(relations.length).toBe(1)
  })

  it('createTestNode should work with minimal data', async () => {
    const node = await createTestNode(db, {})

    expect(node).toBeDefined()
    expect(node.id).toBeDefined()
    expect(node.props).toEqual({})
    expect(node.created_at).toBeDefined()
    expect(node.updated_at).toBeDefined()
  })

  it('getDefinedTables should return all schema tables', async () => {
    const tables = await getDefinedTables(db)

    expect(tables.length).toBeGreaterThanOrEqual(8)
    expect(tables).toContain('node')
    expect(tables).toContain('supertag')
    expect(tables).toContain('has_supertag')
    expect(tables).toContain('part_of')
  })
})
