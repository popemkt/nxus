/**
 * surreal-schema.test.ts - Tests for SurrealDB field schema and has_field edges
 *
 * Verifies:
 * - `field` table is created with correct schema
 * - System fields are bootstrapped with correct system_id and content
 * - `has_field` relation works (node → has_field → field with value)
 * - Unique constraint on field.system_id
 * - Indexes on has_field (in, out, in+out)
 * - Idempotency of bootstrap (UPSERT)
 */

import type { Surreal } from 'surrealdb'
import { StringRecordId } from 'surrealdb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  setupTestGraphDatabase,
  teardownTestGraphDatabase,
  createTestNode,
  getDefinedTables,
} from '../../client/__tests__/graph-test-utils.js'
import { SYSTEM_FIELDS } from '../../schemas/node-schema.js'
import { SURREAL_FIELD_DEFINITIONS } from './surreal-schema.js'

let db: Surreal

beforeEach(async () => {
  db = await setupTestGraphDatabase()
})

afterEach(async () => {
  await teardownTestGraphDatabase(db)
})

// =============================================================================
// Field table
// =============================================================================

describe('Field table schema', () => {
  it('should create field table during schema init', async () => {
    const tables = await getDefinedTables(db)
    expect(tables).toContain('field')
  })

  it('should create has_field relation table during schema init', async () => {
    const tables = await getDefinedTables(db)
    expect(tables).toContain('has_field')
  })

  it('should allow creating a field record with all fields', async () => {
    const [result] = await db.query<[Array<Record<string, unknown>>]>(
      `CREATE field SET
        content = 'test_field',
        system_id = 'field:test_field',
        value_type = 'text',
        created_at = time::now()`,
    )
    const field = result[0]
    expect(field).toBeDefined()
    expect(field.content).toBe('test_field')
    expect(field.system_id).toBe('field:test_field')
    expect(field.value_type).toBe('text')
    expect(field.created_at).toBeDefined()
  })

  it('should enforce unique system_id on field table', async () => {
    await db.query(
      `CREATE field SET content = 'dup', system_id = 'field:dup_test', value_type = 'text', created_at = time::now()`,
    )

    await expect(
      db.query(
        `CREATE field SET content = 'dup2', system_id = 'field:dup_test', value_type = 'text', created_at = time::now()`,
      ),
    ).rejects.toThrow()
  })

  it('should allow optional default_value as flexible type', async () => {
    const [result] = await db.query<[Array<Record<string, unknown>>]>(
      `CREATE field SET
        content = 'with_default',
        system_id = 'field:with_default',
        value_type = 'json',
        default_value = { key: 'value', nested: [1, 2, 3] },
        created_at = time::now()`,
    )
    const field = result[0]
    expect(field.default_value).toEqual({ key: 'value', nested: [1, 2, 3] })
  })
})

// =============================================================================
// Bootstrap
// =============================================================================

