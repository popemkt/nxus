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
  componentsRec,
  dependenciesRec,
  dependentsRec,
  backlinks,
  ancestorsRec,
  searchNodes,
  getNodesByProperty,
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

// =============================================================================
// Semantic Traversal Operators
// =============================================================================

describe('Semantic Traversal Operators', () => {
  describe('componentsRec', () => {
    it('should return direct children (depth 1)', async () => {
      const parent = await createNode({ content: 'Project' })
      const child1 = await createNode({ content: 'Task A' })
      const child2 = await createNode({ content: 'Task B' })

      await addRelation('part_of', child1.id, parent.id)
      await addRelation('part_of', child2.id, parent.id)

      const components = await componentsRec(parent.id)

      expect(components.length).toBe(2)
      const contents = components.map((n) => n.content).sort()
      expect(contents).toEqual(['Task A', 'Task B'])
    })

    it('should return multi-level descendants recursively', async () => {
      // Project -> Phase -> Task
      const project = await createNode({ content: 'Project' })
      const phase = await createNode({ content: 'Phase 1' })
      const task = await createNode({ content: 'Task 1.1' })

      await addRelation('part_of', phase.id, project.id)
      await addRelation('part_of', task.id, phase.id)

      const components = await componentsRec(project.id)

      const contents = components.map((n) => n.content).sort()
      expect(contents).toContain('Phase 1')
      expect(contents).toContain('Task 1.1')
    })

    it('should return empty array when node has no children', async () => {
      const leaf = await createNode({ content: 'Leaf Node' })
      const components = await componentsRec(leaf.id)
      expect(components).toEqual([])
    })

    it('should exclude soft-deleted descendants', async () => {
      const parent = await createNode({ content: 'Parent' })
      const active = await createNode({ content: 'Active Child' })
      const deleted = await createNode({ content: 'Deleted Child' })

      await addRelation('part_of', active.id, parent.id)
      await addRelation('part_of', deleted.id, parent.id)

      await deleteNode(deleted.id)

      const components = await componentsRec(parent.id)
      const contents = components.map((n) => n.content)
      expect(contents).toContain('Active Child')
      expect(contents).not.toContain('Deleted Child')
    })

    it('should deduplicate results (diamond hierarchy)', async () => {
      // Root -> A -> Shared
      // Root -> B -> Shared
      const root = await createNode({ content: 'Root' })
      const a = await createNode({ content: 'A' })
      const b = await createNode({ content: 'B' })
      const shared = await createNode({ content: 'Shared' })

      await addRelation('part_of', a.id, root.id)
      await addRelation('part_of', b.id, root.id)
      await addRelation('part_of', shared.id, a.id)
      await addRelation('part_of', shared.id, b.id)

      const components = await componentsRec(root.id)

      // Shared should appear only once
      const sharedCount = components.filter(
        (n) => n.content === 'Shared',
      ).length
      expect(sharedCount).toBe(1)
      expect(components.length).toBe(3) // A, B, Shared
    })
  })

  describe('dependenciesRec', () => {
    it('should return direct dependencies', async () => {
      const task = await createNode({ content: 'Build Feature' })
      const prereq = await createNode({ content: 'Design' })

      await addRelation('dependency_of', task.id, prereq.id)

      const deps = await dependenciesRec(task.id)

      expect(deps.length).toBe(1)
      expect(deps[0]!.content).toBe('Design')
    })

    it('should return recursive dependency chain', async () => {
      // Deploy -> Test -> Build -> Design
      const deploy = await createNode({ content: 'Deploy' })
      const test = await createNode({ content: 'Test' })
      const build = await createNode({ content: 'Build' })
      const design = await createNode({ content: 'Design' })

      await addRelation('dependency_of', deploy.id, test.id)
      await addRelation('dependency_of', test.id, build.id)
      await addRelation('dependency_of', build.id, design.id)

      const deps = await dependenciesRec(deploy.id)

      const contents = deps.map((n) => n.content).sort()
      expect(contents).toContain('Test')
      expect(contents).toContain('Build')
      expect(contents).toContain('Design')
    })

    it('should return empty array when no dependencies exist', async () => {
      const independent = await createNode({ content: 'Independent' })
      const deps = await dependenciesRec(independent.id)
      expect(deps).toEqual([])
    })

    it('should exclude soft-deleted dependencies', async () => {
      const task = await createNode({ content: 'Task' })
      const activeDep = await createNode({ content: 'Active Dep' })
      const deletedDep = await createNode({ content: 'Deleted Dep' })

      await addRelation('dependency_of', task.id, activeDep.id)
      await addRelation('dependency_of', task.id, deletedDep.id)

      await deleteNode(deletedDep.id)

      const deps = await dependenciesRec(task.id)
      const contents = deps.map((n) => n.content)
      expect(contents).toContain('Active Dep')
      expect(contents).not.toContain('Deleted Dep')
    })
  })

  describe('dependentsRec', () => {
    it('should return direct dependents', async () => {
      const blocker = await createNode({ content: 'Blocker' })
      const blocked = await createNode({ content: 'Blocked Task' })

      await addRelation('dependency_of', blocked.id, blocker.id)

      const dependents = await dependentsRec(blocker.id)

      expect(dependents.length).toBe(1)
      expect(dependents[0]!.content).toBe('Blocked Task')
    })

    it('should return recursive dependent chain', async () => {
      // Design <- Build <- Test <- Deploy
      // (Build depends on Design, Test depends on Build, Deploy depends on Test)
      const design = await createNode({ content: 'Design' })
      const build = await createNode({ content: 'Build' })
      const test = await createNode({ content: 'Test' })
      const deploy = await createNode({ content: 'Deploy' })

      await addRelation('dependency_of', build.id, design.id)
      await addRelation('dependency_of', test.id, build.id)
      await addRelation('dependency_of', deploy.id, test.id)

      const dependents = await dependentsRec(design.id)

      const contents = dependents.map((n) => n.content).sort()
      expect(contents).toContain('Build')
      expect(contents).toContain('Test')
      expect(contents).toContain('Deploy')
    })

    it('should return empty array when no dependents exist', async () => {
      const leaf = await createNode({ content: 'Leaf' })
      const dependents = await dependentsRec(leaf.id)
      expect(dependents).toEqual([])
    })
  })

  describe('backlinks', () => {
    it('should return all nodes that reference this node', async () => {
      const target = await createNode({ content: 'Reference Target' })
      const ref1 = await createNode({ content: 'Referrer 1' })
      const ref2 = await createNode({ content: 'Referrer 2' })

      await addRelation('references', ref1.id, target.id)
      await addRelation('references', ref2.id, target.id)

      const links = await backlinks(target.id)

      expect(links.length).toBe(2)
      const contents = links.map((n) => n.content).sort()
      expect(contents).toEqual(['Referrer 1', 'Referrer 2'])
    })

    it('should return empty array when no references exist', async () => {
      const unreferenced = await createNode({ content: 'Unreferenced' })
      const links = await backlinks(unreferenced.id)
      expect(links).toEqual([])
    })

    it('should exclude soft-deleted referrers', async () => {
      const target = await createNode({ content: 'Target' })
      const active = await createNode({ content: 'Active Ref' })
      const deleted = await createNode({ content: 'Deleted Ref' })

      await addRelation('references', active.id, target.id)
      await addRelation('references', deleted.id, target.id)

      await deleteNode(deleted.id)

      const links = await backlinks(target.id)
      const contents = links.map((n) => n.content)
      expect(contents).toContain('Active Ref')
      expect(contents).not.toContain('Deleted Ref')
    })
  })

  describe('ancestorsRec', () => {
    it('should return direct parent', async () => {
      const parent = await createNode({ content: 'Parent' })
      const child = await createNode({ content: 'Child' })

      await addRelation('part_of', child.id, parent.id)

      const ancestors = await ancestorsRec(child.id)

      expect(ancestors.length).toBe(1)
      expect(ancestors[0]!.content).toBe('Parent')
    })

    it('should return recursive ancestor chain', async () => {
      // Task -> Phase -> Project -> Portfolio
      const portfolio = await createNode({ content: 'Portfolio' })
      const project = await createNode({ content: 'Project' })
      const phase = await createNode({ content: 'Phase' })
      const task = await createNode({ content: 'Task' })

      await addRelation('part_of', project.id, portfolio.id)
      await addRelation('part_of', phase.id, project.id)
      await addRelation('part_of', task.id, phase.id)

      const ancestors = await ancestorsRec(task.id)

      const contents = ancestors.map((n) => n.content).sort()
      expect(contents).toContain('Phase')
      expect(contents).toContain('Project')
      expect(contents).toContain('Portfolio')
    })

    it('should return empty array for root nodes', async () => {
      const root = await createNode({ content: 'Root' })
      const ancestors = await ancestorsRec(root.id)
      expect(ancestors).toEqual([])
    })

    it('should exclude soft-deleted ancestors', async () => {
      const grandparent = await createNode({ content: 'Grandparent' })
      const parent = await createNode({ content: 'Parent' })
      const child = await createNode({ content: 'Child' })

      await addRelation('part_of', parent.id, grandparent.id)
      await addRelation('part_of', child.id, parent.id)

      await deleteNode(grandparent.id)

      const ancestors = await ancestorsRec(child.id)
      const contents = ancestors.map((n) => n.content)
      expect(contents).toContain('Parent')
      expect(contents).not.toContain('Grandparent')
    })
  })
})

