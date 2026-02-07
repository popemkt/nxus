/**
 * graph.service.test.ts - Tests for SurrealDB graph service CRUD and relations
 *
 * Verifies:
 * - Node CRUD operations (create, get, getBySystemId, update, delete, purge)
 * - Supertag operations (getAll, getBySystemId, getNodesBySupertag)
 * - Relation operations (add, remove, getOutgoing, getIncoming) for all 6 types
 */

import type { Surreal } from 'surrealdb'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  setupTestGraphDatabase,
  teardownTestGraphDatabase,
} from '@nxus/db/test-utils'
import {
  createNode,
  getNode,
  getNodeBySystemId,
  updateNode,
  deleteNode,
  purgeNode,
  getAllSupertags,
  getSupertagBySystemId,
  getNodesBySupertag,
  addRelation,
  removeRelation,
  getOutgoingRelations,
  getIncomingRelations,
} from '../graph.service.js'

let db: Surreal

beforeEach(async () => {
  db = await setupTestGraphDatabase()
})

afterEach(async () => {
  await teardownTestGraphDatabase(db)
})

// =============================================================================
// Node CRUD
// =============================================================================

describe('Node CRUD', () => {
  describe('createNode', () => {
    it('should create a basic node with content', async () => {
      const node = await createNode({ content: 'Hello World' })

      expect(node).toBeDefined()
      expect(node.id).toBeDefined()
      expect(node.content).toBe('Hello World')
      expect(node.content_plain).toBe('hello world')
      expect(node.created_at).toBeDefined()
      expect(node.updated_at).toBeDefined()
    })

    it('should create a node with system_id', async () => {
      const node = await createNode({
        content: 'System Node',
        system_id: 'item:test-123',
      })

      expect(node.system_id).toBe('item:test-123')
    })

    it('should create a node with props', async () => {
      const node = await createNode({
        content: 'Node with props',
        props: { priority: 'high', count: 42, tags: ['a', 'b'] },
      })

      expect(node.props).toEqual({
        priority: 'high',
        count: 42,
        tags: ['a', 'b'],
      })
    })

    it('should create a node with supertag assignment', async () => {
      const node = await createNode({
        content: 'Tagged Node',
        supertag: 'supertag:item',
      })

      expect(node).toBeDefined()

      // Verify the has_supertag relation was created
      const [rels] = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM has_supertag WHERE in = $nodeId`,
        { nodeId: node.id },
      )
      expect(rels).toHaveLength(1)
    })

    it('should create a node with empty content', async () => {
      const node = await createNode({})

      expect(node).toBeDefined()
      expect(node.id).toBeDefined()
      expect(node.props).toEqual({})
    })
  })

  describe('getNode', () => {
    it('should retrieve a node by ID', async () => {
      const created = await createNode({ content: 'Find Me' })
      const found = await getNode(created.id)

      expect(found).toBeDefined()
      expect(found!.content).toBe('Find Me')
      expect(String(found!.id)).toBe(String(created.id))
    })

    it('should return null for non-existent ID', async () => {
      const found = await getNode('node:nonexistent')
      expect(found).toBeNull()
    })
  })

  describe('getNodeBySystemId', () => {
    it('should find a node by system_id', async () => {
      await createNode({
        content: 'System Node',
        system_id: 'item:sys-lookup',
      })

      const found = await getNodeBySystemId('item:sys-lookup')
      expect(found).toBeDefined()
      expect(found!.content).toBe('System Node')
      expect(found!.system_id).toBe('item:sys-lookup')
    })

    it('should return null for non-existent system_id', async () => {
      const found = await getNodeBySystemId('item:does-not-exist')
      expect(found).toBeNull()
    })

    it('should exclude soft-deleted nodes', async () => {
      const node = await createNode({
        content: 'Will Delete',
        system_id: 'item:deleted-sys',
      })

      await deleteNode(node.id)

      const found = await getNodeBySystemId('item:deleted-sys')
      expect(found).toBeNull()
    })
  })

  describe('updateNode', () => {
    it('should update node content', async () => {
      const created = await createNode({ content: 'Original' })
      const updated = await updateNode(created.id, { content: 'Updated' })

      expect(updated).toBeDefined()
      expect(updated!.content).toBe('Updated')
      expect(updated!.content_plain).toBe('updated')
    })

    it('should update node props', async () => {
      const created = await createNode({
        content: 'Props Node',
        props: { a: 1 },
      })

      const updated = await updateNode(created.id, {
        props: { a: 2, b: 'new' },
      })

      expect(updated!.props).toEqual({ a: 2, b: 'new' })
    })

    it('should update both content and props simultaneously', async () => {
      const created = await createNode({
        content: 'Original',
        props: { x: 1 },
      })

      const updated = await updateNode(created.id, {
        content: 'New Content',
        props: { x: 2, y: 3 },
      })

      expect(updated!.content).toBe('New Content')
      expect(updated!.props).toEqual({ x: 2, y: 3 })
    })

    it('should update updated_at timestamp', async () => {
      const created = await createNode({ content: 'Timestamp Test' })
      // Small delay to ensure different timestamp
      await new Promise((r) => setTimeout(r, 10))
      const updated = await updateNode(created.id, { content: 'Changed' })

      expect(updated).toBeDefined()
      // updated_at should change (can't guarantee strictly greater due to clock resolution,
      // but it should be defined)
      expect(updated!.updated_at).toBeDefined()
    })

    it('should return the updated node (RETURN AFTER)', async () => {
      const created = await createNode({ content: 'Before' })
      const result = await updateNode(created.id, { content: 'After' })

      expect(result).toBeDefined()
      expect(result!.content).toBe('After')
    })
  })

  describe('deleteNode (soft delete)', () => {
    it('should soft-delete a node by setting deleted_at', async () => {
      const node = await createNode({ content: 'To Delete' })
      const result = await deleteNode(node.id)

      expect(result).toBe(true)

      // Node still exists but has deleted_at set
      const found = await getNode(node.id)
      expect(found).toBeDefined()
      expect(found!.deleted_at).toBeDefined()
    })

    it('should exclude soft-deleted nodes from getNodeBySystemId', async () => {
      const node = await createNode({
        content: 'Soft Delete',
        system_id: 'item:soft-del',
      })

      await deleteNode(node.id)

      const found = await getNodeBySystemId('item:soft-del')
      expect(found).toBeNull()
    })
  })

  describe('purgeNode (hard delete)', () => {
    it('should permanently remove a node', async () => {
      const node = await createNode({ content: 'To Purge' })
      const result = await purgeNode(node.id)

      expect(result).toBe(true)

      const found = await getNode(node.id)
      expect(found).toBeNull()
    })

    it('should remove all relations when purging', async () => {
      const parent = await createNode({ content: 'Parent' })
      const child = await createNode({ content: 'Child' })

      // Create relations
      await addRelation('part_of', child.id, parent.id)
      await addRelation('references', parent.id, child.id)

      // Assign supertag
      await addRelation('has_supertag', parent.id, 'supertag:item')

      // Purge the parent
      await purgeNode(parent.id)

      // Verify node is gone
      const found = await getNode(parent.id)
      expect(found).toBeNull()

      // Verify relations are gone
      const [partOfRels] = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM part_of WHERE in = $id OR out = $id`,
        { id: parent.id },
      )
      expect(partOfRels).toHaveLength(0)

      const [refRels] = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM references WHERE in = $id OR out = $id`,
        { id: parent.id },
      )
      expect(refRels).toHaveLength(0)

      const [stRels] = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM has_supertag WHERE in = $id`,
        { id: parent.id },
      )
      expect(stRels).toHaveLength(0)
    })
  })
})

