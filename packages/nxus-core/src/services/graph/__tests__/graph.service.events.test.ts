/**
 * graph.service.events.test.ts - Tests for event bus integration with SurrealDB mutations
 *
 * Verifies that all graph service mutation operations emit the correct
 * events through the reactive event bus:
 * - createNode → node:created
 * - updateNode → node:updated (with before/after values)
 * - deleteNode → node:deleted
 * - purgeNode → node:deleted
 * - addRelation('has_supertag', ...) → supertag:added
 * - removeRelation('has_supertag', ...) → supertag:removed
 */

import type { Surreal } from 'surrealdb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  setupTestGraphDatabase,
  teardownTestGraphDatabase,
} from '@nxus/db/test-utils'
import { eventBus } from '@nxus/db/server'
import type { MutationEvent } from '@nxus/db/server'
import {
  createNode,
  updateNode,
  deleteNode,
  purgeNode,
  addRelation,
  removeRelation,
} from '../graph.service.js'

let db: Surreal
let events: MutationEvent[]
let unsubscribe: () => void

beforeEach(async () => {
  db = await setupTestGraphDatabase()
  events = []
  // Subscribe to all events
  unsubscribe = eventBus.subscribe((event) => {
    events.push(event)
  })
})

afterEach(async () => {
  unsubscribe()
  eventBus.clear()
  await teardownTestGraphDatabase(db)
})

// =============================================================================
// createNode Events
// =============================================================================

describe('createNode events', () => {
  it('should emit node:created event', async () => {
    const node = await createNode({ content: 'Event Test' })

    const created = events.find((e) => e.type === 'node:created')
    expect(created).toBeDefined()
    expect(created!.nodeId).toBe(String(node.id))
    expect(created!.timestamp).toBeInstanceOf(Date)
  })

  it('should include content and system_id in afterValue', async () => {
    const node = await createNode({
      content: 'My Node',
      system_id: 'item:test-event',
    })

    const created = events.find((e) => e.type === 'node:created')
    expect(created).toBeDefined()
    expect(created!.afterValue).toEqual(
      expect.objectContaining({
        content: 'My Node',
        system_id: 'item:test-event',
      }),
    )
  })

  it('should emit node:created and supertag:added when supertag provided', async () => {
    const node = await createNode({
      content: 'Tagged Node',
      supertag: 'supertag:item',
    })

    const createdEvents = events.filter((e) => e.type === 'node:created')
    const supertagEvents = events.filter((e) => e.type === 'supertag:added')

    expect(createdEvents).toHaveLength(1)
    expect(supertagEvents).toHaveLength(1)

    expect(createdEvents[0]!.nodeId).toBe(String(node.id))
    expect(supertagEvents[0]!.nodeId).toBe(String(node.id))
    expect(supertagEvents[0]!.supertagId).toContain('supertag')
  })

  it('should emit node:created even with empty content', async () => {
    await createNode({})

    const created = events.find((e) => e.type === 'node:created')
    expect(created).toBeDefined()
  })
})

// =============================================================================
// updateNode Events
// =============================================================================

describe('updateNode events', () => {
  it('should emit node:updated event on content change', async () => {
    const node = await createNode({ content: 'Before' })
    events = [] // Clear creation events

    await updateNode(node.id, { content: 'After' })

    const updated = events.find((e) => e.type === 'node:updated')
    expect(updated).toBeDefined()
    expect(updated!.nodeId).toBe(String(node.id))
    expect(updated!.timestamp).toBeInstanceOf(Date)
  })

  it('should include before and after values', async () => {
    const node = await createNode({ content: 'Original', props: { a: 1 } })
    events = []

    await updateNode(node.id, { content: 'Updated', props: { a: 2 } })

    const updated = events.find((e) => e.type === 'node:updated')
    expect(updated).toBeDefined()

    // beforeValue should contain original content and props
    const before = updated!.beforeValue as Record<string, unknown>
    expect(before.content).toBe('Original')
    expect(before.props).toEqual({ a: 1 })

    // afterValue should contain updated content and props
    const after = updated!.afterValue as Record<string, unknown>
    expect(after.content).toBe('Updated')
    expect(after.props).toEqual({ a: 2 })
  })

  it('should emit node:updated on props-only change', async () => {
    const node = await createNode({ content: 'Static', props: { x: 1 } })
    events = []

    await updateNode(node.id, { props: { x: 2, y: 3 } })

    const updated = events.find((e) => e.type === 'node:updated')
    expect(updated).toBeDefined()

    const after = updated!.afterValue as Record<string, unknown>
    expect(after.props).toEqual({ x: 2, y: 3 })
  })
})

// =============================================================================
// deleteNode Events
// =============================================================================

describe('deleteNode events', () => {
  it('should emit node:deleted event on soft delete', async () => {
    const node = await createNode({ content: 'To Delete' })
    events = []

    await deleteNode(node.id)

    const deleted = events.find((e) => e.type === 'node:deleted')
    expect(deleted).toBeDefined()
    expect(deleted!.nodeId).toBe(String(node.id))
    expect(deleted!.timestamp).toBeInstanceOf(Date)
  })
})

