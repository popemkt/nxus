/**
 * query-subscription.test.ts - Unit tests for the QuerySubscriptionService
 *
 * Tests the reactive query subscription system including:
 * - Initial result delivery
 * - Node added to query results (matching filter)
 * - Node removed from results (no longer matches)
 * - Node changed (still matches but properties changed)
 * - Multiple subscriptions to same query
 * - Unsubscribe stops receiving events
 * - Various filter types (supertag, property, logical AND/OR)
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../schemas/item-schema.js'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '../../schemas/node-schema.js'
import {
  addNodeSupertag,
  clearSystemNodeCache,
  createNode,
  deleteNode,
  removeNodeSupertag,
  setProperty,
  updateNodeContent,
} from '../../services/node.service.js'
import type { QueryDefinition } from '../../types/query.js'
import { createEventBus, eventBus } from '../event-bus.js'
import {
  createQuerySubscriptionService,
  type QueryResultChangeCallback,
  type QuerySubscriptionService,
} from '../query-subscription.service.js'
import type { QueryResultChangeEvent } from '../types.js'

// ============================================================================
// Test Setup
// ============================================================================

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let service: QuerySubscriptionService

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
    { id: 'field-status', systemId: 'field:status', content: 'Status' },
    { id: 'field-priority', systemId: 'field:priority', content: 'Priority' },
    { id: 'field-category', systemId: 'field:category', content: 'Category' },
    { id: 'field-assignee', systemId: 'field:assignee', content: 'Assignee' },
    { id: 'field-count', systemId: 'field:count', content: 'Count' },
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
    { id: 'supertag-task', systemId: 'supertag:task', content: '#Task' },
    { id: 'supertag-project', systemId: 'supertag:project', content: '#Project' },
  ]

  for (const st of systemSupertags) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${st.id}', '${st.content}', '${st.content.toLowerCase()}', '${st.systemId}', ${now}, ${now})
    `)
  }

  // Make #Task extend #Item (for inheritance testing)
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('supertag-task', 'field-extends', '"supertag-item"', 0, ${now}, ${now})
  `)
}

// ============================================================================
// Test Suite
// ============================================================================

describe('QuerySubscriptionService', () => {
  beforeEach(() => {
    setupTestDatabase()
    clearSystemNodeCache()
    seedSystemNodes()

    // Clear the global event bus and create service that uses it
    // node.service.ts emits to the global eventBus, so our service must listen to it
    eventBus.clear()
    service = createQuerySubscriptionService(eventBus)
  })

  afterEach(() => {
    service.clear()
    eventBus.clear()
    sqlite.close()
  })

  // ==========================================================================
  // subscribe() - Initial Results
  // ==========================================================================

  describe('subscribe() - initial results', () => {
    it('should return subscription handle with id', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const handle = service.subscribe(db, query, vi.fn())

      expect(handle.id).toBeDefined()
      expect(handle.id).toMatch(/^qsub_/)
      expect(typeof handle.unsubscribe).toBe('function')
      expect(typeof handle.getLastResults).toBe('function')
    })

    it('should evaluate query and provide initial results via getLastResults()', () => {
      // Create some tasks
      const task1 = createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      const task2 = createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      createNode(db, { content: 'Project 1', supertagId: 'supertag:project' })

      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      const results = handle.getLastResults()
      expect(results.length).toBe(2)
      expect(results.map((n) => n.id)).toContain(task1)
      expect(results.map((n) => n.id)).toContain(task2)

      // Callback should NOT be called for initial results (only changes)
      expect(callback).not.toHaveBeenCalled()
    })

    it('should handle empty initial results', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      const results = handle.getLastResults()
      expect(results.length).toBe(0)
      expect(callback).not.toHaveBeenCalled()
    })

    it('should increment subscription count', () => {
      expect(service.subscriptionCount()).toBe(0)

      const query: QueryDefinition = { filters: [] }
      service.subscribe(db, query, vi.fn())
      expect(service.subscriptionCount()).toBe(1)

      service.subscribe(db, query, vi.fn())
      expect(service.subscriptionCount()).toBe(2)
    })

    it('should track active subscriptions', () => {
      const query1: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }
      const query2: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:project' }],
      }

      service.subscribe(db, query1, vi.fn())
      service.subscribe(db, query2, vi.fn())

      const active = service.getActiveSubscriptions()
      expect(active.length).toBe(2)
      expect(active[0].queryDefinition).toEqual(query1)
      expect(active[1].queryDefinition).toEqual(query2)
    })
  })

  // ==========================================================================
  // Node Added to Results
  // ==========================================================================

  describe('detect node added to query results', () => {
    it('should detect when node created matches filter', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      // Create a new task - should trigger callback
      const newTaskId = createNode(db, { content: 'New Task', supertagId: 'supertag:task' })

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.added.length).toBe(1)
      expect(event.added[0].id).toBe(newTaskId)
      expect(event.removed.length).toBe(0)
      expect(event.changed.length).toBe(0)
    })

    it('should detect when supertag added makes node match filter', () => {
      // Create a plain node first (no supertag)
      const nodeId = createNode(db, { content: 'Plain Node' })

      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      // Initial results should be empty
      expect(callback).not.toHaveBeenCalled()

      // Add the task supertag - should now match
      addNodeSupertag(db, nodeId, 'supertag:task')

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.added.length).toBe(1)
      expect(event.added[0].id).toBe(nodeId)
      expect(event.removed.length).toBe(0)
    })

    it('should detect when property change makes node match filter', () => {
      // Create task with status 'pending'
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'pending')

      // Query for tasks with status 'done'
      const query: QueryDefinition = {
        filters: [
          { type: 'supertag', supertagId: 'supertag:task' },
          { type: 'property', fieldId: 'field:status', op: 'eq', value: 'done' },
        ],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      // Initial results should be empty (status is 'pending')
      expect(callback).not.toHaveBeenCalled()

      // Change status to 'done' - should now match
      setProperty(db, taskId, 'field:status', 'done')

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.added.length).toBe(1)
      expect(event.added[0].id).toBe(taskId)
    })

    it('should not trigger for nodes not matching filter', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      // Create a project (not a task)
      createNode(db, { content: 'Project', supertagId: 'supertag:project' })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Node Removed from Results
  // ==========================================================================

  describe('detect node removed from query results', () => {
    it('should detect when node deleted', () => {
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      // Verify initial state
      expect(handle.getLastResults().length).toBe(1)

      // Delete the task
      deleteNode(db, taskId)

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.removed.length).toBe(1)
      expect(event.removed[0].id).toBe(taskId)
      expect(event.added.length).toBe(0)
    })

    it('should detect when supertag removed makes node not match filter', () => {
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      // Remove the supertag - should no longer match
      removeNodeSupertag(db, taskId, 'supertag:task')

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.removed.length).toBe(1)
      expect(event.removed[0].id).toBe(taskId)
      expect(event.added.length).toBe(0)
    })

    it('should detect when property change makes node not match filter', () => {
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'done')

      // Query for done tasks
      const query: QueryDefinition = {
        filters: [
          { type: 'supertag', supertagId: 'supertag:task' },
          { type: 'property', fieldId: 'field:status', op: 'eq', value: 'done' },
        ],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      // Verify initial state
      expect(handle.getLastResults().length).toBe(1)

      // Change status to 'pending' - should no longer match
      setProperty(db, taskId, 'field:status', 'pending')

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.removed.length).toBe(1)
      expect(event.removed[0].id).toBe(taskId)
    })
  })

  // ==========================================================================
  // Node Changed (still matches but properties differ)
  // ==========================================================================

  describe('detect node changed (still matches but different)', () => {
    it('should detect when matching node content changes', () => {
      const taskId = createNode(db, { content: 'Original content', supertagId: 'supertag:task' })

      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      // Update content - node still matches but changed
      updateNodeContent(db, taskId, 'Updated content')

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.changed.length).toBe(1)
      expect(event.changed[0].id).toBe(taskId)
      expect(event.changed[0].content).toBe('Updated content')
      expect(event.added.length).toBe(0)
      expect(event.removed.length).toBe(0)
    })

    it('should detect when matching node property changes (not in filter)', () => {
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:priority', 'low')

      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      // Change priority (not in filter) - node still matches but changed
      setProperty(db, taskId, 'field:priority', 'high')

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.changed.length).toBe(1)
      expect(event.changed[0].id).toBe(taskId)
    })

    it('should detect when supertag added to already-matching node', () => {
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      // Add another supertag - node still matches task but changed
      addNodeSupertag(db, taskId, 'supertag:project')

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.changed.length).toBe(1)
      expect(event.changed[0].id).toBe(taskId)
    })
  })

  // ==========================================================================
  // Multiple Subscriptions
  // ==========================================================================

  describe('multiple subscriptions', () => {
    it('should deliver same events to multiple subscriptions of same query', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback1 = vi.fn()
      const callback2 = vi.fn()
      service.subscribe(db, query, callback1)
      service.subscribe(db, query, callback2)

      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      expect(callback1).toHaveBeenCalledTimes(1)
      expect(callback2).toHaveBeenCalledTimes(1)

      // Both should receive the same event
      const event1 = callback1.mock.calls[0][0] as QueryResultChangeEvent
      const event2 = callback2.mock.calls[0][0] as QueryResultChangeEvent
      expect(event1.added[0].id).toBe(taskId)
      expect(event2.added[0].id).toBe(taskId)
    })

    it('should handle different queries independently', () => {
      const taskQuery: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }
      const projectQuery: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:project' }],
      }

      const taskCallback = vi.fn()
      const projectCallback = vi.fn()
      service.subscribe(db, taskQuery, taskCallback)
      service.subscribe(db, projectQuery, projectCallback)

      // Create a task
      createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      expect(taskCallback).toHaveBeenCalledTimes(1)
      expect(projectCallback).not.toHaveBeenCalled()

      // Create a project
      createNode(db, { content: 'Project', supertagId: 'supertag:project' })

      expect(taskCallback).toHaveBeenCalledTimes(1) // Still 1
      expect(projectCallback).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // Unsubscribe
  // ==========================================================================

  describe('unsubscribe()', () => {
    it('should stop receiving events after unsubscribe via handle', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      // First mutation - should receive
      createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      expect(callback).toHaveBeenCalledTimes(1)

      // Unsubscribe
      handle.unsubscribe()

      // Second mutation - should NOT receive
      createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      expect(callback).toHaveBeenCalledTimes(1) // Still 1
    })

    it('should stop receiving events after unsubscribe via service', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      // First mutation - should receive
      createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      expect(callback).toHaveBeenCalledTimes(1)

      // Unsubscribe via service
      service.unsubscribe(handle.id)

      // Second mutation - should NOT receive
      createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      expect(callback).toHaveBeenCalledTimes(1) // Still 1
    })

    it('should decrement subscription count after unsubscribe', () => {
      const query: QueryDefinition = { filters: [] }

      const handle1 = service.subscribe(db, query, vi.fn())
      const handle2 = service.subscribe(db, query, vi.fn())
      expect(service.subscriptionCount()).toBe(2)

      handle1.unsubscribe()
      expect(service.subscriptionCount()).toBe(1)

      handle2.unsubscribe()
      expect(service.subscriptionCount()).toBe(0)
    })

    it('should return empty array from getLastResults after unsubscribe', () => {
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const handle = service.subscribe(db, query, vi.fn())
      expect(handle.getLastResults().length).toBe(1)

      handle.unsubscribe()
      expect(handle.getLastResults()).toEqual([])
    })
  })

  // ==========================================================================
  // Rapid Mutations (Phase 1 - no batching)
  // ==========================================================================

  describe('rapid mutations (no batching in Phase 1)', () => {
    it('should trigger multiple callbacks for rapid mutations', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      // Rapid mutations
      createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      createNode(db, { content: 'Task 3', supertagId: 'supertag:task' })

      // In Phase 1, each mutation triggers a separate callback
      expect(callback).toHaveBeenCalledTimes(3)
    })

    it('should provide accurate results for each rapid mutation', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      const id1 = createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      const id2 = createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      const id3 = createNode(db, { content: 'Task 3', supertagId: 'supertag:task' })

      expect(callback).toHaveBeenCalledTimes(3)

      // Final state should have all 3 tasks
      const results = handle.getLastResults()
      expect(results.length).toBe(3)
      expect(results.map((n) => n.id)).toContain(id1)
      expect(results.map((n) => n.id)).toContain(id2)
      expect(results.map((n) => n.id)).toContain(id3)
    })
  })

  // ==========================================================================
  // Query with Supertag Filter
  // ==========================================================================

  describe('query with supertag filter', () => {
    it('should work with supertag inheritance', () => {
      // Task extends Item, so querying for Item should include Tasks
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      // Query for Item (parent of Task)
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: true }],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      // Task should be in initial results due to inheritance
      const results = handle.getLastResults()
      expect(results.map((n) => n.id)).toContain(taskId)
    })

    it('should not include inherited supertags when includeInherited=false', () => {
      createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      // Query for Item without inheritance
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: SYSTEM_SUPERTAGS.ITEM, includeInherited: false }],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      // Task should NOT be in results (requires direct Item supertag)
      const results = handle.getLastResults()
      expect(results.length).toBe(0)
    })
  })

  // ==========================================================================
  // Query with Property Filter
  // ==========================================================================

  describe('query with property filter', () => {
    it('should filter by property value with eq operator', () => {
      const task1 = createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      const task2 = createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      setProperty(db, task1, 'field:status', 'done')
      setProperty(db, task2, 'field:status', 'pending')

      const query: QueryDefinition = {
        filters: [
          { type: 'supertag', supertagId: 'supertag:task' },
          { type: 'property', fieldId: 'field:status', op: 'eq', value: 'done' },
        ],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      const results = handle.getLastResults()
      expect(results.length).toBe(1)
      expect(results[0].id).toBe(task1)
    })

    it('should filter by numeric property value', () => {
      const task1 = createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      const task2 = createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      setProperty(db, task1, 'field:count', 10)
      setProperty(db, task2, 'field:count', 5)

      const query: QueryDefinition = {
        filters: [
          { type: 'supertag', supertagId: 'supertag:task' },
          { type: 'property', fieldId: 'field:count', op: 'gt', value: 7 },
        ],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      const results = handle.getLastResults()
      expect(results.length).toBe(1)
      expect(results[0].id).toBe(task1)
    })
  })

  // ==========================================================================
  // Query with Logical AND/OR Filters
  // ==========================================================================

  describe('query with logical AND/OR filters', () => {
    it('should handle AND filter correctly', () => {
      const task1 = createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      const task2 = createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      setProperty(db, task1, 'field:status', 'done')
      setProperty(db, task1, 'field:priority', 'high')
      setProperty(db, task2, 'field:status', 'done')
      setProperty(db, task2, 'field:priority', 'low')

      // Query: done AND high priority
      const query: QueryDefinition = {
        filters: [
          { type: 'supertag', supertagId: 'supertag:task' },
          {
            type: 'and',
            filters: [
              { type: 'property', fieldId: 'field:status', op: 'eq', value: 'done' },
              { type: 'property', fieldId: 'field:priority', op: 'eq', value: 'high' },
            ],
          },
        ],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      const results = handle.getLastResults()
      expect(results.length).toBe(1)
      expect(results[0].id).toBe(task1)
    })

    it('should handle OR filter correctly', () => {
      const task1 = createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      const task2 = createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      const task3 = createNode(db, { content: 'Task 3', supertagId: 'supertag:task' })
      setProperty(db, task1, 'field:status', 'done')
      setProperty(db, task2, 'field:priority', 'high')
      setProperty(db, task3, 'field:status', 'pending')
      setProperty(db, task3, 'field:priority', 'low')

      // Query: done OR high priority
      const query: QueryDefinition = {
        filters: [
          { type: 'supertag', supertagId: 'supertag:task' },
          {
            type: 'or',
            filters: [
              { type: 'property', fieldId: 'field:status', op: 'eq', value: 'done' },
              { type: 'property', fieldId: 'field:priority', op: 'eq', value: 'high' },
            ],
          },
        ],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      const results = handle.getLastResults()
      expect(results.length).toBe(2)
      expect(results.map((n) => n.id)).toContain(task1)
      expect(results.map((n) => n.id)).toContain(task2)
      expect(results.map((n) => n.id)).not.toContain(task3)
    })

    it('should detect changes with OR filter', () => {
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'pending')
      setProperty(db, taskId, 'field:priority', 'low')

      // Query: done OR high priority
      const query: QueryDefinition = {
        filters: [
          { type: 'supertag', supertagId: 'supertag:task' },
          {
            type: 'or',
            filters: [
              { type: 'property', fieldId: 'field:status', op: 'eq', value: 'done' },
              { type: 'property', fieldId: 'field:priority', op: 'eq', value: 'high' },
            ],
          },
        ],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      // Initially doesn't match
      expect(handle.getLastResults().length).toBe(0)

      // Change priority to high - should now match
      setProperty(db, taskId, 'field:priority', 'high')

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.added.length).toBe(1)
      expect(event.added[0].id).toBe(taskId)
    })
  })

  // ==========================================================================
  // refreshAll()
  // ==========================================================================

  describe('refreshAll()', () => {
    it('should force re-evaluate all subscriptions', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      // Initial state
      expect(handle.getLastResults().length).toBe(0)

      // Simulate external change (bypassing event bus)
      const now = Date.now()
      sqlite.exec(`
        INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
        VALUES ('external-task', 'External Task', 'external task', null, ${now}, ${now})
      `)
      // Add supertag manually
      sqlite.exec(`
        INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
        VALUES ('external-task', 'field-supertag', '"supertag-task"', 0, ${now}, ${now})
      `)

      // refreshAll should detect the change
      service.refreshAll(db)

      expect(callback).toHaveBeenCalledTimes(1)
      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.added.length).toBe(1)
      expect(event.added[0].id).toBe('external-task')
    })

    it('should not trigger callback if no changes', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      // refreshAll with no changes
      service.refreshAll(db)

      expect(callback).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // clear()
  // ==========================================================================

  describe('clear()', () => {
    it('should remove all subscriptions', () => {
      const query: QueryDefinition = { filters: [] }

      service.subscribe(db, query, vi.fn())
      service.subscribe(db, query, vi.fn())
      expect(service.subscriptionCount()).toBe(2)

      service.clear()

      expect(service.subscriptionCount()).toBe(0)
      expect(service.getActiveSubscriptions()).toEqual([])
    })

    it('should stop all event delivery after clear', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      service.subscribe(db, query, callback)

      service.clear()

      // Create a task - should NOT trigger callback
      createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      expect(callback).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Error Handling
  // ==========================================================================

  describe('error handling', () => {
    it('should catch and log callback errors without affecting other subscriptions', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const failingCallback: QueryResultChangeCallback = () => {
        throw new Error('Callback failed')
      }
      const successCallback = vi.fn()

      service.subscribe(db, query, failingCallback)
      service.subscribe(db, query, successCallback)

      // Create a task - should trigger both callbacks
      createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      // Success callback should still be called
      expect(successCallback).toHaveBeenCalledTimes(1)

      // Error should be logged
      expect(consoleErrorSpy).toHaveBeenCalled()

      consoleErrorSpy.mockRestore()
    })
  })

  // ==========================================================================
  // Event Bus Subscription Management
  // ==========================================================================

  describe('event bus subscription management', () => {
    it('should subscribe to event bus when first subscription added', () => {
      expect(eventBus.listenerCount()).toBe(0)

      const query: QueryDefinition = { filters: [] }
      service.subscribe(db, query, vi.fn())

      expect(eventBus.listenerCount()).toBe(1)
    })

    it('should unsubscribe from event bus when last subscription removed', () => {
      const query: QueryDefinition = { filters: [] }

      const handle1 = service.subscribe(db, query, vi.fn())
      const handle2 = service.subscribe(db, query, vi.fn())
      expect(eventBus.listenerCount()).toBe(1) // Single listener shared

      handle1.unsubscribe()
      expect(eventBus.listenerCount()).toBe(1) // Still 1

      handle2.unsubscribe()
      expect(eventBus.listenerCount()).toBe(0) // Now 0
    })

    it('should re-subscribe to event bus if new subscription after all cleared', () => {
      const query: QueryDefinition = { filters: [] }

      const handle = service.subscribe(db, query, vi.fn())
      expect(eventBus.listenerCount()).toBe(1)

      handle.unsubscribe()
      expect(eventBus.listenerCount()).toBe(0)

      service.subscribe(db, query, vi.fn())
      expect(eventBus.listenerCount()).toBe(1)
    })
  })

  // ==========================================================================
  // totalCount in events
  // ==========================================================================

  describe('totalCount in events', () => {
    it('should include totalCount in change events', () => {
      createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })

      const query: QueryDefinition = {
        filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
      }

      const callback = vi.fn()
      const handle = service.subscribe(db, query, callback)

      expect(handle.getLastResults().length).toBe(2)

      // Add a third task
      createNode(db, { content: 'Task 3', supertagId: 'supertag:task' })

      const event = callback.mock.calls[0][0] as QueryResultChangeEvent
      expect(event.totalCount).toBe(3)
    })
  })

  // ==========================================================================
  // Batched Re-evaluation (Phase 3)
  // ==========================================================================

  describe('batched re-evaluation', () => {
    afterEach(() => {
      // Reset debounce to default (0) after each test
      service.setDebounceMs(0)
    })

    describe('setDebounceMs() / getDebounceMs()', () => {
      it('should default to 0 (immediate processing)', () => {
        expect(service.getDebounceMs()).toBe(0)
      })

      it('should allow setting debounce window', () => {
        service.setDebounceMs(50)
        expect(service.getDebounceMs()).toBe(50)
      })

      it('should allow disabling batching by setting to 0', () => {
        service.setDebounceMs(100)
        expect(service.getDebounceMs()).toBe(100)

        service.setDebounceMs(0)
        expect(service.getDebounceMs()).toBe(0)
      })
    })

    describe('immediate processing (debounce = 0)', () => {
      it('should process mutations immediately when debounce is 0', () => {
        service.setDebounceMs(0)

        const query: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }

        const callback = vi.fn()
        service.subscribe(db, query, callback)

        // Each mutation should trigger immediately
        createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
        expect(callback).toHaveBeenCalledTimes(1)

        createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
        expect(callback).toHaveBeenCalledTimes(2)

        createNode(db, { content: 'Task 3', supertagId: 'supertag:task' })
        expect(callback).toHaveBeenCalledTimes(3)
      })
    })

    describe('batched processing (debounce > 0)', () => {
      it('should batch rapid mutations into single callback', async () => {
        service.setDebounceMs(50)

        const query: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }

        const callback = vi.fn()
        service.subscribe(db, query, callback)

        // Rapid mutations - should be batched
        createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
        createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
        createNode(db, { content: 'Task 3', supertagId: 'supertag:task' })

        // Callback should not be called yet (mutations are pending)
        expect(callback).toHaveBeenCalledTimes(0)

        // Wait for debounce window to expire
        await new Promise((resolve) => setTimeout(resolve, 60))

        // Now callback should be called once with all 3 nodes added
        expect(callback).toHaveBeenCalledTimes(1)
        const event = callback.mock.calls[0][0] as QueryResultChangeEvent
        expect(event.added.length).toBe(3)
      })

      it('should merge added nodes from multiple mutations in batch', async () => {
        service.setDebounceMs(50)

        const query: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }

        const callback = vi.fn()
        const handle = service.subscribe(db, query, callback)

        // Create 3 tasks rapidly
        const id1 = createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
        const id2 = createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
        const id3 = createNode(db, { content: 'Task 3', supertagId: 'supertag:task' })

        // Wait for batch to process
        await new Promise((resolve) => setTimeout(resolve, 60))

        expect(callback).toHaveBeenCalledTimes(1)
        const event = callback.mock.calls[0][0] as QueryResultChangeEvent
        expect(event.added.map((n) => n.id).sort()).toEqual([id1, id2, id3].sort())

        // Final state should have all 3
        const results = handle.getLastResults()
        expect(results.length).toBe(3)
      })

      it('should handle mixed add and remove in same batch', async () => {
        // Create initial task
        const existingTaskId = createNode(db, {
          content: 'Existing Task',
          supertagId: 'supertag:task',
        })

        service.setDebounceMs(50)

        const query: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }

        const callback = vi.fn()
        const handle = service.subscribe(db, query, callback)

        expect(handle.getLastResults().length).toBe(1)

        // Rapid mutations: add one, delete existing, add another
        const newId1 = createNode(db, { content: 'New Task 1', supertagId: 'supertag:task' })
        deleteNode(db, existingTaskId)
        const newId2 = createNode(db, { content: 'New Task 2', supertagId: 'supertag:task' })

        // Wait for batch to process
        await new Promise((resolve) => setTimeout(resolve, 60))

        expect(callback).toHaveBeenCalledTimes(1)
        const event = callback.mock.calls[0][0] as QueryResultChangeEvent
        expect(event.added.map((n) => n.id).sort()).toEqual([newId1, newId2].sort())
        expect(event.removed.map((n) => n.id)).toEqual([existingTaskId])

        // Final state should have 2 new tasks
        const results = handle.getLastResults()
        expect(results.length).toBe(2)
      })

      it('should handle changes within batch', async () => {
        // Create initial task
        const taskId = createNode(db, {
          content: 'Original content',
          supertagId: 'supertag:task',
        })

        service.setDebounceMs(50)

        const query: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }

        const callback = vi.fn()
        service.subscribe(db, query, callback)

        // Rapid changes to the same node
        updateNodeContent(db, taskId, 'First update')
        updateNodeContent(db, taskId, 'Second update')
        updateNodeContent(db, taskId, 'Final update')

        // Wait for batch to process
        await new Promise((resolve) => setTimeout(resolve, 60))

        // Should only see the final state as "changed"
        expect(callback).toHaveBeenCalledTimes(1)
        const event = callback.mock.calls[0][0] as QueryResultChangeEvent
        expect(event.changed.length).toBe(1)
        expect(event.changed[0].content).toBe('Final update')
      })

      it('should reset debounce timer on new mutation', async () => {
        service.setDebounceMs(50)

        const query: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }

        const callback = vi.fn()
        service.subscribe(db, query, callback)

        // First mutation
        createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })

        // Wait 30ms (less than debounce window)
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(callback).toHaveBeenCalledTimes(0)

        // Second mutation should reset the timer
        createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })

        // Wait another 30ms (still within reset window)
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(callback).toHaveBeenCalledTimes(0)

        // Wait for the full debounce window to expire
        await new Promise((resolve) => setTimeout(resolve, 30))
        expect(callback).toHaveBeenCalledTimes(1)
        const event = callback.mock.calls[0][0] as QueryResultChangeEvent
        expect(event.added.length).toBe(2)
      })
    })

    describe('flushPendingMutations()', () => {
      it('should process pending mutations immediately', () => {
        service.setDebounceMs(1000) // Long debounce

        const query: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }

        const callback = vi.fn()
        service.subscribe(db, query, callback)

        // Create nodes (will be batched)
        createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
        createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
        expect(callback).toHaveBeenCalledTimes(0)

        // Flush immediately
        service.flushPendingMutations()

        expect(callback).toHaveBeenCalledTimes(1)
        const event = callback.mock.calls[0][0] as QueryResultChangeEvent
        expect(event.added.length).toBe(2)
      })

      it('should cancel pending debounce timer after flush', async () => {
        service.setDebounceMs(50)

        const query: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }

        const callback = vi.fn()
        service.subscribe(db, query, callback)

        createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
        service.flushPendingMutations()
        expect(callback).toHaveBeenCalledTimes(1)

        // Wait for original debounce window - should not trigger again
        await new Promise((resolve) => setTimeout(resolve, 60))
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should be no-op when no pending mutations', () => {
        const query: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }

        const callback = vi.fn()
        service.subscribe(db, query, callback)

        // No mutations made
        service.flushPendingMutations()
        expect(callback).not.toHaveBeenCalled()
      })
    })

    describe('batching with multiple subscriptions', () => {
      it('should evaluate each subscription once per batch', async () => {
        service.setDebounceMs(50)

        const taskQuery: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }
        const projectQuery: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:project' }],
        }

        const taskCallback = vi.fn()
        const projectCallback = vi.fn()
        service.subscribe(db, taskQuery, taskCallback)
        service.subscribe(db, projectQuery, projectCallback)

        // Create multiple tasks rapidly
        createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
        createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
        createNode(db, { content: 'Project 1', supertagId: 'supertag:project' })

        // Wait for batch
        await new Promise((resolve) => setTimeout(resolve, 60))

        // Each subscription should be called once
        expect(taskCallback).toHaveBeenCalledTimes(1)
        expect(projectCallback).toHaveBeenCalledTimes(1)

        const taskEvent = taskCallback.mock.calls[0][0] as QueryResultChangeEvent
        const projectEvent = projectCallback.mock.calls[0][0] as QueryResultChangeEvent

        expect(taskEvent.added.length).toBe(2)
        expect(projectEvent.added.length).toBe(1)
      })
    })

    describe('clear() with pending batches', () => {
      it('should discard pending mutations on clear', async () => {
        service.setDebounceMs(100)

        const query: QueryDefinition = {
          filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
        }

        const callback = vi.fn()
        service.subscribe(db, query, callback)

        createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
        expect(callback).toHaveBeenCalledTimes(0)

        // Clear should discard pending mutations
        service.clear()

        // Wait for what would have been the debounce window
        await new Promise((resolve) => setTimeout(resolve, 120))

        // Callback should never be called
        expect(callback).toHaveBeenCalledTimes(0)
      })
    })
  })
})