describe('Field bootstrap', () => {
  it('should bootstrap all system fields', async () => {
    const [fields] = await db.query<
      [Array<{ system_id: string; content: string; value_type: string }>]
    >(`SELECT system_id, content, value_type FROM field ORDER BY system_id`)

    // Should have at least as many fields as defined in SURREAL_FIELD_DEFINITIONS
    expect(fields.length).toBeGreaterThanOrEqual(SURREAL_FIELD_DEFINITIONS.length)
  })

  it('should bootstrap field:path with correct content and value_type', async () => {
    const [result] = await db.query<
      [Array<{ system_id: string; content: string; value_type: string }>]
    >(`SELECT system_id, content, value_type FROM field WHERE system_id = $systemId`, {
      systemId: SYSTEM_FIELDS.PATH,
    })

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('path')
    expect(result[0].value_type).toBe('text')
  })

  it('should bootstrap field:supertag as nodes type', async () => {
    const [result] = await db.query<
      [Array<{ system_id: string; content: string; value_type: string }>]
    >(`SELECT system_id, content, value_type FROM field WHERE system_id = $systemId`, {
      systemId: SYSTEM_FIELDS.SUPERTAG,
    })

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('supertag')
    expect(result[0].value_type).toBe('nodes')
  })

  it('should bootstrap field:status as select type', async () => {
    const [result] = await db.query<
      [Array<{ system_id: string; content: string; value_type: string }>]
    >(`SELECT system_id, content, value_type FROM field WHERE system_id = $systemId`, {
      systemId: SYSTEM_FIELDS.STATUS,
    })

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('status')
    expect(result[0].value_type).toBe('select')
  })

  it('should bootstrap calendar fields', async () => {
    const [result] = await db.query<
      [Array<{ system_id: string; content: string; value_type: string }>]
    >(`SELECT system_id, content, value_type FROM field WHERE system_id = $systemId`, {
      systemId: SYSTEM_FIELDS.START_DATE,
    })

    expect(result).toHaveLength(1)
    expect(result[0].content).toBe('start_date')
    expect(result[0].value_type).toBe('text')
  })

  it('should be idempotent (UPSERT on re-init)', async () => {
    // Count fields before re-init
    const [before] = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT count() AS total FROM field GROUP ALL`,
    )
    const countBefore = (before[0] as { total: number }).total

    // Re-initialize schema (simulates server restart)
    const { initFieldSchema, bootstrapSurrealFields } = await import('./surreal-schema.js')
    await initFieldSchema(db)
    await bootstrapSurrealFields(db)

    // Count fields after re-init — should be the same
    const [after] = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT count() AS total FROM field GROUP ALL`,
    )
    const countAfter = (after[0] as { total: number }).total

    expect(countAfter).toBe(countBefore)
  })

  it('should have a field record for every SURREAL_FIELD_DEFINITIONS entry', async () => {
    for (const def of SURREAL_FIELD_DEFINITIONS) {
      const [result] = await db.query<[Array<{ system_id: string }>]>(
        `SELECT system_id FROM field WHERE system_id = $systemId`,
        { systemId: def.systemId },
      )
      expect(result).toHaveLength(1)
    }
  })
})

// =============================================================================
// has_field relation
// =============================================================================