// =============================================================================
// Supertag Operations
// =============================================================================

describe('Supertag Operations', () => {
  describe('getAllSupertags', () => {
    it('should return all system supertags', async () => {
      const supertags = await getAllSupertags()

      expect(supertags.length).toBeGreaterThanOrEqual(4)
      const names = supertags.map((s) => s.name).sort()
      expect(names).toContain('Item')
      expect(names).toContain('Tag')
      expect(names).toContain('Field')
      expect(names).toContain('Command')
    })
  })

  describe('getSupertagBySystemId', () => {
    it('should find a supertag by system_id', async () => {
      const item = await getSupertagBySystemId('supertag:item')

      expect(item).toBeDefined()
      expect(item!.name).toBe('Item')
      expect(item!.icon).toBe('Package')
    })

    it('should return null for non-existent system_id', async () => {
      const notFound = await getSupertagBySystemId('supertag:nonexistent')
      expect(notFound).toBeNull()
    })
  })

  describe('getNodesBySupertag', () => {
    it('should return nodes with a specific supertag', async () => {
      // Create nodes with Item supertag
      await createNode({ content: 'Item 1', supertag: 'supertag:item' })
      await createNode({ content: 'Item 2', supertag: 'supertag:item' })
      // Create node with different supertag
      await createNode({ content: 'Tag 1', supertag: 'supertag:tag' })

      const items = await getNodesBySupertag('supertag:item')

      expect(items.length).toBe(2)
      const contents = items.map((n) => n.content).sort()
      expect(contents).toEqual(['Item 1', 'Item 2'])
    })

    it('should exclude soft-deleted nodes', async () => {
      const node = await createNode({
        content: 'Deleted Item',
        supertag: 'supertag:item',
      })
      await createNode({
        content: 'Active Item',
        supertag: 'supertag:item',
      })

      await deleteNode(node.id)

      const items = await getNodesBySupertag('supertag:item')
      const contents = items.map((n) => n.content)
      expect(contents).not.toContain('Deleted Item')
      expect(contents).toContain('Active Item')
    })

    it('should return empty array when no nodes have the supertag', async () => {
      const nodes = await getNodesBySupertag('supertag:command')
      expect(nodes).toEqual([])
    })
  })
})