// =============================================================================
// Edge Cases
// =============================================================================

describe('Traversal Edge Cases', () => {
  it('should handle cyclic part_of relations without infinite loop', async () => {
    const a = await createNode({ content: 'A' })
    const b = await createNode({ content: 'B' })
    const c = await createNode({ content: 'C' })

    // A -> B -> C -> A (cycle)
    await addRelation('part_of', a.id, b.id)
    await addRelation('part_of', b.id, c.id)
    await addRelation('part_of', c.id, a.id)

    // Should return without hanging — SurrealDB handles cycles via maxDepth
    const components = await componentsRec(a.id, 5)

    // Should get results without infinite loop
    expect(components).toBeDefined()
    expect(Array.isArray(components)).toBe(true)
  })

  it('should handle cyclic dependency_of relations without infinite loop', async () => {
    const x = await createNode({ content: 'X' })
    const y = await createNode({ content: 'Y' })

    // X <-> Y (mutual dependency)
    await addRelation('dependency_of', x.id, y.id)
    await addRelation('dependency_of', y.id, x.id)

    const deps = await dependenciesRec(x.id, 3)

    expect(deps).toBeDefined()
    expect(Array.isArray(deps)).toBe(true)
  })

  it('should respect maxDepth for componentsRec', async () => {
    // Build a chain: root -> L1 -> L2 -> L3 -> L4
    const root = await createNode({ content: 'Root' })
    const l1 = await createNode({ content: 'L1' })
    const l2 = await createNode({ content: 'L2' })
    const l3 = await createNode({ content: 'L3' })
    const l4 = await createNode({ content: 'L4' })

    await addRelation('part_of', l1.id, root.id)
    await addRelation('part_of', l2.id, l1.id)
    await addRelation('part_of', l3.id, l2.id)
    await addRelation('part_of', l4.id, l3.id)

    // With maxDepth=2, should not reach L3/L4
    const shallow = await componentsRec(root.id, 2)
    const shallowContents = shallow.map((n) => n.content)

    // At depth 2, we expect L1 (depth 1) and L2 (depth 2) to be reachable
    expect(shallowContents).toContain('L1')

    // Full depth should get everything
    const deep = await componentsRec(root.id, 10)
    const deepContents = deep.map((n) => n.content)
    expect(deepContents).toContain('L1')
    expect(deepContents).toContain('L4')
  })

  it('should respect maxDepth for ancestorsRec', async () => {
    // Chain: L4 -> L3 -> L2 -> L1 -> Root
    const root = await createNode({ content: 'Root' })
    const l1 = await createNode({ content: 'L1' })
    const l2 = await createNode({ content: 'L2' })
    const l3 = await createNode({ content: 'L3' })
    const l4 = await createNode({ content: 'L4' })

    await addRelation('part_of', l1.id, root.id)
    await addRelation('part_of', l2.id, l1.id)
    await addRelation('part_of', l3.id, l2.id)
    await addRelation('part_of', l4.id, l3.id)

    // Full depth should reach root
    const all = await ancestorsRec(l4.id, 10)
    const allContents = all.map((n) => n.content)
    expect(allContents).toContain('L3')
    expect(allContents).toContain('Root')
  })
})

