/**
 * graph.integration.test.ts - Integration tests for the full SurrealDB → Event Bus pipeline
 *
 * Verifies:
 * - Graph service mutations → event bus subscriber receives correct events
 * - Supertag add/remove → supertag events fire with correct metadata
 * - Full CRUD lifecycle → complete event lifecycle from create to delete
 * - graph.server.ts type converters: graphNodeToItem, serializeGraphNode, itemToGraphProps
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  setupTestGraphDatabase,
  teardownTestGraphDatabase,
} from '@nxus/db/test-utils'
import { eventBus } from '@nxus/db/server'
import {
  
  addRelation,
  componentsRec,
  createNode,
  deleteNode,
  getIncomingRelations,
  getNode,
  getNodeBySystemId,
  getNodesBySupertag,
  getOutgoingRelations,
  purgeNode,
  removeRelation,
  searchNodes,
  updateNode
} from '../graph.service.js'
import type {GraphNode} from '../graph.service.js';
import type { EventFilter, MutationEvent } from '@nxus/db/server'
import type { RecordId, Surreal } from 'surrealdb'

// ============================================================================
// Test Setup
// ============================================================================

let db: Surreal
let events: Array<MutationEvent>
let unsubscribe: () => void

beforeEach(async () => {
  db = await setupTestGraphDatabase()
  events = []
  unsubscribe = eventBus.subscribe((event) => {
    events.push(event)
  })
})

afterEach(async () => {
  unsubscribe()
  eventBus.clear()
  await teardownTestGraphDatabase(db)
})

// ============================================================================
// Integration: Graph Service → Event Bus Pipeline
// ============================================================================

describe('Graph Service → Event Bus Integration Pipeline', () => {
  it('should deliver node:created event to subscriber when node is created', async () => {
    const received: Array<MutationEvent> = []
    const unsub = eventBus.subscribe((e) => received.push(e), {
      types: ['node:created'],
    })

    const node = await createNode({
      content: 'Integration Test Node',
      system_id: 'item:integration-1',
    })

    expect(received).toHaveLength(1)
    expect(received[0]!.type).toBe('node:created')
    expect(received[0]!.nodeId).toBe(String(node.id))
    expect(received[0]!.afterValue).toEqual(
      expect.objectContaining({
        content: 'Integration Test Node',
        system_id: 'item:integration-1',
      }),
    )

    unsub()
  })

  it('should deliver supertag:added event when supertag is assigned to a node', async () => {
    const supertagEvents: Array<MutationEvent> = []
    const unsub = eventBus.subscribe((e) => supertagEvents.push(e), {
      types: ['supertag:added'],
    })

    const node = await createNode({
      content: 'Item Node',
      supertag: 'supertag:item',
    })

    expect(supertagEvents).toHaveLength(1)
    expect(supertagEvents[0]!.nodeId).toBe(String(node.id))
    expect(supertagEvents[0]!.supertagId).toContain('supertag')

    unsub()
  })

  it('should deliver supertag:removed event when supertag is detached from a node', async () => {
    const node = await createNode({ content: 'Node' })
    await addRelation('has_supertag', node.id, 'supertag:tag')

    const removeEvents: Array<MutationEvent> = []
    const unsub = eventBus.subscribe((e) => removeEvents.push(e), {
      types: ['supertag:removed'],
    })

    await removeRelation('has_supertag', node.id, 'supertag:tag')

    expect(removeEvents).toHaveLength(1)
    expect(removeEvents[0]!.nodeId).toBe(String(node.id))
    expect(removeEvents[0]!.supertagId).toContain('supertag')

    unsub()
  })

  it('should deliver complete event lifecycle for full CRUD cycle', async () => {
    // 1. Create
    const node = await createNode({
      content: 'Lifecycle Node',
      system_id: 'item:lifecycle',
      props: { status: 'active' },
    })

    // 2. Update
    await updateNode(node.id, {
      content: 'Updated Lifecycle Node',
      props: { status: 'completed' },
    })

    // 3. Soft delete
    await deleteNode(node.id)

    // Verify complete lifecycle
    const nodeEvents = events.filter((e) => e.nodeId === String(node.id))
    const types = nodeEvents.map((e) => e.type)

    expect(types).toContain('node:created')
    expect(types).toContain('node:updated')
    expect(types).toContain('node:deleted')

    // Verify ordering: created before updated before deleted
    const createdIdx = types.indexOf('node:created')
    const updatedIdx = types.indexOf('node:updated')
    const deletedIdx = types.indexOf('node:deleted')
    expect(createdIdx).toBeLessThan(updatedIdx)
    expect(updatedIdx).toBeLessThan(deletedIdx)
  })

  it('should deliver before/after values in update events for change tracking', async () => {
    const node = await createNode({
      content: 'Before Content',
      props: { version: 1 },
    })
    events = [] // Clear creation events

    await updateNode(node.id, {
      content: 'After Content',
      props: { version: 2 },
    })

    const updated = events.find((e) => e.type === 'node:updated')
    expect(updated).toBeDefined()

    const before = updated!.beforeValue as Record<string, unknown>
    expect(before.content).toBe('Before Content')
    expect(before.props).toEqual({ version: 1 })

    const after = updated!.afterValue as Record<string, unknown>
    expect(after.content).toBe('After Content')
    expect(after.props).toEqual({ version: 2 })
  })

  it('should filter events by type for targeted subscribers', async () => {
    const updateOnly: Array<MutationEvent> = []
    const unsub = eventBus.subscribe((e) => updateOnly.push(e), {
      types: ['node:updated'],
    })

    const node = await createNode({ content: 'Filter Test' })
    await updateNode(node.id, { content: 'Changed' })
    await deleteNode(node.id)

    // Only update events should be received
    expect(updateOnly).toHaveLength(1)
    expect(updateOnly[0]!.type).toBe('node:updated')

    unsub()
  })

  it('should filter events by nodeId for node-specific subscribers', async () => {
    const nodeA = await createNode({ content: 'Node A' })
    const nodeB = await createNode({ content: 'Node B' })

    const nodeAEvents: Array<MutationEvent> = []
    const unsub = eventBus.subscribe((e) => nodeAEvents.push(e), {
      nodeIds: [String(nodeA.id)],
    })

    // Both nodes are updated
    await updateNode(nodeA.id, { content: 'Node A Updated' })
    await updateNode(nodeB.id, { content: 'Node B Updated' })

    // Only node A events should be received
    expect(nodeAEvents.every((e) => e.nodeId === String(nodeA.id))).toBe(true)

    unsub()
  })

  it('should support multiple concurrent subscribers independently', async () => {
    const allEvents: Array<MutationEvent> = []
    const createdOnly: Array<MutationEvent> = []
    const deletedOnly: Array<MutationEvent> = []

    const unsub1 = eventBus.subscribe((e) => allEvents.push(e))
    const unsub2 = eventBus.subscribe((e) => createdOnly.push(e), {
      types: ['node:created'],
    })
    const unsub3 = eventBus.subscribe((e) => deletedOnly.push(e), {
      types: ['node:deleted'],
    })

    const node = await createNode({ content: 'Multi Sub' })
    await updateNode(node.id, { content: 'Changed' })
    await deleteNode(node.id)

    // All subscriber receives everything (+ the events from the main test subscriber)
    expect(allEvents.length).toBeGreaterThanOrEqual(3)
    expect(createdOnly.every((e) => e.type === 'node:created')).toBe(true)
    expect(deletedOnly.every((e) => e.type === 'node:deleted')).toBe(true)

    unsub1()
    unsub2()
    unsub3()
  })
})

// ============================================================================
// Integration: Supertag Lifecycle Events
// ============================================================================

describe('Supertag Lifecycle Events', () => {
  it('should emit supertag:added then verify node appears in getNodesBySupertag', async () => {
    const supertagEvents: Array<MutationEvent> = []
    const unsub = eventBus.subscribe((e) => supertagEvents.push(e), {
      types: ['supertag:added', 'supertag:removed'],
    })

    const node = await createNode({ content: 'Tagged Item' })
    await addRelation('has_supertag', node.id, 'supertag:item')

    // Verify event was emitted
    const added = supertagEvents.find((e) => e.type === 'supertag:added')
    expect(added).toBeDefined()
    expect(added!.nodeId).toBe(String(node.id))

    // Verify the node is now queryable by supertag
    const items = await getNodesBySupertag('supertag:item')
    const found = items.find((n) => String(n.id) === String(node.id))
    expect(found).toBeDefined()

    unsub()
  })

  it('should emit supertag:removed then verify node disappears from getNodesBySupertag', async () => {
    const node = await createNode({
      content: 'Removable Tag Item',
      supertag: 'supertag:item',
    })

    // Verify node is in the supertag query
    let items = await getNodesBySupertag('supertag:item')
    expect(items.some((n) => String(n.id) === String(node.id))).toBe(true)

    const removeEvents: Array<MutationEvent> = []
    const unsub = eventBus.subscribe((e) => removeEvents.push(e), {
      types: ['supertag:removed'],
    })

    await removeRelation('has_supertag', node.id, 'supertag:item')

    // Verify event
    expect(removeEvents).toHaveLength(1)
    expect(removeEvents[0]!.nodeId).toBe(String(node.id))

    // Verify the node is no longer in the supertag query
    items = await getNodesBySupertag('supertag:item')
    expect(items.some((n) => String(n.id) === String(node.id))).toBe(false)

    unsub()
  })

  it('should handle switching supertags: remove old, add new', async () => {
    const node = await createNode({
      content: 'Switching Supertag',
      supertag: 'supertag:item',
    })

    const supertagEvents: Array<MutationEvent> = []
    const unsub = eventBus.subscribe((e) => supertagEvents.push(e), {
      types: ['supertag:added', 'supertag:removed'],
    })

    // Remove item supertag, add tag supertag
    await removeRelation('has_supertag', node.id, 'supertag:item')
    await addRelation('has_supertag', node.id, 'supertag:tag')

    expect(supertagEvents).toHaveLength(2)
    expect(supertagEvents[0]!.type).toBe('supertag:removed')
    expect(supertagEvents[1]!.type).toBe('supertag:added')

    // Verify: no longer an item, now a tag
    const items = await getNodesBySupertag('supertag:item')
    expect(items.some((n) => String(n.id) === String(node.id))).toBe(false)

    const tags = await getNodesBySupertag('supertag:tag')
    expect(tags.some((n) => String(n.id) === String(node.id))).toBe(true)

    unsub()
  })
})

// ============================================================================
// Integration: Complex Graph + Event Bus Workflow
// ============================================================================

describe('Complex Graph + Event Bus Workflow', () => {
  it('should handle hierarchical node creation with events', async () => {
    const allEvents: Array<MutationEvent> = []
    const unsub = eventBus.subscribe((e) => allEvents.push(e))

    // Create a project hierarchy
    const project = await createNode({
      content: 'Project Alpha',
      system_id: 'item:project-alpha',
      supertag: 'supertag:item',
    })
    const phase = await createNode({
      content: 'Phase 1',
      system_id: 'item:phase-1',
    })
    const task = await createNode({
      content: 'Task 1.1',
      system_id: 'item:task-1-1',
    })

    // Build hierarchy
    await addRelation('part_of', phase.id, project.id)
    await addRelation('part_of', task.id, phase.id)

    // Verify events were emitted for all creates
    const createEvents = allEvents.filter((e) => e.type === 'node:created')
    expect(createEvents.length).toBeGreaterThanOrEqual(3)

    // Verify the hierarchy works
    const components = await componentsRec(project.id)
    const contents = components.map((n) => n.content).sort()
    expect(contents).toContain('Phase 1')
    expect(contents).toContain('Task 1.1')

    unsub()
  })

  it('should emit node:deleted when purging a node with relations', async () => {
    const parent = await createNode({ content: 'Parent' })
    const child = await createNode({ content: 'Child' })
    await addRelation('part_of', child.id, parent.id)
    await addRelation('has_supertag', parent.id, 'supertag:item')

    events = [] // Clear earlier events

    await purgeNode(parent.id)

    const deleteEvents = events.filter((e) => e.type === 'node:deleted')
    expect(deleteEvents).toHaveLength(1)
    expect(deleteEvents[0]!.nodeId).toBe(String(parent.id))

    // Parent should be completely gone
    const found = await getNode(parent.id)
    expect(found).toBeNull()
  })

  it('should handle concurrent creates and updates with ordered events', async () => {
    const node1 = await createNode({ content: 'Node 1', props: { v: 1 } })
    const node2 = await createNode({ content: 'Node 2', props: { v: 1 } })

    events = []

    // Update both nodes
    await updateNode(node1.id, { props: { v: 2 } })
    await updateNode(node2.id, { props: { v: 2 } })

    const updateEvents = events.filter((e) => e.type === 'node:updated')
    expect(updateEvents).toHaveLength(2)

    // Each event should reference the correct node
    const node1Update = updateEvents.find((e) => e.nodeId === String(node1.id))
    const node2Update = updateEvents.find((e) => e.nodeId === String(node2.id))
    expect(node1Update).toBeDefined()
    expect(node2Update).toBeDefined()
  })

  it('should handle search results and event bus together', async () => {
    // Create searchable nodes
    await createNode({ content: 'Alpha Release Notes' })
    await createNode({ content: 'Beta Release Notes' })
    await createNode({ content: 'Unrelated Document' })

    // Search should find the right nodes
    const results = await searchNodes('release')
    expect(results.length).toBe(2)
    const contents = results.map((n) => n.content).sort()
    expect(contents).toEqual(['Alpha Release Notes', 'Beta Release Notes'])

    // Events should have been emitted for all 3 creates
    const createEvents = events.filter((e) => e.type === 'node:created')
    expect(createEvents.length).toBeGreaterThanOrEqual(3)
  })
})

// ============================================================================
// Integration: graph.server.ts Type Converters
// ============================================================================

// The type converters (graphNodeToItem, serializeGraphNode, itemToGraphProps)
// are not exported from graph.server.ts — they are internal to the module.
// However, we can test the round-trip via the graph service: create a node
// with the same props structure that graph.server.ts uses, then verify
// the data can be read back correctly.

describe('Type Converter Round-Trip via Graph Service', () => {
  it('should round-trip item data through graph node props', async () => {
    // Simulate what createItemInGraphServerFn does
    const itemProps = {
      item_id: 'test-item-001',
      description: 'A test item for integration',
      type: 'tool',
      types: ['tool', 'typescript'],
      path: '/usr/local/bin/test',
      homepage: 'https://example.com',
      category: 'development',
      version: '1.0.0',
      author: 'Test Author',
      checkCommand: 'test --version',
      platform: ['linux', 'macos'],
      startCommand: 'npm start',
      buildCommand: 'npm run build',
    }

    const node = await createNode({
      content: 'Test Tool',
      system_id: 'item:test-item-001',
      props: itemProps,
      supertag: 'supertag:item',
    })

    // Read it back
    const retrieved = await getNodeBySystemId('item:test-item-001')
    expect(retrieved).toBeDefined()
    expect(retrieved!.content).toBe('Test Tool')
    expect(retrieved!.system_id).toBe('item:test-item-001')

    // Verify props survived the round-trip
    const props = retrieved!.props as Record<string, unknown>
    expect(props.item_id).toBe('test-item-001')
    expect(props.description).toBe('A test item for integration')
    expect(props.type).toBe('tool')
    expect(props.types).toEqual(['tool', 'typescript'])
    expect(props.path).toBe('/usr/local/bin/test')
    expect(props.homepage).toBe('https://example.com')
    expect(props.category).toBe('development')
    expect(props.version).toBe('1.0.0')
    expect(props.author).toBe('Test Author')
    expect(props.checkCommand).toBe('test --version')
    expect(props.platform).toEqual(['linux', 'macos'])
    expect(props.startCommand).toBe('npm start')
    expect(props.buildCommand).toBe('npm run build')
  })

  it('should round-trip tag data through graph node props', async () => {
    // Simulate what createTagInGraphServerFn does
    const node = await createNode({
      content: 'Development',
      system_id: 'tag:development',
      props: {
        color: '#ff5733',
        icon: 'code',
        parent_id: null,
        order: 0,
        legacy_id: 42,
      },
      supertag: 'supertag:tag',
    })

    const retrieved = await getNodeBySystemId('tag:development')
    expect(retrieved).toBeDefined()
    expect(retrieved!.content).toBe('Development')

    const props = retrieved!.props as Record<string, unknown>
    expect(props.color).toBe('#ff5733')
    expect(props.icon).toBe('code')
    expect(props.legacy_id).toBe(42)
    expect(props.order).toBe(0)
  })

  it('should preserve complex nested props through round-trip', async () => {
    const complexProps = {
      installConfig: {
        method: 'npm',
        args: ['install', '-g', 'test-tool'],
      },
      commands: [
        { name: 'run', command: 'test-tool run', description: 'Run the tool' },
        {
          name: 'check',
          command: 'test-tool check',
          description: 'Check status',
        },
      ],
      docs: {
        readme: 'https://example.com/readme',
        api: 'https://example.com/api',
      },
      dependencies: ['node', 'npm'],
    }

    const node = await createNode({
      content: 'Complex Item',
      system_id: 'item:complex',
      props: complexProps,
    })

    const retrieved = await getNodeBySystemId('item:complex')
    expect(retrieved).toBeDefined()

    const props = retrieved!.props as Record<string, unknown>
    expect(props.installConfig).toEqual({
      method: 'npm',
      args: ['install', '-g', 'test-tool'],
    })
    expect(props.commands).toEqual([
      { name: 'run', command: 'test-tool run', description: 'Run the tool' },
      {
        name: 'check',
        command: 'test-tool check',
        description: 'Check status',
      },
    ])
    expect(props.docs).toEqual({
      readme: 'https://example.com/readme',
      api: 'https://example.com/api',
    })
    expect(props.dependencies).toEqual(['node', 'npm'])
  })

  it('should handle multi-type items through props', async () => {
    // Simulate creating a multi-type item (tool + typescript + remote-repo)
    const multiTypeProps = {
      item_id: 'multi-type-item',
      types: ['tool', 'typescript', 'remote-repo'],
      type: 'tool', // Deprecated, first type
      // Tool-specific
      checkCommand: 'which myapp',
      platform: ['linux'],
      // TypeScript-specific
      startCommand: 'ts-node src/index.ts',
      buildCommand: 'tsc',
      // Remote-repo-specific
      clonePath: '/opt/repos/myapp',
      branch: 'main',
    }

    const node = await createNode({
      content: 'Multi-Type App',
      system_id: 'item:multi-type',
      props: multiTypeProps,
      supertag: 'supertag:item',
    })

    const retrieved = await getNodeBySystemId('item:multi-type')
    expect(retrieved).toBeDefined()

    const props = retrieved!.props as Record<string, unknown>
    expect(props.types).toEqual(['tool', 'typescript', 'remote-repo'])
    // Tool fields
    expect(props.checkCommand).toBe('which myapp')
    expect(props.platform).toEqual(['linux'])
    // TypeScript fields
    expect(props.startCommand).toBe('ts-node src/index.ts')
    expect(props.buildCommand).toBe('tsc')
    // Remote-repo fields
    expect(props.clonePath).toBe('/opt/repos/myapp')
    expect(props.branch).toBe('main')
  })

  it('should serialize RecordId to string when converting to transportable format', async () => {
    const node = await createNode({
      content: 'Serializable Node',
      system_id: 'item:serializable',
    })

    // The node.id is a RecordId object; verify String() conversion works
    const idString = String(node.id)
    expect(typeof idString).toBe('string')
    expect(idString).toContain('node:')

    // Verify timestamps are Date objects (serializeGraphNode converts them to ISO strings)
    expect(node.created_at).toBeDefined()
    expect(node.updated_at).toBeDefined()
  })

  it('should preserve item updates via props round-trip', async () => {
    // Create initial item
    const node = await createNode({
      content: 'Initial Name',
      system_id: 'item:updatable',
      props: {
        item_id: 'updatable',
        description: 'Initial description',
        category: 'uncategorized',
        type: 'html',
      },
      supertag: 'supertag:item',
    })

    // Simulate what updateItemInGraphServerFn does: merge old props with new
    const oldProps = node.props || {}
    const newUpdates = {
      item_id: 'updatable',
      description: 'Updated description',
      category: 'development',
    }
    const mergedProps = { ...oldProps, ...newUpdates }

    await updateNode(node.id, {
      content: 'Updated Name',
      props: mergedProps,
    })

    const updated = await getNodeBySystemId('item:updatable')
    expect(updated).toBeDefined()
    expect(updated!.content).toBe('Updated Name')

    const props = updated!.props as Record<string, unknown>
    expect(props.description).toBe('Updated description')
    expect(props.category).toBe('development')
    expect(props.type).toBe('html') // Original type preserved
    expect(props.item_id).toBe('updatable')
  })
})

// ============================================================================
// Integration: Tagged Relations → Event Pipeline
// ============================================================================

describe('Tagged Relations → Event Pipeline', () => {
  it('should create item with tags and verify full event trail', async () => {
    // Create tag nodes first
    const tagA = await createNode({
      content: 'TypeScript',
      system_id: 'tag:typescript',
      supertag: 'supertag:tag',
    })
    const tagB = await createNode({
      content: 'React',
      system_id: 'tag:react',
      supertag: 'supertag:tag',
    })

    events = [] // Clear tag creation events

    // Create an item and tag it
    const item = await createNode({
      content: 'My App',
      system_id: 'item:my-app',
      supertag: 'supertag:item',
    })
    await addRelation('tagged_with', item.id, tagA.id)
    await addRelation('tagged_with', item.id, tagB.id)

    // Verify node:created event
    const created = events.find(
      (e) => e.type === 'node:created' && e.nodeId === String(item.id),
    )
    expect(created).toBeDefined()

    // Verify supertag:added event for has_supertag
    const stAdded = events.find(
      (e) => e.type === 'supertag:added' && e.nodeId === String(item.id),
    )
    expect(stAdded).toBeDefined()

    // tagged_with should NOT emit supertag events
    const supertagEvents = events.filter(
      (e) =>
        (e.type === 'supertag:added' || e.type === 'supertag:removed') &&
        e.nodeId === String(item.id),
    )
    // Only 1 from has_supertag, not 2 more from tagged_with
    expect(supertagEvents).toHaveLength(1)

    // Verify tag relations are queryable
    const outgoing = await getOutgoingRelations(item.id, 'tagged_with')
    expect(outgoing.length).toBe(2)
    const tagNames = outgoing.map((n) => n.content).sort()
    expect(tagNames).toEqual(['React', 'TypeScript'])
  })

  it('should support removing tags and verify events', async () => {
    const tag = await createNode({
      content: 'Deprecated Tag',
      system_id: 'tag:deprecated',
      supertag: 'supertag:tag',
    })
    const item = await createNode({
      content: 'Tagged Item',
      supertag: 'supertag:item',
    })
    await addRelation('tagged_with', item.id, tag.id)

    events = []

    await removeRelation('tagged_with', item.id, tag.id)

    // tagged_with removal should NOT emit supertag:removed
    const supertagRemoved = events.filter((e) => e.type === 'supertag:removed')
    expect(supertagRemoved).toHaveLength(0)

    // Verify relation is gone
    const outgoing = await getOutgoingRelations(item.id, 'tagged_with')
    expect(outgoing).toEqual([])
  })
})

// ============================================================================
// Integration: Dependency Chains → Events
// ============================================================================

describe('Dependency Chains → Events', () => {
  it('should build a dependency chain and verify all creation events', async () => {
    const eventsBeforeChain = events.length

    // Build: Deploy → Test → Build → Design
    const design = await createNode({ content: 'Design' })
    const build = await createNode({ content: 'Build' })
    const test = await createNode({ content: 'Test' })
    const deploy = await createNode({ content: 'Deploy' })

    await addRelation('dependency_of', deploy.id, test.id)
    await addRelation('dependency_of', test.id, build.id)
    await addRelation('dependency_of', build.id, design.id)

    // 4 nodes created = at least 4 node:created events
    const newCreateEvents = events
      .slice(eventsBeforeChain)
      .filter((e) => e.type === 'node:created')
    expect(newCreateEvents.length).toBeGreaterThanOrEqual(4)

    // Verify each node got its creation event
    const createdNodeIds = newCreateEvents.map((e) => e.nodeId)
    expect(createdNodeIds).toContain(String(design.id))
    expect(createdNodeIds).toContain(String(build.id))
    expect(createdNodeIds).toContain(String(test.id))
    expect(createdNodeIds).toContain(String(deploy.id))
  })
})

// ============================================================================
// Integration: Event Timestamps
// ============================================================================

describe('Event Timestamp Integrity', () => {
  it('should have monotonically non-decreasing timestamps across lifecycle', async () => {
    const node = await createNode({ content: 'Timestamp Test' })
    await new Promise((r) => setTimeout(r, 5))
    await updateNode(node.id, { content: 'Changed' })
    await new Promise((r) => setTimeout(r, 5))
    await deleteNode(node.id)

    const nodeEvents = events.filter((e) => e.nodeId === String(node.id))
    for (let i = 1; i < nodeEvents.length; i++) {
      expect(nodeEvents[i]!.timestamp.getTime()).toBeGreaterThanOrEqual(
        nodeEvents[i - 1]!.timestamp.getTime(),
      )
    }
  })

  it('should have all timestamps as Date instances', async () => {
    await createNode({ content: 'Date Check' })

    for (const event of events) {
      expect(event.timestamp).toBeInstanceOf(Date)
      expect(event.timestamp.getTime()).toBeGreaterThan(0)
    }
  })
})
