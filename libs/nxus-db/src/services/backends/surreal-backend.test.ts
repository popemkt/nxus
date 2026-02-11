/**
 * surreal-backend.test.ts - Comprehensive tests for the SurrealBackend
 *
 * Tests the graph-based NodeBackend implementation using in-memory SurrealDB.
 * Covers:
 * - Node CRUD operations
 * - Graph-based assembly (has_field edges → properties, has_supertag edges → supertags)
 * - Property operations (set, add multi-value, clear, link)
 * - Supertag operations (add, remove, query by supertag)
 * - Supertag inheritance (extends edges, ancestor walking, inherited field defaults)
 * - Query evaluation (supertag, property, content, hasField, temporal, logical)
 * - Event emission via eventBus
 */

import type { Surreal, RecordId } from 'surrealdb'
import { StringRecordId } from 'surrealdb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupTestGraphDatabase,
  teardownTestGraphDatabase,
} from '../../client/__tests__/graph-test-utils.js'
import {
  SYSTEM_FIELDS,
  FIELD_NAMES,
} from '../../schemas/node-schema.js'
import { eventBus } from '../../reactive/event-bus.js'
import { SurrealBackend } from './surreal-backend.js'

let db: Surreal
let backend: SurrealBackend

// Helper to get the string record ID for a supertag
function supertagRecordId(key: string): string {
  return `supertag:${key}`
}

beforeEach(async () => {
  db = await setupTestGraphDatabase()
  backend = new SurrealBackend()
  backend.initWithDb(db)

  // Clear event listeners between tests
  eventBus.clear()
})

afterEach(async () => {
  await teardownTestGraphDatabase(db)
})

// =============================================================================
// Init guard
// =============================================================================

describe('init guard', () => {
  it('should throw when calling methods before init', async () => {
    const uninitBackend = new SurrealBackend()
    await expect(uninitBackend.assembleNode('node:some-id')).rejects.toThrow(
      'SurrealBackend not initialized',
    )
  })
})

// =============================================================================
// Node CRUD
// =============================================================================

describe('createNode → assembleNode round-trip', () => {
  it('should create a node and assemble it back', async () => {
    const nodeId = await backend.createNode({ content: 'Test Node' })
    expect(nodeId).toBeTruthy()
    expect(nodeId).toContain('node:')

    const node = await backend.assembleNode(nodeId)
    expect(node).not.toBeNull()
    expect(node!.content).toBe('Test Node')
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
      systemId: 'test:backend-node',
    })

    const node = await backend.findNodeBySystemId('test:backend-node')
    expect(node).not.toBeNull()
    expect(node!.id).toBe(nodeId)
    expect(node!.systemId).toBe('test:backend-node')
  })

  it('should create a node with ownerId', async () => {
    const parentId = await backend.createNode({ content: 'Parent' })
    const childId = await backend.createNode({
      content: 'Child',
      ownerId: parentId,
    })

    const child = await backend.findNodeById(childId)
    expect(child).not.toBeNull()
    expect(child!.ownerId).toBe(parentId)
  })

  it('should create a node with supertag', async () => {
    const nodeId = await backend.createNode({
      content: 'My Item',
      supertagId: 'supertag:item',
    })

    const node = await backend.assembleNode(nodeId)
    expect(node).not.toBeNull()
    expect(node!.supertags).toHaveLength(1)
    expect(node!.supertags[0].systemId).toBe('supertag:item')
    expect(node!.supertags[0].content).toBe('Item')
  })

  it('should return null when assembling a non-existent node', async () => {
    const node = await backend.assembleNode('node:nonexistent')
    expect(node).toBeNull()
  })
})

describe('findNodeById', () => {
  it('should find a node by its ID', async () => {
    const nodeId = await backend.createNode({ content: 'Findable' })
    const node = await backend.findNodeById(nodeId)
    expect(node).not.toBeNull()
    expect(node!.content).toBe('Findable')
  })

  it('should return null for non-existent ID', async () => {
    const node = await backend.findNodeById('node:does_not_exist')
    expect(node).toBeNull()
  })
})