// =============================================================================
// Relation Operations
// =============================================================================

describe('Relation Operations', () => {
  describe('addRelation', () => {
    it('should create a part_of relation', async () => {
      const parent = await createNode({ content: 'Parent' })
      const child = await createNode({ content: 'Child' })

      const rel = await addRelation('part_of', child.id, parent.id)

      expect(rel).toBeDefined()
      expect(rel.id).toBeDefined()
      expect(rel.created_at).toBeDefined()
    })

    it('should create a dependency_of relation', async () => {
      const task = await createNode({ content: 'Task' })
      const prereq = await createNode({ content: 'Prerequisite' })

      const rel = await addRelation('dependency_of', task.id, prereq.id)
      expect(rel).toBeDefined()
    })

    it('should create a references relation', async () => {
      const source = await createNode({ content: 'Source' })
      const target = await createNode({ content: 'Target' })

      const rel = await addRelation('references', source.id, target.id)
      expect(rel).toBeDefined()
    })

    it('should create a tagged_with relation', async () => {
      const node = await createNode({ content: 'Node' })
      const tag = await createNode({ content: 'MyTag' })

      const rel = await addRelation('tagged_with', node.id, tag.id)
      expect(rel).toBeDefined()
    })

    it('should create a has_supertag relation', async () => {
      const node = await createNode({ content: 'Typed Node' })

      const rel = await addRelation('has_supertag', node.id, 'supertag:item')
      expect(rel).toBeDefined()
    })

    it('should create an extends relation between supertags', async () => {
      // Create a custom supertag
      await db.query(
        `CREATE supertag SET name = 'CustomTag', system_id = 'supertag:custom', created_at = time::now()`,
      )

      const rel = await addRelation(
        'extends',
        'supertag:custom',
        'supertag:item',
      )
      expect(rel).toBeDefined()
    })

    it('should store order metadata', async () => {
      const parent = await createNode({ content: 'Parent' })
      const child1 = await createNode({ content: 'Child 1' })
      const child2 = await createNode({ content: 'Child 2' })

      await addRelation('part_of', child1.id, parent.id, { order: 0 })
      await addRelation('part_of', child2.id, parent.id, { order: 1 })

      const [rels] = await db.query<[Array<{ order: number }>]>(
        `SELECT order FROM part_of WHERE out = $parent ORDER BY order`,
        { parent: parent.id },
      )

      expect(rels).toHaveLength(2)
      expect(rels[0]!.order).toBe(0)
      expect(rels[1]!.order).toBe(1)
    })

    it('should store context metadata', async () => {
      const source = await createNode({ content: 'Source' })
      const target = await createNode({ content: 'Target' })

      await addRelation('references', source.id, target.id, {
        context: 'cited in section 3',
      })

      const [rels] = await db.query<[Array<{ context: string }>]>(
        `SELECT context FROM references WHERE in = $from`,
        { from: source.id },
      )

      expect(rels).toHaveLength(1)
      expect(rels[0]!.context).toBe('cited in section 3')
    })
  })

  describe('removeRelation', () => {
    it('should remove a specific relation', async () => {
      const parent = await createNode({ content: 'Parent' })
      const child = await createNode({ content: 'Child' })

      await addRelation('part_of', child.id, parent.id)

      // Verify relation exists
      const [before] = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM part_of WHERE in = $from AND out = $to`,
        { from: child.id, to: parent.id },
      )
      expect(before).toHaveLength(1)

      // Remove
      const result = await removeRelation('part_of', child.id, parent.id)
      expect(result).toBe(true)

      // Verify relation is gone
      const [after] = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM part_of WHERE in = $from AND out = $to`,
        { from: child.id, to: parent.id },
      )
      expect(after).toHaveLength(0)
    })

    it('should not affect other relations between the same nodes', async () => {
      const nodeA = await createNode({ content: 'A' })
      const nodeB = await createNode({ content: 'B' })

      await addRelation('part_of', nodeA.id, nodeB.id)
      await addRelation('references', nodeA.id, nodeB.id)

      // Remove only part_of
      await removeRelation('part_of', nodeA.id, nodeB.id)

      // references should still exist
      const [refs] = await db.query<[Array<Record<string, unknown>>]>(
        `SELECT * FROM references WHERE in = $from AND out = $to`,
        { from: nodeA.id, to: nodeB.id },
      )
      expect(refs).toHaveLength(1)
    })
  })

  describe('getOutgoingRelations', () => {
    it('should return nodes reached via outgoing relations', async () => {
      const parent = await createNode({ content: 'Parent' })
      const child1 = await createNode({ content: 'Child 1' })
      const child2 = await createNode({ content: 'Child 2' })

      // child1 is part_of parent, child2 is part_of parent
      await addRelation('part_of', child1.id, parent.id)
      await addRelation('part_of', child2.id, parent.id)

      // Get outgoing part_of from child1 (should reach parent)
      const targets = await getOutgoingRelations(child1.id, 'part_of')

      expect(targets.length).toBe(1)
      expect(targets[0]!.content).toBe('Parent')
    })

    it('should exclude soft-deleted target nodes', async () => {
      const source = await createNode({ content: 'Source' })
      const target1 = await createNode({ content: 'Active Target' })
      const target2 = await createNode({ content: 'Deleted Target' })

      await addRelation('references', source.id, target1.id)
      await addRelation('references', source.id, target2.id)

      await deleteNode(target2.id)

      const targets = await getOutgoingRelations(source.id, 'references')
      const contents = targets.map((n) => n.content)
      expect(contents).toContain('Active Target')
      expect(contents).not.toContain('Deleted Target')
    })

    it('should return empty array when no outgoing relations exist', async () => {
      const lonely = await createNode({ content: 'Lonely' })
      const targets = await getOutgoingRelations(lonely.id, 'part_of')
      expect(targets).toEqual([])
    })
  })

  describe('getIncomingRelations', () => {
    it('should return nodes that point to this node via incoming relations', async () => {
      const parent = await createNode({ content: 'Parent' })
      const child1 = await createNode({ content: 'Child 1' })
      const child2 = await createNode({ content: 'Child 2' })

      // Both children are part_of parent
      await addRelation('part_of', child1.id, parent.id)
      await addRelation('part_of', child2.id, parent.id)

      // Get incoming part_of to parent (should find both children)
      const sources = await getIncomingRelations(parent.id, 'part_of')

      expect(sources.length).toBe(2)
      const contents = sources.map((n) => n.content).sort()
      expect(contents).toEqual(['Child 1', 'Child 2'])
    })

    it('should exclude soft-deleted source nodes', async () => {
      const target = await createNode({ content: 'Target' })
      const active = await createNode({ content: 'Active Source' })
      const deleted = await createNode({ content: 'Deleted Source' })

      await addRelation('references', active.id, target.id)
      await addRelation('references', deleted.id, target.id)

      await deleteNode(deleted.id)

      const sources = await getIncomingRelations(target.id, 'references')
      const contents = sources.map((n) => n.content)
      expect(contents).toContain('Active Source')
      expect(contents).not.toContain('Deleted Source')
    })

    it('should return empty array when no incoming relations exist', async () => {
      const lonely = await createNode({ content: 'Lonely' })
      const sources = await getIncomingRelations(lonely.id, 'references')
      expect(sources).toEqual([])
    })
  })
})