// =============================================================================
// purgeNode Events
// =============================================================================

describe('purgeNode events', () => {
  it('should emit node:deleted event on hard delete', async () => {
    const node = await createNode({ content: 'To Purge' })
    events = []

    await purgeNode(node.id)

    const deleted = events.find((e) => e.type === 'node:deleted')
    expect(deleted).toBeDefined()
    expect(deleted!.nodeId).toBe(String(node.id))
    expect(deleted!.timestamp).toBeInstanceOf(Date)
  })

  it('should emit node:deleted even when node has relations', async () => {
    const parent = await createNode({ content: 'Parent' })
    const child = await createNode({ content: 'Child' })
    await addRelation('part_of', child.id, parent.id)
    events = []

    await purgeNode(parent.id)

    const deleted = events.find((e) => e.type === 'node:deleted')
    expect(deleted).toBeDefined()
    expect(deleted!.nodeId).toBe(String(parent.id))
  })
})

// =============================================================================
// Supertag Events (addRelation / removeRelation)
// =============================================================================

describe('supertag events', () => {
  it('should emit supertag:added on addRelation with has_supertag', async () => {
    const node = await createNode({ content: 'Node' })
    events = []

    await addRelation('has_supertag', node.id, 'supertag:tag')

    const added = events.find((e) => e.type === 'supertag:added')
    expect(added).toBeDefined()
    expect(added!.nodeId).toBe(String(node.id))
    expect(added!.supertagId).toContain('supertag')
  })

  it('should emit supertag:removed on removeRelation with has_supertag', async () => {
    const node = await createNode({ content: 'Node' })
    await addRelation('has_supertag', node.id, 'supertag:tag')
    events = []

    await removeRelation('has_supertag', node.id, 'supertag:tag')

    const removed = events.find((e) => e.type === 'supertag:removed')
    expect(removed).toBeDefined()
    expect(removed!.nodeId).toBe(String(node.id))
    expect(removed!.supertagId).toContain('supertag')
  })

  it('should NOT emit supertag events for non-supertag relations', async () => {
    const nodeA = await createNode({ content: 'A' })
    const nodeB = await createNode({ content: 'B' })
    events = []

    await addRelation('part_of', nodeA.id, nodeB.id)
    await addRelation('references', nodeA.id, nodeB.id)
    await addRelation('dependency_of', nodeA.id, nodeB.id)

    const supertagEvents = events.filter(
      (e) => e.type === 'supertag:added' || e.type === 'supertag:removed',
    )
    expect(supertagEvents).toHaveLength(0)
  })

  it('should NOT emit supertag events when removing non-supertag relations', async () => {
    const nodeA = await createNode({ content: 'A' })
    const nodeB = await createNode({ content: 'B' })
    await addRelation('part_of', nodeA.id, nodeB.id)
    events = []

    await removeRelation('part_of', nodeA.id, nodeB.id)

    const supertagEvents = events.filter(
      (e) => e.type === 'supertag:added' || e.type === 'supertag:removed',
    )
    expect(supertagEvents).toHaveLength(0)
  })
})

// =============================================================================
// Event ordering and completeness
// =============================================================================

describe('event ordering and completeness', () => {
  it('should emit events in correct order for create-with-supertag', async () => {
    const node = await createNode({
      content: 'Ordered',
      supertag: 'supertag:item',
    })

    const types = events.map((e) => e.type)
    const createdIdx = types.indexOf('node:created')
    const supertagIdx = types.indexOf('supertag:added')

    expect(createdIdx).toBeGreaterThanOrEqual(0)
    expect(supertagIdx).toBeGreaterThanOrEqual(0)
    // node:created should come before supertag:added
    expect(createdIdx).toBeLessThan(supertagIdx)
  })

  it('should emit events for a full CRUD lifecycle', async () => {
    // Create
    const node = await createNode({ content: 'Lifecycle' })
    expect(events.some((e) => e.type === 'node:created')).toBe(true)

    // Update
    await updateNode(node.id, { content: 'Updated' })
    expect(events.some((e) => e.type === 'node:updated')).toBe(true)

    // Delete (soft)
    await deleteNode(node.id)
    expect(events.some((e) => e.type === 'node:deleted')).toBe(true)

    // Verify all events are for the same node
    const nodeEvents = events.filter((e) => e.nodeId === String(node.id))
    const nodeEventTypes = nodeEvents.map((e) => e.type)
    expect(nodeEventTypes).toContain('node:created')
    expect(nodeEventTypes).toContain('node:updated')
    expect(nodeEventTypes).toContain('node:deleted')
  })

  it('should emit all events with valid timestamps', async () => {
    const node = await createNode({ content: 'Timestamps' })
    await updateNode(node.id, { content: 'Changed' })
    await deleteNode(node.id)

    for (const event of events) {
      expect(event.timestamp).toBeInstanceOf(Date)
      expect(event.timestamp.getTime()).toBeGreaterThan(0)
    }
  })
})