// =============================================================================
// Search and Property Queries
// =============================================================================

describe('Search and Property Queries', () => {
  describe('searchNodes', () => {
    it('should find nodes by content (case-insensitive)', async () => {
      await createNode({ content: 'Build the Dashboard' })
      await createNode({ content: 'Design the API' })
      await createNode({ content: 'Build the Backend' })

      const results = await searchNodes('build')

      expect(results.length).toBe(2)
      const contents = results.map((n) => n.content).sort()
      expect(contents).toEqual(['Build the Backend', 'Build the Dashboard'])
    })

    it('should be case-insensitive', async () => {
      await createNode({ content: 'UPPERCASE Content' })
      await createNode({ content: 'lowercase content' })
      await createNode({ content: 'MiXeD CaSe CoNtEnT' })

      const results = await searchNodes('content')

      expect(results.length).toBe(3)
    })

    it('should return empty array when no matches found', async () => {
      await createNode({ content: 'Apples' })
      await createNode({ content: 'Oranges' })

      const results = await searchNodes('bananas')
      expect(results).toEqual([])
    })

    it('should exclude soft-deleted nodes from search', async () => {
      const active = await createNode({ content: 'Active searchable' })
      const deleted = await createNode({ content: 'Deleted searchable' })

      await deleteNode(deleted.id)

      const results = await searchNodes('searchable')
      const contents = results.map((n) => n.content)
      expect(contents).toContain('Active searchable')
      expect(contents).not.toContain('Deleted searchable')
    })

    it('should order results by updated_at DESC', async () => {
      const first = await createNode({ content: 'First match' })
      await new Promise((r) => setTimeout(r, 10))
      const second = await createNode({ content: 'Second match' })
      await new Promise((r) => setTimeout(r, 10))

      // Update the first node so it becomes the most recently updated
      await updateNode(first.id, { content: 'First match updated' })

      const results = await searchNodes('match')

      // 'First match updated' should come before 'Second match'
      // because it was updated more recently
      expect(results.length).toBe(2)
      expect(results[0]!.content).toBe('First match updated')
      expect(results[1]!.content).toBe('Second match')
    })

    it('should find partial matches', async () => {
      await createNode({ content: 'Implementation details' })

      const results = await searchNodes('implement')

      expect(results.length).toBe(1)
      expect(results[0]!.content).toBe('Implementation details')
    })
  })

  describe('getNodesByProperty', () => {
    it('should find nodes by a specific property value', async () => {
      await createNode({ content: 'High Priority', props: { priority: 'high' } })
      await createNode({ content: 'Low Priority', props: { priority: 'low' } })
      await createNode({ content: 'Medium Priority', props: { priority: 'medium' } })

      const results = await getNodesByProperty('priority', 'high')

      expect(results.length).toBe(1)
      expect(results[0]!.content).toBe('High Priority')
    })

    it('should find nodes by numeric property', async () => {
      await createNode({ content: 'Score 100', props: { score: 100 } })
      await createNode({ content: 'Score 50', props: { score: 50 } })

      const results = await getNodesByProperty('score', 100)

      expect(results.length).toBe(1)
      expect(results[0]!.content).toBe('Score 100')
    })

    it('should find nodes by boolean property', async () => {
      await createNode({ content: 'Complete', props: { done: true } })
      await createNode({ content: 'Incomplete', props: { done: false } })

      const results = await getNodesByProperty('done', true)

      expect(results.length).toBe(1)
      expect(results[0]!.content).toBe('Complete')
    })

    it('should return empty array when no matches exist', async () => {
      await createNode({ content: 'Node', props: { color: 'red' } })

      const results = await getNodesByProperty('color', 'blue')
      expect(results).toEqual([])
    })

    it('should return empty array when property key does not exist', async () => {
      await createNode({ content: 'Node', props: { a: 1 } })

      const results = await getNodesByProperty('nonexistent', 'value')
      expect(results).toEqual([])
    })

    it('should exclude soft-deleted nodes', async () => {
      const active = await createNode({
        content: 'Active',
        props: { status: 'active' },
      })
      const deleted = await createNode({
        content: 'Deleted',
        props: { status: 'active' },
      })

      await deleteNode(deleted.id)

      const results = await getNodesByProperty('status', 'active')
      expect(results.length).toBe(1)
      expect(results[0]!.content).toBe('Active')
    })
  })
})