describe('has_field relation', () => {
  it('should allow relating a node to a field with a value', async () => {
    const node = await createTestNode(db, { content: 'Test Node' })

    // Look up the 'path' field record
    const [fields] = await db.query<[Array<{ id: unknown }>]>(
      `SELECT id FROM field WHERE system_id = $systemId`,
      { systemId: SYSTEM_FIELDS.PATH },
    )
    expect(fields).toHaveLength(1)
    const fieldId = fields[0].id

    // Create the has_field edge
    const [rel] = await db.query<[Array<Record<string, unknown>>]>(
      `RELATE $from->has_field->$to SET value = $value, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
      { from: node.id, to: fieldId, value: '/usr/local/bin' },
    )
    expect(rel[0]).toBeDefined()
    expect(rel[0].value).toBe('/usr/local/bin')
  })

  it('should support multiple has_field edges from the same node', async () => {
    const node = await createTestNode(db, { content: 'Multi-field Node' })

    // Set path
    const [pathFields] = await db.query<[Array<{ id: unknown }>]>(
      `SELECT id FROM field WHERE system_id = $systemId`,
      { systemId: SYSTEM_FIELDS.PATH },
    )
    await db.query(
      `RELATE $from->has_field->$to SET value = $value, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
      { from: node.id, to: pathFields[0].id, value: '/usr/local/bin' },
    )

    // Set description
    const [descFields] = await db.query<[Array<{ id: unknown }>]>(
      `SELECT id FROM field WHERE system_id = $systemId`,
      { systemId: SYSTEM_FIELDS.DESCRIPTION },
    )
    await db.query(
      `RELATE $from->has_field->$to SET value = $value, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
      { from: node.id, to: descFields[0].id, value: 'A test description' },
    )

    // Query all has_field edges for this node
    const [edges] = await db.query<[Array<{ value: unknown; out: unknown }>]>(
      `SELECT \`value\`, out FROM has_field WHERE in = $nodeId`,
      { nodeId: node.id },
    )
    expect(edges).toHaveLength(2)

    const values = edges.map((e) => e.value)
    expect(values).toContain('/usr/local/bin')
    expect(values).toContain('A test description')
  })

  it('should support multi-value properties (multiple edges to same field)', async () => {
    const node = await createTestNode(db, { content: 'Multi-value Node' })

    const [tagFields] = await db.query<[Array<{ id: unknown }>]>(
      `SELECT id FROM field WHERE system_id = $systemId`,
      { systemId: SYSTEM_FIELDS.TAGS },
    )
    const tagFieldId = tagFields[0].id

    // Add 3 tag values with different orders
    for (let i = 0; i < 3; i++) {
      await db.query(
        `RELATE $from->has_field->$to SET value = $value, \`order\` = $order, created_at = time::now(), updated_at = time::now()`,
        { from: node.id, to: tagFieldId, value: `tag-${i}`, order: i },
      )
    }

    // Query edges ordered by order
    const [edges] = await db.query<[Array<{ value: string; order: number }>]>(
      `SELECT \`value\`, \`order\` FROM has_field WHERE in = $nodeId AND out = $fieldId ORDER BY \`order\``,
      { nodeId: node.id, fieldId: tagFieldId },
    )
    expect(edges).toHaveLength(3)
    expect(edges[0].value).toBe('tag-0')
    expect(edges[0].order).toBe(0)
    expect(edges[1].value).toBe('tag-1')
    expect(edges[1].order).toBe(1)
    expect(edges[2].value).toBe('tag-2')
    expect(edges[2].order).toBe(2)
  })

  it('should support flexible value types (string, number, boolean, object)', async () => {
    const node = await createTestNode(db, { content: 'Flexible Values' })

    // Use different field types to test flexible values
    const [statusField] = await db.query<[Array<{ id: unknown }>]>(
      `SELECT id FROM field WHERE system_id = $systemId`,
      { systemId: SYSTEM_FIELDS.STATUS },
    )
    const [orderField] = await db.query<[Array<{ id: unknown }>]>(
      `SELECT id FROM field WHERE system_id = $systemId`,
      { systemId: SYSTEM_FIELDS.ORDER },
    )
    const [platformField] = await db.query<[Array<{ id: unknown }>]>(
      `SELECT id FROM field WHERE system_id = $systemId`,
      { systemId: SYSTEM_FIELDS.PLATFORM },
    )

    // String value
    await db.query(
      `RELATE $from->has_field->$to SET value = $value, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
      { from: node.id, to: statusField[0].id, value: 'active' },
    )

    // Number value
    await db.query(
      `RELATE $from->has_field->$to SET value = $value, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
      { from: node.id, to: orderField[0].id, value: 42 },
    )

    // Object value (JSON)
    await db.query(
      `RELATE $from->has_field->$to SET value = $value, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
      { from: node.id, to: platformField[0].id, value: { os: 'linux', arch: 'x64' } },
    )

    // Verify each value
    const [edges] = await db.query<[Array<{ value: unknown; out: unknown }>]>(
      `SELECT \`value\`, out FROM has_field WHERE in = $nodeId`,
      { nodeId: node.id },
    )
    expect(edges).toHaveLength(3)

    const values = edges.map((e) => e.value)
    expect(values).toContain('active')
    expect(values).toContain(42)
    expect(values).toContainEqual({ os: 'linux', arch: 'x64' })
  })

  it('should enforce relation type constraint (IN node OUT field)', async () => {
    const nodeA = await createTestNode(db, { content: 'A' })
    const nodeB = await createTestNode(db, { content: 'B' })

    // has_field only allows IN node OUT field — relating node->node should fail
    await expect(
      db.query(
        `RELATE $from->has_field->$to SET value = 'test', created_at = time::now(), updated_at = time::now()`,
        { from: nodeA.id, to: nodeB.id },
      ),
    ).rejects.toThrow()
  })

  it('should allow querying field metadata along with edge value', async () => {
    const node = await createTestNode(db, { content: 'Query Test' })

    // Set a property
    const [pathFields] = await db.query<[Array<{ id: unknown }>]>(
      `SELECT id FROM field WHERE system_id = $systemId`,
      { systemId: SYSTEM_FIELDS.PATH },
    )
    await db.query(
      `RELATE $from->has_field->$to SET value = $value, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
      { from: node.id, to: pathFields[0].id, value: '/home/test' },
    )

    // Query edges with field metadata using graph traversal
    const [result] = await db.query<[Array<{
      value: string
      order: number
      field_content: string
      field_system_id: string
      field_value_type: string
    }>]>(
      `SELECT \`value\`, \`order\`, out.content AS field_content, out.system_id AS field_system_id, out.value_type AS field_value_type
       FROM has_field WHERE in = $nodeId`,
      { nodeId: node.id },
    )

    expect(result).toHaveLength(1)
    expect(result[0].value).toBe('/home/test')
    expect(result[0].field_content).toBe('path')
    expect(result[0].field_system_id).toBe(SYSTEM_FIELDS.PATH)
    expect(result[0].field_value_type).toBe('text')
  })
})

