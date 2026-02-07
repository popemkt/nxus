/**
 * graph-client.test.ts - Smoke tests for SurrealDB graph database client
 *
 * Verifies that the embedded in-memory SurrealDB connection works,
 * schema initialization creates expected tables/fields, and
 * basic CRUD operations function correctly.
 */

import type { Surreal } from 'surrealdb'
import { RecordId, StringRecordId } from 'surrealdb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  setupTestGraphDatabase,
  teardownTestGraphDatabase,
  getSystemSupertags,
  createTestNode,
} from './graph-test-utils.js'
import {
  getGraphDatabase,
  toRecordId,
} from '../graph-client.js'

let db: Surreal

beforeEach(async () => {
  db = await setupTestGraphDatabase()
})

afterEach(async () => {
  await teardownTestGraphDatabase(db)
})

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
})

describe('Schema initialization', () => {
  it('should create node table with expected fields', async () => {
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

  it('should create supertag table with expected fields', async () => {
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

  it('should bootstrap system supertags', async () => {
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
})

describe('toRecordId helper', () => {
  it('should return RecordId as-is', () => {
    const rid = new RecordId('node', 'abc123')
    expect(toRecordId(rid)).toBe(rid)
  })

  it('should convert string with colon to StringRecordId', () => {
    const result = toRecordId('node:abc123')
    expect(result).toBeInstanceOf(StringRecordId)
  })
})

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
})
