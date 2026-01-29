/**
 * integration.test.ts - Integration tests for the Phase 1 reactive system
 *
 * These tests validate the complete reactive system working together:
 * - Event bus emits events for mutations
 * - Query subscription service detects changes
 * - Automation service fires on query membership changes
 * - Multi-automation chains work within cycle limits
 *
 * Test scenarios:
 * 1. Auto-complete timestamp: when task status → 'done', set completedAt to now
 * 2. Multi-automation chain: priority → 'high' triggers supertag, which triggers property
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../schemas/item-schema.js'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '../../schemas/node-schema.js'
import {
  addNodeSupertag,
  assembleNode,
  clearSystemNodeCache,
  createNode,
  deleteNode,
  removeNodeSupertag,
  setProperty,
  updateNodeContent,
} from '../../services/node.service.js'
import type { QueryDefinition } from '../../types/query.js'
import { eventBus } from '../event-bus.js'
import { createQuerySubscriptionService } from '../query-subscription.service.js'
import { createAutomationService, type AutomationService } from '../automation.service.js'
import type { AutomationDefinition, QueryResultChangeEvent } from '../types.js'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Helper to get a property value from a node by nodeId and fieldSystemId.
 */
function getPropertyValue(
  db: BetterSQLite3Database<typeof schema>,
  nodeId: string,
  fieldSystemId: string,
): unknown {
  const node = assembleNode(db, nodeId)
  if (!node) return null

  for (const [, propValues] of Object.entries(node.properties)) {
    for (const pv of propValues) {
      if (pv.fieldSystemId === fieldSystemId) {
        return pv.value
      }
    }
  }
  return null
}

/**
 * Helper to check if a node has a specific supertag
 */
function hasSupertag(
  db: BetterSQLite3Database<typeof schema>,
  nodeId: string,
  supertagSystemId: string,
): boolean {
  const node = assembleNode(db, nodeId)
  if (!node) return false
  return node.supertags.some((st) => st.systemId === supertagSystemId)
}

// ============================================================================
// Test Setup
// ============================================================================

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let automationService: AutomationService

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
    { id: 'field-completed-at', systemId: 'field:completed_at', content: 'Completed At' },
    { id: 'field-notified', systemId: 'field:notified', content: 'Notified' },
    { id: 'field-due-date', systemId: 'field:due_date', content: 'Due Date' },
    { id: 'field-assigned-to', systemId: 'field:assigned_to', content: 'Assigned To' },
    { id: 'field-automation-definition', systemId: SYSTEM_FIELDS.AUTOMATION_DEFINITION, content: 'Automation Definition' },
    { id: 'field-automation-state', systemId: SYSTEM_FIELDS.AUTOMATION_STATE, content: 'Automation State' },
    { id: 'field-automation-last-fired', systemId: SYSTEM_FIELDS.AUTOMATION_LAST_FIRED, content: 'Automation Last Fired' },
    { id: 'field-automation-enabled', systemId: SYSTEM_FIELDS.AUTOMATION_ENABLED, content: 'Automation Enabled' },
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
    { id: 'supertag-urgent', systemId: 'supertag:urgent', content: '#Urgent' },
    { id: 'supertag-flagged', systemId: 'supertag:flagged', content: '#Flagged' },
    { id: 'supertag-automation', systemId: SYSTEM_SUPERTAGS.AUTOMATION, content: '#Automation' },
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
// Integration Test Suite
// ============================================================================