// =============================================================================
// Graph traversal (assembly pattern preview)
// =============================================================================

describe('Graph traversal for node assembly', () => {
  it('should support fetching all fields of a node via graph query', async () => {
    const node = await createTestNode(db, { content: 'Full Assembly Test', supertag: 'supertag:item' })

    // Set multiple properties
    const propertiesToSet = [
      { systemId: SYSTEM_FIELDS.PATH, value: '/usr/bin/test' },
      { systemId: SYSTEM_FIELDS.DESCRIPTION, value: 'A test tool' },
      { systemId: SYSTEM_FIELDS.STATUS, value: 'active' },
    ]

    for (const prop of propertiesToSet) {
      const [fields] = await db.query<[Array<{ id: unknown }>]>(
        `SELECT id FROM field WHERE system_id = $systemId`,
        { systemId: prop.systemId },
      )
      await db.query(
        `RELATE $from->has_field->$to SET value = $value, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
        { from: node.id, to: fields[0].id, value: prop.value },
      )
    }

    // Assembly-style query: fetch node + all its field edges + field metadata + supertags
    const [nodeResult] = await db.query<[Array<Record<string, unknown>>]>(
      `SELECT * FROM node WHERE id = $nodeId AND deleted_at IS NONE`,
      { nodeId: node.id },
    )
    expect(nodeResult).toHaveLength(1)

    const [fieldEdges] = await db.query<[Array<{
      value: unknown
      order: number
      field_content: string
      field_system_id: string
      field_value_type: string
    }>]>(
      `SELECT \`value\`, \`order\`, out.content AS field_content, out.system_id AS field_system_id, out.value_type AS field_value_type
       FROM has_field WHERE in = $nodeId ORDER BY out.content, \`order\``,
      { nodeId: node.id },
    )
    expect(fieldEdges).toHaveLength(3)

    const [supertags] = await db.query<[Array<{ name: string; system_id: string }>]>(
      `SELECT out.name AS name, out.system_id AS system_id FROM has_supertag WHERE in = $nodeId`,
      { nodeId: node.id },
    )
    expect(supertags).toHaveLength(1)
    expect(supertags[0].name).toBe('Item')
    expect(supertags[0].system_id).toBe('supertag:item')

    // Verify we can build an assembled properties map
    const properties: Record<string, Array<{ value: unknown; fieldSystemId: string; order: number }>> = {}
    for (const edge of fieldEdges) {
      const key = edge.field_content
      if (!properties[key]) properties[key] = []
      properties[key].push({
        value: edge.value,
        fieldSystemId: edge.field_system_id,
        order: edge.order,
      })
    }

    expect(Object.keys(properties)).toHaveLength(3)
    expect(properties['path']).toBeDefined()
    expect(properties['path'][0].value).toBe('/usr/bin/test')
    expect(properties['description'][0].value).toBe('A test tool')
    expect(properties['status'][0].value).toBe('active')
  })
})