describe('findNodeBySystemId', () => {
  it('should find a node by system ID', async () => {
    await backend.createNode({
      content: 'System Test',
      systemId: 'test:find-by-system',
    })

    const node = await backend.findNodeBySystemId('test:find-by-system')
    expect(node).not.toBeNull()
    expect(node!.content).toBe('System Test')
  })

  it('should return null for non-existent system ID', async () => {
    const node = await backend.findNodeBySystemId('test:nonexistent')
    expect(node).toBeNull()
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

describe('deleteNode', () => {
  it('should soft-delete a node (assembleNode returns null)', async () => {
    const nodeId = await backend.createNode({ content: 'To Delete' })
    await backend.deleteNode(nodeId)

    // assembleNode filters by deleted_at IS NONE
    const node = await backend.assembleNode(nodeId)
    expect(node).toBeNull()
  })

  it('should still find soft-deleted node via findNodeById', async () => {
    const nodeId = await backend.createNode({ content: 'Soft Delete' })
    await backend.deleteNode(nodeId)

    // findNodeById fetches the raw record without deleted_at filter
    const node = await backend.findNodeById(nodeId)
    expect(node).not.toBeNull()
    expect(node!.deletedAt).not.toBeNull()
  })
})

// =============================================================================
// Property Operations
// =============================================================================

describe('setProperty → assembleNode → verify property', () => {
  it('should set a property and see it in assembly', async () => {
    const nodeId = await backend.createNode({ content: 'Node' })
    await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/usr/bin/test')

    const node = await backend.assembleNode(nodeId)
    expect(node).not.toBeNull()
    expect(node!.properties[FIELD_NAMES.PATH]).toBeDefined()
    expect(node!.properties[FIELD_NAMES.PATH]).toHaveLength(1)
    expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/usr/bin/test')
    expect(node!.properties[FIELD_NAMES.PATH][0].fieldSystemId).toBe(SYSTEM_FIELDS.PATH)
    expect(node!.properties[FIELD_NAMES.PATH][0].fieldName).toBe('path')
  })

  it('should update an existing property (replace)', async () => {
    const nodeId = await backend.createNode({ content: 'Node' })
    await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/first')
    await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/second')

    const node = await backend.assembleNode(nodeId)
    expect(node!.properties[FIELD_NAMES.PATH]).toHaveLength(1)
    expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/second')
  })

  it('should set multiple different properties on the same node', async () => {
    const nodeId = await backend.createNode({ content: 'Multi-prop' })
    await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/test')
    await backend.setProperty(nodeId, SYSTEM_FIELDS.DESCRIPTION, 'A description')
    await backend.setProperty(nodeId, SYSTEM_FIELDS.STATUS, 'active')

    const node = await backend.assembleNode(nodeId)
    expect(node!.properties[FIELD_NAMES.PATH][0].value).toBe('/test')
    expect(node!.properties[FIELD_NAMES.DESCRIPTION][0].value).toBe('A description')
    expect(node!.properties[FIELD_NAMES.STATUS][0].value).toBe('active')
  })

  it('should store non-string values natively', async () => {
    const nodeId = await backend.createNode({ content: 'Values' })
    await backend.setProperty(nodeId, SYSTEM_FIELDS.ORDER, 42)

    const node = await backend.assembleNode(nodeId)
    expect(node!.properties[FIELD_NAMES.ORDER][0].value).toBe(42)
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

  it('should handle clearing a field that does not exist on the node', async () => {
    const nodeId = await backend.createNode({ content: 'Node' })
    // Should not throw
    await backend.clearProperty(nodeId, SYSTEM_FIELDS.PATH)
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

  it('should append link when append=true', async () => {
    const nodeId = await backend.createNode({ content: 'Node' })
    const dep1 = await backend.createNode({ content: 'Dep 1' })
    const dep2 = await backend.createNode({ content: 'Dep 2' })

    await backend.linkNodes(nodeId, SYSTEM_FIELDS.DEPENDENCIES, dep1, true)
    await backend.linkNodes(nodeId, SYSTEM_FIELDS.DEPENDENCIES, dep2, true)

    const node = await backend.assembleNode(nodeId)
    const deps = node!.properties[FIELD_NAMES.DEPENDENCIES]
    expect(deps).toHaveLength(2)
    const sorted = [...deps].sort((a, b) => a.order - b.order)
    expect(sorted[0].value).toBe(dep1)
    expect(sorted[1].value).toBe(dep2)
  })
})

// =============================================================================
// Supertag Operations
// =============================================================================

describe('addNodeSupertag', () => {
  it('should add a supertag to a node', async () => {
    const nodeId = await backend.createNode({ content: 'Plain Node' })

    const added = await backend.addNodeSupertag(nodeId, 'supertag:item')
    expect(added).toBe(true)

    const node = await backend.assembleNode(nodeId)
    expect(node!.supertags).toHaveLength(1)
    expect(node!.supertags[0].systemId).toBe('supertag:item')
    expect(node!.supertags[0].content).toBe('Item')
  })

  it('should return false when adding duplicate supertag', async () => {
    const nodeId = await backend.createNode({
      content: 'Item',
      supertagId: 'supertag:item',
    })

    const added = await backend.addNodeSupertag(nodeId, 'supertag:item')
    expect(added).toBe(false)
  })

  it('should throw when adding non-existent supertag', async () => {
    const nodeId = await backend.createNode({ content: 'Node' })
    await expect(
      backend.addNodeSupertag(nodeId, 'supertag:nonexistent'),
    ).rejects.toThrow('Supertag not found')
  })
})

describe('removeNodeSupertag', () => {
  it('should remove a supertag from a node', async () => {
    const nodeId = await backend.createNode({
      content: 'Item',
      supertagId: 'supertag:item',
    })

    const removed = await backend.removeNodeSupertag(nodeId, 'supertag:item')
    expect(removed).toBe(true)

    const node = await backend.assembleNode(nodeId)
    expect(node!.supertags).toHaveLength(0)
  })

  it('should return false when removing non-existent supertag', async () => {
    const nodeId = await backend.createNode({ content: 'Node' })
    const removed = await backend.removeNodeSupertag(nodeId, 'supertag:item')
    expect(removed).toBe(false)
  })
})

describe('getNodeSupertags', () => {
  it('should return supertag info for a node', async () => {
    const nodeId = await backend.createNode({
      content: 'Tagged Node',
      supertagId: 'supertag:item',
    })

    const supertags = await backend.getNodeSupertags(nodeId)
    expect(supertags).toHaveLength(1)
    expect(supertags[0].systemId).toBe('supertag:item')
    expect(supertags[0].content).toBe('Item')
    expect(typeof supertags[0].order).toBe('number')
  })

  it('should return multiple supertags in order', async () => {
    const nodeId = await backend.createNode({ content: 'Multi-tagged' })
    await backend.addNodeSupertag(nodeId, 'supertag:item')
    await backend.addNodeSupertag(nodeId, 'supertag:tag')

    const supertags = await backend.getNodeSupertags(nodeId)
    expect(supertags).toHaveLength(2)
  })
})

describe('getNodesBySupertags', () => {
  it('should find nodes by supertag (OR mode)', async () => {
    await backend.createNode({ content: 'Item 1', supertagId: 'supertag:item' })
    await backend.createNode({ content: 'Item 2', supertagId: 'supertag:item' })
    await backend.createNode({ content: 'Command', supertagId: 'supertag:command' })

    const items = await backend.getNodesBySupertags(['supertag:item'])
    expect(items).toHaveLength(2)
    expect(items.map((n) => n.content)).toContain('Item 1')
    expect(items.map((n) => n.content)).toContain('Item 2')
  })

  it('should return empty for non-existent supertag', async () => {
    const items = await backend.getNodesBySupertags(['supertag:nonexistent'])
    expect(items).toHaveLength(0)
  })
})

// =============================================================================
// Inheritance
// =============================================================================

describe('Supertag inheritance', () => {
  // Helper: create a custom supertag with extends
  async function createChildSupertag(
    name: string,
    systemId: string,
    parentSystemId: string,
  ) {
    // Create the supertag record
    await db.query(
      `UPSERT supertag:${name.toLowerCase()} SET name = $name, system_id = $systemId, created_at = time::now()`,
      { name, systemId },
    )

    // Create extends edge
    const parentKey = parentSystemId.split(':')[1]
    await db.query(
      `RELATE $from->extends->$to SET created_at = time::now()`,
      {
        from: new StringRecordId(`supertag:${name.toLowerCase()}`),
        to: new StringRecordId(`supertag:${parentKey}`),
      },
    )
  }

  it('should walk the extends chain via getAncestorSupertags', async () => {
    await createChildSupertag('Tool', 'supertag:tool', 'supertag:item')

    const ancestors = await backend.getAncestorSupertags('supertag:tool')
    expect(ancestors).toHaveLength(1)
    expect(ancestors[0]).toBe(supertagRecordId('item'))
  })

  it('should walk multi-level extends chain', async () => {
    await createChildSupertag('Tool', 'supertag:tool', 'supertag:item')
    await createChildSupertag('DevTool', 'supertag:devtool', 'supertag:tool')

    const ancestors = await backend.getAncestorSupertags('supertag:devtool')
    expect(ancestors).toHaveLength(2)
    expect(ancestors[0]).toBe(supertagRecordId('tool'))
    expect(ancestors[1]).toBe(supertagRecordId('item'))
  })

  it('should include nodes with inherited supertags via getNodesBySupertagWithInheritance', async () => {
    await createChildSupertag('Tool', 'supertag:tool', 'supertag:item')

    await backend.createNode({ content: 'Direct Item', supertagId: 'supertag:item' })
    await backend.createNode({ content: 'Tool (inherits Item)', supertagId: 'supertag:tool' })

    const items = await backend.getNodesBySupertagWithInheritance('supertag:item')
    expect(items).toHaveLength(2)
    expect(items.map((n) => n.content)).toContain('Direct Item')
    expect(items.map((n) => n.content)).toContain('Tool (inherits Item)')
  })

  it('should merge inherited field defaults via assembleNodeWithInheritance', async () => {
    await createChildSupertag('Tool', 'supertag:tool', 'supertag:item')

    // Create a node for the #Item supertag with the same system_id,
    // so we can set field definitions on it via has_field edges
    await db.query(
      `CREATE node SET content = '#Item', system_id = 'supertag:item', content_plain = '#item', props = {}, created_at = time::now(), updated_at = time::now()`,
    )

    // Set a default description on the #Item supertag node
    const [descFieldRes] = await db.query<[Array<{ id: RecordId }>]>(
      `SELECT id FROM field WHERE system_id = $systemId`,
      { systemId: SYSTEM_FIELDS.DESCRIPTION },
    )
    const descFieldId = descFieldRes[0].id

    // Find the node representing #Item supertag
    const [itemNodeRes] = await db.query<[Array<{ id: RecordId }>]>(
      `SELECT id FROM node WHERE system_id = 'supertag:item' LIMIT 1`,
    )
    const itemNodeId = itemNodeRes[0].id

    await db.query(
      `RELATE $from->has_field->$to SET value = $value, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
      { from: itemNodeId, to: descFieldId, value: 'default-description' },
    )

    // Create a tool node
    const nodeId = await backend.createNode({
      content: 'My Tool',
      supertagId: 'supertag:tool',
    })

    const node = await backend.assembleNodeWithInheritance(nodeId)
    expect(node).not.toBeNull()

    // The inherited description from #Item should appear
    expect(node!.properties[FIELD_NAMES.DESCRIPTION]).toBeDefined()
    expect(node!.properties[FIELD_NAMES.DESCRIPTION][0].value).toBe('default-description')
  })

  it('should not override existing property with inherited default', async () => {
    await createChildSupertag('Tool', 'supertag:tool', 'supertag:item')

    // Create node for #Item supertag
    await db.query(
      `CREATE node SET content = '#Item', system_id = 'supertag:item', content_plain = '#item', props = {}, created_at = time::now(), updated_at = time::now()`,
    )

    // Set default description on #Item
    const [descFieldRes] = await db.query<[Array<{ id: RecordId }>]>(
      `SELECT id FROM field WHERE system_id = $systemId`,
      { systemId: SYSTEM_FIELDS.DESCRIPTION },
    )
    const [itemNodeRes] = await db.query<[Array<{ id: RecordId }>]>(
      `SELECT id FROM node WHERE system_id = 'supertag:item' LIMIT 1`,
    )
    await db.query(
      `RELATE $from->has_field->$to SET value = 'inherited-desc', \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
      { from: itemNodeRes[0].id, to: descFieldRes[0].id },
    )

    // Create tool node with its own description
    const nodeId = await backend.createNode({
      content: 'My Tool',
      supertagId: 'supertag:tool',
    })
    await backend.setProperty(nodeId, SYSTEM_FIELDS.DESCRIPTION, 'my-own-desc')

    const node = await backend.assembleNodeWithInheritance(nodeId)
    // Node's own value should win
    expect(node!.properties[FIELD_NAMES.DESCRIPTION][0].value).toBe('my-own-desc')
  })
})

// =============================================================================
// Query Evaluation
// =============================================================================

describe('evaluateQuery', () => {
  it('should evaluate a supertag query', async () => {
    await backend.createNode({ content: 'Item A', supertagId: 'supertag:item' })
    await backend.createNode({ content: 'Item B', supertagId: 'supertag:item' })
    await backend.createNode({ content: 'Command', supertagId: 'supertag:command' })

    const result = await backend.evaluateQuery({
      filters: [
        {
          type: 'supertag',
          supertagId: 'supertag:item',
          includeInherited: false,
        },
      ],
      limit: 500,
    })

    expect(result.nodes).toHaveLength(2)
    expect(result.totalCount).toBe(2)
    expect(result.evaluatedAt).toBeInstanceOf(Date)
  })

  it('should evaluate a content filter', async () => {
    await backend.createNode({ content: 'Hello World' })
    await backend.createNode({ content: 'Goodbye World' })
    await backend.createNode({ content: 'Hello Mars' })

    const result = await backend.evaluateQuery({
      filters: [
        { type: 'content', query: 'hello', caseSensitive: false },
      ],
      limit: 500,
    })

    expect(result.nodes).toHaveLength(2)
    expect(result.nodes.map((n) => n.content)).toContain('Hello World')
    expect(result.nodes.map((n) => n.content)).toContain('Hello Mars')
  })

  it('should evaluate a property filter', async () => {
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

  it('should evaluate a hasField filter', async () => {
    const id1 = await backend.createNode({ content: 'Has Path' })
    await backend.setProperty(id1, SYSTEM_FIELDS.PATH, '/test')

    await backend.createNode({ content: 'No Path' })

    const result = await backend.evaluateQuery({
      filters: [
        { type: 'hasField', fieldId: SYSTEM_FIELDS.PATH, negate: false },
      ],
      limit: 500,
    })

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].content).toBe('Has Path')
  })

  it('should evaluate negated hasField filter', async () => {
    const id1 = await backend.createNode({ content: 'Has Path' })
    await backend.setProperty(id1, SYSTEM_FIELDS.PATH, '/test')

    await backend.createNode({ content: 'No Path' })

    const result = await backend.evaluateQuery({
      filters: [
        { type: 'hasField', fieldId: SYSTEM_FIELDS.PATH, negate: true },
      ],
      limit: 500,
    })

    // "No Path" and also system nodes from schema init might appear.
    // At minimum, "No Path" should be in the results and "Has Path" should NOT be.
    const contents = result.nodes.map((n) => n.content)
    expect(contents).toContain('No Path')
    expect(contents).not.toContain('Has Path')
  })

  it('should evaluate logical AND filters', async () => {
    const id1 = await backend.createNode({ content: 'Active Item', supertagId: 'supertag:item' })
    await backend.setProperty(id1, SYSTEM_FIELDS.STATUS, 'active')

    const id2 = await backend.createNode({ content: 'Inactive Item', supertagId: 'supertag:item' })
    await backend.setProperty(id2, SYSTEM_FIELDS.STATUS, 'inactive')

    await backend.createNode({ content: 'Active Command', supertagId: 'supertag:command' })

    const result = await backend.evaluateQuery({
      filters: [
        { type: 'supertag', supertagId: 'supertag:item', includeInherited: false },
        { type: 'property', fieldId: SYSTEM_FIELDS.STATUS, op: 'eq', value: 'active' },
      ],
      limit: 500,
    })

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].content).toBe('Active Item')
  })

  it('should respect limit', async () => {
    for (let i = 0; i < 5; i++) {
      await backend.createNode({ content: `Node ${i}`, supertagId: 'supertag:item' })
    }

    const result = await backend.evaluateQuery({
      filters: [
        { type: 'supertag', supertagId: 'supertag:item', includeInherited: false },
      ],
      limit: 3,
    })

    expect(result.nodes).toHaveLength(3)
    expect(result.totalCount).toBe(5)
  })

  it('should return empty results when no nodes match', async () => {
    const result = await backend.evaluateQuery({
      filters: [
        { type: 'supertag', supertagId: 'supertag:item', includeInherited: false },
      ],
      limit: 500,
    })

    expect(result.nodes).toHaveLength(0)
    expect(result.totalCount).toBe(0)
  })

  it('should exclude soft-deleted nodes', async () => {
    const id = await backend.createNode({ content: 'To Delete', supertagId: 'supertag:item' })
    await backend.deleteNode(id)

    const result = await backend.evaluateQuery({
      filters: [
        { type: 'supertag', supertagId: 'supertag:item', includeInherited: false },
      ],
      limit: 500,
    })

    expect(result.nodes).toHaveLength(0)
  })
})

// =============================================================================
// Event emission
// =============================================================================

describe('Event emission', () => {
  it('should emit node:created on createNode', async () => {
    const events: Array<{ type: string; nodeId: string }> = []
    eventBus.subscribe((e) => {
      events.push({ type: e.type, nodeId: e.nodeId })
    })

    const nodeId = await backend.createNode({ content: 'Test' })

    const createEvent = events.find((e) => e.type === 'node:created')
    expect(createEvent).toBeDefined()
    expect(createEvent!.nodeId).toBe(nodeId)
  })

  it('should emit node:updated on updateNodeContent', async () => {
    const nodeId = await backend.createNode({ content: 'Original' })
    const events: Array<{ type: string; nodeId: string }> = []
    eventBus.subscribe((e) => {
      events.push({ type: e.type, nodeId: e.nodeId })
    })

    await backend.updateNodeContent(nodeId, 'Updated')

    const updateEvent = events.find((e) => e.type === 'node:updated')
    expect(updateEvent).toBeDefined()
    expect(updateEvent!.nodeId).toBe(nodeId)
  })

  it('should emit node:deleted on deleteNode', async () => {
    const nodeId = await backend.createNode({ content: 'To Delete' })
    const events: Array<{ type: string; nodeId: string }> = []
    eventBus.subscribe((e) => {
      events.push({ type: e.type, nodeId: e.nodeId })
    })

    await backend.deleteNode(nodeId)

    const deleteEvent = events.find((e) => e.type === 'node:deleted')
    expect(deleteEvent).toBeDefined()
    expect(deleteEvent!.nodeId).toBe(nodeId)
  })

  it('should emit property:set on setProperty', async () => {
    const nodeId = await backend.createNode({ content: 'Node' })
    const events: Array<{ type: string; nodeId: string; fieldSystemId?: string }> = []
    eventBus.subscribe((e) => {
      events.push({ type: e.type, nodeId: e.nodeId, fieldSystemId: e.fieldSystemId })
    })

    await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/test')

    const setEvent = events.find((e) => e.type === 'property:set')
    expect(setEvent).toBeDefined()
    expect(setEvent!.nodeId).toBe(nodeId)
    expect(setEvent!.fieldSystemId).toBe(SYSTEM_FIELDS.PATH as string)
  })

  it('should emit property:added on addPropertyValue', async () => {
    const nodeId = await backend.createNode({ content: 'Node' })
    const events: Array<{ type: string; nodeId: string }> = []
    eventBus.subscribe((e) => {
      events.push({ type: e.type, nodeId: e.nodeId })
    })

    await backend.addPropertyValue(nodeId, SYSTEM_FIELDS.PATH, 'val')

    const addEvent = events.find((e) => e.type === 'property:added')
    expect(addEvent).toBeDefined()
  })

  it('should emit property:removed on clearProperty', async () => {
    const nodeId = await backend.createNode({ content: 'Node' })
    await backend.setProperty(nodeId, SYSTEM_FIELDS.PATH, '/test')

    const events: Array<{ type: string; nodeId: string }> = []
    eventBus.subscribe((e) => {
      events.push({ type: e.type, nodeId: e.nodeId })
    })

    await backend.clearProperty(nodeId, SYSTEM_FIELDS.PATH)

    const removeEvent = events.find((e) => e.type === 'property:removed')
    expect(removeEvent).toBeDefined()
  })

  it('should emit supertag:added on addNodeSupertag', async () => {
    const nodeId = await backend.createNode({ content: 'Node' })
    const events: Array<{ type: string; nodeId: string; supertagId?: string }> = []
    eventBus.subscribe((e) => {
      events.push({ type: e.type, nodeId: e.nodeId, supertagId: e.supertagId })
    })

    await backend.addNodeSupertag(nodeId, 'supertag:item')

    const addEvent = events.find((e) => e.type === 'supertag:added')
    expect(addEvent).toBeDefined()
    expect(addEvent!.nodeId).toBe(nodeId)
    expect(addEvent!.supertagId).toBe(supertagRecordId('item'))
  })

  it('should emit supertag:removed on removeNodeSupertag', async () => {
    const nodeId = await backend.createNode({
      content: 'Item',
      supertagId: 'supertag:item',
    })

    const events: Array<{ type: string; nodeId: string; supertagId?: string }> = []
    eventBus.subscribe((e) => {
      events.push({ type: e.type, nodeId: e.nodeId, supertagId: e.supertagId })
    })

    await backend.removeNodeSupertag(nodeId, 'supertag:item')

    const removeEvent = events.find((e) => e.type === 'supertag:removed')
    expect(removeEvent).toBeDefined()
    expect(removeEvent!.nodeId).toBe(nodeId)
  })

  it('should emit supertag:added when creating node with supertagId', async () => {
    const events: Array<{ type: string }> = []
    eventBus.subscribe((e) => {
      events.push({ type: e.type })
    })

    await backend.createNode({ content: 'Item', supertagId: 'supertag:item' })

    const stEvents = events.filter((e) => e.type === 'supertag:added')
    expect(stEvents.length).toBeGreaterThanOrEqual(1)
  })
})

// =============================================================================
// Persistence (no-op)
// =============================================================================

describe('save', () => {
  it('should be a no-op (does not throw)', async () => {
    await expect(backend.save()).resolves.toBeUndefined()
  })
})