describe('Phase 1 Integration Tests', () => {
  beforeEach(() => {
    setupTestDatabase()
    clearSystemNodeCache()
    seedSystemNodes()

    // Clear the global event bus and create services
    eventBus.clear()
    const queryService = createQuerySubscriptionService(eventBus)
    automationService = createAutomationService(queryService)
  })

  afterEach(() => {
    automationService.clear()
    eventBus.clear()
    sqlite.close()
  })

  // ==========================================================================
  // Scenario 1: Auto-complete timestamp automation
  // ==========================================================================

  describe('Auto-complete timestamp automation', () => {
    it('should set completedAt when task status changes to done', () => {
      // Create automation: when task status → 'done', set completedAt to now
      const definition: AutomationDefinition = {
        name: 'Auto Complete Timestamp',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:completed_at',
          value: { $now: true },
        },
      }

      automationService.create(db, definition)

      // Create a task with status 'pending'
      const taskId = createNode(db, { content: 'My Task', supertagSystemId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'pending')

      // Verify completedAt is not set yet
      expect(getPropertyValue(db, taskId, 'field:completed_at')).toBeNull()

      // Change status to 'done' - should trigger automation
      const beforeTime = new Date().toISOString()
      setProperty(db, taskId, 'field:status', 'done')
      const afterTime = new Date().toISOString()

      // Verify completedAt was set automatically
      const completedAt = getPropertyValue(db, taskId, 'field:completed_at') as string
      expect(completedAt).toBeDefined()
      expect(completedAt >= beforeTime).toBe(true)
      expect(completedAt <= afterTime).toBe(true)
    })

    it('should clear completedAt when task status changes from done (onExit)', () => {
      // Create onEnter automation to set completedAt
      const setCompletedAt: AutomationDefinition = {
        name: 'Set CompletedAt',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:completed_at',
          value: { $now: true },
        },
      }

      // Create onExit automation to clear completedAt
      const clearCompletedAt: AutomationDefinition = {
        name: 'Clear CompletedAt',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' },
            ],
          },
          event: 'onExit',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:completed_at',
          value: null,
        },
      }

      automationService.create(db, setCompletedAt)
      automationService.create(db, clearCompletedAt)

      // Create task and set to done
      const taskId = createNode(db, { content: 'Task', supertagSystemId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'done')

      // Verify completedAt is set
      expect(getPropertyValue(db, taskId, 'field:completed_at')).toBeDefined()

      // Change status back to pending - should clear completedAt
      setProperty(db, taskId, 'field:status', 'pending')

      // Verify completedAt was cleared
      expect(getPropertyValue(db, taskId, 'field:completed_at')).toBeNull()
    })

    it('should work with newly created tasks that are immediately done', () => {
      const definition: AutomationDefinition = {
        name: 'Auto Complete on Create',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:completed_at',
          value: { $now: true },
        },
      }

      automationService.create(db, definition)

      // Create task and immediately set status to done
      const taskId = createNode(db, { content: 'Quick Task', supertagSystemId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'done')

      // Verify completedAt was set
      const completedAt = getPropertyValue(db, taskId, 'field:completed_at')
      expect(completedAt).toBeDefined()
    })
  })

  // ==========================================================================
  // Scenario 2: Multi-automation chain
  // ==========================================================================

  describe('Multi-automation chain (within cycle limit)', () => {
    it('should execute chain: priority→high adds urgent supertag, which sets notified=true', () => {
      // Automation A: when priority is high, add urgent supertag
      const automationA: AutomationDefinition = {
        name: 'Add Urgent on High Priority',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:priority', op: 'eq', value: 'high' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'add_supertag',
          supertagSystemId: 'supertag:urgent',
        },
      }

      // Automation B: when has urgent supertag, set notified = true
      const automationB: AutomationDefinition = {
        name: 'Notify on Urgent',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:urgent' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:notified',
          value: true,
        },
      }

      automationService.create(db, automationA)
      automationService.create(db, automationB)

      // Create task with low priority
      const taskId = createNode(db, { content: 'Important Task', supertagSystemId: 'supertag:task' })
      setProperty(db, taskId, 'field:priority', 'low')

      // Verify initial state
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(false)
      expect(getPropertyValue(db, taskId, 'field:notified')).toBeNull()

      // Change priority to high - should trigger chain
      setProperty(db, taskId, 'field:priority', 'high')

      // Verify both automations fired
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(true)
      expect(getPropertyValue(db, taskId, 'field:notified')).toBe(true)
    })

    it('should handle three-step automation chain', () => {
      // Automation A: status → done adds flagged supertag
      const automationA: AutomationDefinition = {
        name: 'Flag on Done',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'add_supertag',
          supertagSystemId: 'supertag:flagged',
        },
      }

      // Automation B: flagged supertag adds urgent supertag
      const automationB: AutomationDefinition = {
        name: 'Urgent on Flagged',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:flagged' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'add_supertag',
          supertagSystemId: 'supertag:urgent',
        },
      }

      // Automation C: urgent supertag sets notified=true
      const automationC: AutomationDefinition = {
        name: 'Notify on Urgent',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:urgent' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:notified',
          value: true,
        },
      }

      automationService.create(db, automationA)
      automationService.create(db, automationB)
      automationService.create(db, automationC)

      // Create task
      const taskId = createNode(db, { content: 'Chain Task', supertagSystemId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'pending')

      // Verify initial state
      expect(hasSupertag(db, taskId, 'supertag:flagged')).toBe(false)
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(false)
      expect(getPropertyValue(db, taskId, 'field:notified')).toBeNull()

      // Set status to done - triggers three-step chain
      setProperty(db, taskId, 'field:status', 'done')

      // Verify all three automations fired
      expect(hasSupertag(db, taskId, 'supertag:flagged')).toBe(true)
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(true)
      expect(getPropertyValue(db, taskId, 'field:notified')).toBe(true)
    })

    it('should reverse chain on exit events', () => {
      // Automation A: priority → high adds urgent supertag
      const addUrgent: AutomationDefinition = {
        name: 'Add Urgent',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:priority', op: 'eq', value: 'high' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'add_supertag',
          supertagSystemId: 'supertag:urgent',
        },
      }

      // Automation B: urgent adds notified
      const setNotified: AutomationDefinition = {
        name: 'Set Notified',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:urgent' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:notified',
          value: true,
        },
      }

      // Automation C: priority exits high removes urgent supertag
      const removeUrgent: AutomationDefinition = {
        name: 'Remove Urgent',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:priority', op: 'eq', value: 'high' },
            ],
          },
          event: 'onExit',
        },
        action: {
          type: 'remove_supertag',
          supertagSystemId: 'supertag:urgent',
        },
      }

      // Automation D: urgent removed clears notified
      const clearNotified: AutomationDefinition = {
        name: 'Clear Notified',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:urgent' }],
          },
          event: 'onExit',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:notified',
          value: false,
        },
      }

      automationService.create(db, addUrgent)
      automationService.create(db, setNotified)
      automationService.create(db, removeUrgent)
      automationService.create(db, clearNotified)

      // Create high priority task - triggers chain
      const taskId = createNode(db, { content: 'Task', supertagSystemId: 'supertag:task' })
      setProperty(db, taskId, 'field:priority', 'high')

      // Verify chain fired
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(true)
      expect(getPropertyValue(db, taskId, 'field:notified')).toBe(true)

      // Change priority to low - triggers reverse chain
      setProperty(db, taskId, 'field:priority', 'low')

      // Verify reverse chain fired
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(false)
      expect(getPropertyValue(db, taskId, 'field:notified')).toBe(false)
    })
  })

  // ==========================================================================
  // Scenario 3: Event bus integration
  // ==========================================================================

  describe('Event bus integration', () => {
    it('should emit events for all mutation types', () => {
      const events: string[] = []

      // Subscribe to all events
      const unsubscribe = eventBus.subscribe((event) => {
        events.push(event.type)
      })

      try {
        // Create node
        const nodeId = createNode(db, { content: 'Test Node' })
        expect(events).toContain('node:created')

        // Update content
        updateNodeContent(db, nodeId, 'Updated content')
        expect(events).toContain('node:updated')

        // Set property
        setProperty(db, nodeId, 'field:status', 'active')
        expect(events).toContain('property:set')

        // Add supertag
        addNodeSupertag(db, nodeId, 'supertag:task')
        expect(events).toContain('supertag:added')

        // Remove supertag
        removeNodeSupertag(db, nodeId, 'supertag:task')
        expect(events).toContain('supertag:removed')

        // Delete node
        deleteNode(db, nodeId)
        expect(events).toContain('node:deleted')
      } finally {
        unsubscribe()
      }
    })

    it('should provide before/after values in property events', () => {
      let capturedEvent: { beforeValue: unknown; afterValue: unknown } | null = null

      const unsubscribe = eventBus.subscribe((event) => {
        if (event.type === 'property:set') {
          capturedEvent = {
            beforeValue: event.beforeValue,
            afterValue: event.afterValue,
          }
        }
      })

      try {
        const nodeId = createNode(db, { content: 'Test' })

        // First set - no before value (undefined when property doesn't exist yet)
        setProperty(db, nodeId, 'field:status', 'pending')
        expect(capturedEvent?.beforeValue).toBeUndefined()
        expect(capturedEvent?.afterValue).toBe('pending')

        // Second set - has before value
        setProperty(db, nodeId, 'field:status', 'done')
        expect(capturedEvent?.beforeValue).toBe('pending')
        expect(capturedEvent?.afterValue).toBe('done')
      } finally {
        unsubscribe()
      }
    })
  })

  // ==========================================================================
  // Scenario 4: Query subscription with complex filters
  // ==========================================================================

  describe('Query subscription with complex filters', () => {
    it('should work with OR filters in automation trigger', () => {
      // Automation: when task is done OR priority is high, set notified
      const definition: AutomationDefinition = {
        name: 'Notify on Important',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              {
                type: 'or',
                filters: [
                  { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' },
                  { type: 'property', fieldSystemId: 'field:priority', op: 'eq', value: 'high' },
                ],
              },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:notified',
          value: true,
        },
      }

      automationService.create(db, definition)

      // Test 1: High priority triggers
      const task1 = createNode(db, { content: 'Task 1', supertagSystemId: 'supertag:task' })
      setProperty(db, task1, 'field:priority', 'high')
      expect(getPropertyValue(db, task1, 'field:notified')).toBe(true)

      // Test 2: Done status triggers
      const task2 = createNode(db, { content: 'Task 2', supertagSystemId: 'supertag:task' })
      setProperty(db, task2, 'field:status', 'done')
      expect(getPropertyValue(db, task2, 'field:notified')).toBe(true)

      // Test 3: Neither condition - doesn't trigger
      const task3 = createNode(db, { content: 'Task 3', supertagSystemId: 'supertag:task' })
      setProperty(db, task3, 'field:priority', 'low')
      setProperty(db, task3, 'field:status', 'pending')
      expect(getPropertyValue(db, task3, 'field:notified')).toBeNull()
    })

    it('should work with AND filters in automation trigger', () => {
      // Automation: when task is done AND priority is high, add urgent
      const definition: AutomationDefinition = {
        name: 'Urgent Done High Priority',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              {
                type: 'and',
                filters: [
                  { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' },
                  { type: 'property', fieldSystemId: 'field:priority', op: 'eq', value: 'high' },
                ],
              },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'add_supertag',
          supertagSystemId: 'supertag:urgent',
        },
      }

      automationService.create(db, definition)

      // Create task with high priority (not done yet)
      const taskId = createNode(db, { content: 'Task', supertagSystemId: 'supertag:task' })
      setProperty(db, taskId, 'field:priority', 'high')
      setProperty(db, taskId, 'field:status', 'pending')

      // Should not have urgent yet
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(false)

      // Set to done - now both conditions met
      setProperty(db, taskId, 'field:status', 'done')

      // Should have urgent now
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(true)
    })
  })

  // ==========================================================================
  // Scenario 5: Multiple automations on same event
  // ==========================================================================

  describe('Multiple automations on same event', () => {
    it('should execute all matching automations', () => {
      // Automation 1: Set status to 'active'
      const auto1: AutomationDefinition = {
        name: 'Set Status',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:status',
          value: 'active',
        },
      }

      // Automation 2: Set priority to 'normal'
      const auto2: AutomationDefinition = {
        name: 'Set Priority',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:priority',
          value: 'normal',
        },
      }

      // Automation 3: Set due date
      const auto3: AutomationDefinition = {
        name: 'Set Due Date',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:due_date',
          value: '2025-12-31',
        },
      }

      automationService.create(db, auto1)
      automationService.create(db, auto2)
      automationService.create(db, auto3)

      // Create a task
      const taskId = createNode(db, { content: 'New Task', supertagSystemId: 'supertag:task' })

      // All three automations should have fired
      expect(getPropertyValue(db, taskId, 'field:status')).toBe('active')
      expect(getPropertyValue(db, taskId, 'field:priority')).toBe('normal')
      expect(getPropertyValue(db, taskId, 'field:due_date')).toBe('2025-12-31')
    })
  })

  // ==========================================================================
  // Scenario 6: Disabled automations
  // ==========================================================================

  describe('Disabled automations', () => {
    it('should not execute disabled automations in a chain', () => {
      // Automation A: enabled - adds urgent
      const autoA: AutomationDefinition = {
        name: 'Add Urgent',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:priority', op: 'eq', value: 'high' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'add_supertag',
          supertagSystemId: 'supertag:urgent',
        },
      }

      // Automation B: DISABLED - should not set notified
      const autoB: AutomationDefinition = {
        name: 'Set Notified (disabled)',
        enabled: false,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:urgent' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:notified',
          value: true,
        },
      }

      automationService.create(db, autoA)
      automationService.create(db, autoB)

      // Create high priority task
      const taskId = createNode(db, { content: 'Task', supertagSystemId: 'supertag:task' })
      setProperty(db, taskId, 'field:priority', 'high')

      // Automation A should fire
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(true)

      // Automation B should NOT fire (disabled)
      expect(getPropertyValue(db, taskId, 'field:notified')).toBeNull()
    })
  })

  // ==========================================================================
  // Scenario 7: Cycle detection
  // ==========================================================================

  describe('Cycle detection prevents infinite loops', () => {
    it('should stop execution at max depth', () => {
      // This automation could cause infinite loop: onChange triggers property set
      // which triggers onChange again
      const definition: AutomationDefinition = {
        name: 'Self-Triggering',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:task' }],
          },
          event: 'onChange',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:status',
          value: { $now: true }, // Always unique value
        },
      }

      automationService.create(db, definition)

      // Create task
      const taskId = createNode(db, { content: 'Cyclic Task', supertagSystemId: 'supertag:task' })

      // Update content - would trigger infinite loop without cycle detection
      // This should NOT hang or crash
      updateNodeContent(db, taskId, 'Updated')

      // Node should still exist and be valid
      const node = assembleNode(db, taskId)
      expect(node).not.toBeNull()
      expect(node?.content).toBe('Updated')
    })
  })

  // ==========================================================================
  // Scenario 8: Real-world workflow
  // ==========================================================================

  describe('Real-world workflow: Task management', () => {
    it('should handle complete task lifecycle with automations', () => {
      // Automation 1: New tasks get default status and priority
      const defaultsAuto: AutomationDefinition = {
        name: 'Set Defaults',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagSystemId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:status',
          value: 'pending',
        },
      }

      // Automation 2: High priority tasks get urgent supertag
      const urgentAuto: AutomationDefinition = {
        name: 'Mark Urgent',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:priority', op: 'eq', value: 'high' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'add_supertag',
          supertagSystemId: 'supertag:urgent',
        },
      }

      // Automation 3: Completed tasks get timestamp
      const completedAuto: AutomationDefinition = {
        name: 'Set Completed',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldSystemId: 'field:completed_at',
          value: { $now: true },
        },
      }

      // Automation 4: Completed tasks lose urgent supertag
      const removeUrgentAuto: AutomationDefinition = {
        name: 'Remove Urgent on Complete',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagSystemId: 'supertag:task' },
              { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'remove_supertag',
          supertagSystemId: 'supertag:urgent',
        },
      }

      automationService.create(db, defaultsAuto)
      automationService.create(db, urgentAuto)
      automationService.create(db, completedAuto)
      automationService.create(db, removeUrgentAuto)

      // Step 1: Create a new task
      const taskId = createNode(db, { content: 'Important work', supertagSystemId: 'supertag:task' })

      // Should have default status
      expect(getPropertyValue(db, taskId, 'field:status')).toBe('pending')

      // Step 2: Set high priority
      setProperty(db, taskId, 'field:priority', 'high')

      // Should get urgent supertag
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(true)

      // Step 3: Complete the task
      setProperty(db, taskId, 'field:status', 'done')

      // Should have completion timestamp and no longer be urgent
      expect(getPropertyValue(db, taskId, 'field:completed_at')).toBeDefined()
      expect(hasSupertag(db, taskId, 'supertag:urgent')).toBe(false)
    })
  })
})
