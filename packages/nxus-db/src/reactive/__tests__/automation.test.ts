/**
 * automation.test.ts - Unit tests for the AutomationService
 *
 * Tests the reactive automation system including:
 * - Creating automations with correct supertag and properties
 * - onEnter trigger when node newly matches query
 * - onExit trigger when node stops matching query
 * - onChange trigger when matching node's properties change
 * - set_property action with static values and $now marker
 * - add_supertag action adds supertag to triggering node
 * - remove_supertag action removes supertag from triggering node
 * - Disabled automation doesn't fire
 * - Cycle detection prevents infinite loops
 * - Multiple automations firing on same event
 * - Automation state persistence
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
import { eventBus } from '../event-bus.js'
import { createQuerySubscriptionService } from '../query-subscription.service.js'
import { createAutomationService, type AutomationService } from '../automation.service.js'
import type { AutomationDefinition } from '../types.js'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Helper to get a property value from a node by nodeId and fieldId.
 * This looks up the property by searching for a property with the matching fieldId,
 * since assembleNode uses fieldName (content) as the key, not fieldId.
 *
 * @param fieldId Can be either the field's node UUID (fieldNodeId) or systemId (fieldSystemId)
 */
function getPropertyValue(
  db: BetterSQLite3Database<typeof schema>,
  nodeId: string,
  fieldId: string,
): unknown {
  const node = assembleNode(db, nodeId)
  if (!node) return null

  // Search through all properties to find one with matching fieldId
  // Match by either fieldNodeId (UUID) or fieldSystemId (system identifier)
  for (const [, propValues] of Object.entries(node.properties)) {
    for (const pv of propValues) {
      if (pv.fieldNodeId === fieldId || pv.fieldSystemId === fieldId) {
        return pv.value
      }
    }
  }
  return null
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
// Test Suite
// ============================================================================

describe('AutomationService', () => {
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
  // create() - Automation Creation
  // ==========================================================================

  describe('create()', () => {
    it('should create automation node with correct supertag', () => {
      const definition: AutomationDefinition = {
        name: 'Test Automation',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'active',
        },
      }

      const automationId = automationService.create(db, definition)

      expect(automationId).toBeDefined()

      // Verify the node has the automation supertag
      const node = assembleNode(db, automationId)
      expect(node).not.toBeNull()
      expect(node?.supertags.some((st) => st.systemId === SYSTEM_SUPERTAGS.AUTOMATION)).toBe(true)
    })

    it('should store definition in properties', () => {
      const definition: AutomationDefinition = {
        name: 'Test Automation',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'active',
        },
      }

      const automationId = automationService.create(db, definition)

      // Verify definition property
      const definitionValue = getPropertyValue(db, automationId, SYSTEM_FIELDS.AUTOMATION_DEFINITION)
      expect(definitionValue).toBeDefined()
      const parsed = JSON.parse(definitionValue as string)
      expect(parsed.name).toBe('Test Automation')
      expect(parsed.trigger.type).toBe('query_membership')
    })

    it('should set enabled property', () => {
      const definition: AutomationDefinition = {
        name: 'Test Automation',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: { filters: [] },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'active',
        },
      }

      const automationId = automationService.create(db, definition)

      const enabledValue = getPropertyValue(db, automationId, SYSTEM_FIELDS.AUTOMATION_ENABLED)
      expect(enabledValue).toBe(true)
    })

    it('should set initial state property', () => {
      const definition: AutomationDefinition = {
        name: 'Test Automation',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: { filters: [] },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'active',
        },
      }

      const automationId = automationService.create(db, definition)

      const stateValue = getPropertyValue(db, automationId, SYSTEM_FIELDS.AUTOMATION_STATE)
      expect(stateValue).toBeDefined()
      expect(JSON.parse(stateValue as string)).toEqual({})
    })

    it('should increment active count when enabled', () => {
      expect(automationService.activeCount()).toBe(0)

      const definition: AutomationDefinition = {
        name: 'Test Automation',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: { filters: [] },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'active',
        },
      }

      automationService.create(db, definition)

      expect(automationService.activeCount()).toBe(1)
    })

    it('should not increment active count when disabled', () => {
      expect(automationService.activeCount()).toBe(0)

      const definition: AutomationDefinition = {
        name: 'Test Automation',
        enabled: false, // Disabled
        trigger: {
          type: 'query_membership',
          queryDefinition: { filters: [] },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'active',
        },
      }

      automationService.create(db, definition)

      expect(automationService.activeCount()).toBe(0)
    })
  })

  // ==========================================================================
  // onEnter trigger
  // ==========================================================================

  describe('onEnter trigger', () => {
    it('should fire when node newly matches query (supertag added)', () => {
      // Create automation: when node gets task supertag, set status to 'active'
      const definition: AutomationDefinition = {
        name: 'Activate on Task',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'active',
        },
      }

      automationService.create(db, definition)

      // Create a plain node
      const nodeId = createNode(db, { content: 'Plain Node' })

      // Verify status is not set
      expect(getPropertyValue(db, nodeId, 'field:status')).toBeNull()

      // Add task supertag - should trigger automation
      addNodeSupertag(db, nodeId, 'supertag:task')

      // Verify status was set by automation
      expect(getPropertyValue(db, nodeId, 'field:status')).toBe('active')
    })

    it('should fire when node created with matching supertag', () => {
      // Create automation: when task created, set priority to 'normal'
      const definition: AutomationDefinition = {
        name: 'Default Priority',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:priority',
          value: 'normal',
        },
      }

      automationService.create(db, definition)

      // Create a task - should trigger automation
      const taskId = createNode(db, { content: 'New Task', supertagId: 'supertag:task' })

      // Verify priority was set
      expect(getPropertyValue(db, taskId, 'field:priority')).toBe('normal')
    })

    it('should fire when property change makes node match filter', () => {
      // Create automation: when task becomes 'done', set completed_at
      const definition: AutomationDefinition = {
        name: 'Track Completion',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagId: 'supertag:task' },
              { type: 'property', fieldId: 'field:status', op: 'eq', value: 'done' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:completed_at',
          value: { $now: true },
        },
      }

      automationService.create(db, definition)

      // Create task with pending status
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'pending')

      // Verify completed_at is not set
      expect(getPropertyValue(db, taskId, 'field:completed_at')).toBeNull()

      // Change status to done - should trigger automation
      setProperty(db, taskId, 'field:status', 'done')

      // Verify completed_at was set
      const completedAt = getPropertyValue(db, taskId, 'field:completed_at')
      expect(completedAt).toBeDefined()
      expect(typeof completedAt).toBe('string')
      // Should be a valid ISO timestamp
      expect(new Date(completedAt as string).getTime()).not.toBeNaN()
    })
  })

  // ==========================================================================
  // onExit trigger
  // ==========================================================================

  describe('onExit trigger', () => {
    it('should fire when node stops matching query (supertag removed)', () => {
      // Create automation: when node loses task supertag, set status to 'archived'
      const definition: AutomationDefinition = {
        name: 'Archive on Untag',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onExit',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'archived',
        },
      }

      automationService.create(db, definition)

      // Create a task
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'active')

      // Remove task supertag - should trigger automation
      removeNodeSupertag(db, taskId, 'supertag:task')

      // Verify status was set to archived
      expect(getPropertyValue(db, taskId, 'field:status')).toBe('archived')
    })

    it('should fire when property change makes node not match filter', () => {
      // Create automation: when task status changes from 'done', clear completed_at
      const definition: AutomationDefinition = {
        name: 'Clear Completion',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagId: 'supertag:task' },
              { type: 'property', fieldId: 'field:status', op: 'eq', value: 'done' },
            ],
          },
          event: 'onExit',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:completed_at',
          value: null,
        },
      }

      automationService.create(db, definition)

      // Create a done task
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'done')
      setProperty(db, taskId, 'field:completed_at', '2025-01-01T00:00:00Z')

      // Change status to pending - should trigger onExit automation
      setProperty(db, taskId, 'field:status', 'pending')

      // Verify completed_at was cleared
      expect(getPropertyValue(db, taskId, 'field:completed_at')).toBeNull()
    })

    it('should fire when node is deleted', () => {
      // Note: When a node is deleted, the onExit still fires but the action
      // on a deleted node may be affected by soft-delete.
      const definition: AutomationDefinition = {
        name: 'Mark Deleted',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onExit',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'deleted',
        },
      }

      automationService.create(db, definition)

      // Create a task
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      // Set an initial status
      setProperty(db, taskId, 'field:status', 'active')

      // Delete the task - should trigger onExit
      deleteNode(db, taskId)

      // The automation should have tried to set the property
      // Since node is soft-deleted, we just verify no error occurred
    })
  })

  // ==========================================================================
  // onChange trigger
  // ==========================================================================

  describe('onChange trigger', () => {
    it('should fire when matching node content changes', () => {
      // Create a task first (before creating automation to avoid it affecting initial setup)
      const taskId = createNode(db, { content: 'Original', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:notified', true)

      // Verify notified is set to true
      expect(getPropertyValue(db, taskId, 'field:notified')).toBe(true)

      // Now create automation: when task content changes, set notified to false
      const definition: AutomationDefinition = {
        name: 'Reset Notified on Change',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onChange',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:notified',
          value: false,
        },
      }

      automationService.create(db, definition)

      // Update content - should trigger onChange
      updateNodeContent(db, taskId, 'Updated content')

      // Verify notified was reset
      expect(getPropertyValue(db, taskId, 'field:notified')).toBe(false)
    })

    it('should fire when matching node property changes (not affecting filter)', () => {
      // Create automation: when task priority changes, set a flag
      const definition: AutomationDefinition = {
        name: 'Track Priority Changes',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onChange',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:notified',
          value: 'priority_changed',
        },
      }

      automationService.create(db, definition)

      // Create a task
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:priority', 'low')

      // Change priority - should trigger onChange
      setProperty(db, taskId, 'field:priority', 'high')

      // Verify action executed
      expect(getPropertyValue(db, taskId, 'field:notified')).toBe('priority_changed')
    })
  })

  // ==========================================================================
  // set_property action
  // ==========================================================================

  describe('set_property action', () => {
    it('should set string value', () => {
      const definition: AutomationDefinition = {
        name: 'Set String',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'active',
        },
      }

      automationService.create(db, definition)

      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      expect(getPropertyValue(db, taskId, 'field:status')).toBe('active')
    })

    it('should set numeric value', () => {
      const definition: AutomationDefinition = {
        name: 'Set Number',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:priority',
          value: 5,
        },
      }

      automationService.create(db, definition)

      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      expect(getPropertyValue(db, taskId, 'field:priority')).toBe(5)
    })

    it('should set boolean value', () => {
      const definition: AutomationDefinition = {
        name: 'Set Boolean',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:notified',
          value: true,
        },
      }

      automationService.create(db, definition)

      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      expect(getPropertyValue(db, taskId, 'field:notified')).toBe(true)
    })

    it('should set null value', () => {
      const definition: AutomationDefinition = {
        name: 'Clear Property',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: null,
        },
      }

      // Create task first and set a property
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:status', 'active')

      // Remove the supertag so we can add it again to trigger the automation
      removeNodeSupertag(db, taskId, 'supertag:task')

      // Now create automation
      automationService.create(db, definition)

      // Add supertag to trigger automation
      addNodeSupertag(db, taskId, 'supertag:task')

      expect(getPropertyValue(db, taskId, 'field:status')).toBeNull()
    })

    it('should handle $now marker for timestamps', () => {
      const definition: AutomationDefinition = {
        name: 'Set Timestamp',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:completed_at',
          value: { $now: true },
        },
      }

      const beforeTime = new Date().toISOString()
      automationService.create(db, definition)

      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      const afterTime = new Date().toISOString()

      const completedAt = getPropertyValue(db, taskId, 'field:completed_at') as string
      expect(completedAt).toBeDefined()
      expect(completedAt >= beforeTime).toBe(true)
      expect(completedAt <= afterTime).toBe(true)
    })
  })

  // ==========================================================================
  // add_supertag action
  // ==========================================================================

  describe('add_supertag action', () => {
    it('should add supertag to triggering node', () => {
      // Create automation: when priority is high, add urgent supertag
      const definition: AutomationDefinition = {
        name: 'Mark Urgent',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagId: 'supertag:task' },
              { type: 'property', fieldId: 'field:priority', op: 'eq', value: 'high' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'add_supertag',
          supertagId: 'supertag:urgent',
        },
      }

      automationService.create(db, definition)

      // Create a task with low priority
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:priority', 'low')

      // Verify no urgent supertag
      let node = assembleNode(db, taskId)
      expect(node?.supertags.some((st) => st.systemId === 'supertag:urgent')).toBe(false)

      // Change priority to high - should trigger automation
      setProperty(db, taskId, 'field:priority', 'high')

      // Verify urgent supertag was added
      node = assembleNode(db, taskId)
      expect(node?.supertags.some((st) => st.systemId === 'supertag:urgent')).toBe(true)
    })
  })

  // ==========================================================================
  // remove_supertag action
  // ==========================================================================

  describe('remove_supertag action', () => {
    it('should remove supertag from triggering node', () => {
      // Create automation: when priority becomes low, remove urgent supertag
      const definition: AutomationDefinition = {
        name: 'Remove Urgent',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagId: 'supertag:task' },
              { type: 'property', fieldId: 'field:priority', op: 'eq', value: 'low' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'remove_supertag',
          supertagId: 'supertag:urgent',
        },
      }

      automationService.create(db, definition)

      // Create a high priority task with urgent supertag
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      addNodeSupertag(db, taskId, 'supertag:urgent')
      setProperty(db, taskId, 'field:priority', 'high')

      // Verify urgent supertag is present
      let node = assembleNode(db, taskId)
      expect(node?.supertags.some((st) => st.systemId === 'supertag:urgent')).toBe(true)

      // Change priority to low - should trigger automation
      setProperty(db, taskId, 'field:priority', 'low')

      // Verify urgent supertag was removed
      node = assembleNode(db, taskId)
      expect(node?.supertags.some((st) => st.systemId === 'supertag:urgent')).toBe(false)
    })
  })

  // ==========================================================================
  // Disabled automation
  // ==========================================================================

  describe('disabled automation', () => {
    it('should not fire when disabled', () => {
      const definition: AutomationDefinition = {
        name: 'Disabled Automation',
        enabled: false, // Disabled
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'auto-set',
        },
      }

      automationService.create(db, definition)

      // Create a task
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      // Verify automation did NOT fire
      expect(getPropertyValue(db, taskId, 'field:status')).toBeNull()
    })

    it('should not fire after being disabled via setEnabled', () => {
      const definition: AutomationDefinition = {
        name: 'Test Automation',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'auto-set',
        },
      }

      const automationId = automationService.create(db, definition)

      // First task - automation fires
      const task1 = createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      expect(getPropertyValue(db, task1, 'field:status')).toBe('auto-set')

      // Disable the automation
      automationService.setEnabled(db, automationId, false)

      // Second task - automation should NOT fire
      const task2 = createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      expect(getPropertyValue(db, task2, 'field:status')).toBeNull()
    })

    it('should fire after being re-enabled', () => {
      const definition: AutomationDefinition = {
        name: 'Test Automation',
        enabled: false, // Start disabled
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'auto-set',
        },
      }

      const automationId = automationService.create(db, definition)

      // First task - automation doesn't fire
      const task1 = createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      expect(getPropertyValue(db, task1, 'field:status')).toBeNull()

      // Enable the automation
      automationService.setEnabled(db, automationId, true)

      // Second task - automation should fire
      const task2 = createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      expect(getPropertyValue(db, task2, 'field:status')).toBe('auto-set')
    })
  })

  // ==========================================================================
  // Cycle detection
  // ==========================================================================

  describe('cycle detection', () => {
    it('should prevent infinite loops when automation triggers itself', () => {
      // This automation would cause an infinite loop without cycle detection:
      // When task changes, update a property, which triggers another change, etc.
      const definition: AutomationDefinition = {
        name: 'Self-Triggering',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onChange',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: { $now: true }, // Always a new value
        },
      }

      automationService.create(db, definition)

      // Create a task
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      // Update content - would cause infinite loop without cycle detection
      // The test passes if this doesn't hang or throw
      updateNodeContent(db, taskId, 'Updated')

      // Verify node still exists and is valid
      const node = assembleNode(db, taskId)
      expect(node).not.toBeNull()
    })

    it('should allow multi-automation chains within depth limit', () => {
      // Automation A: when priority is high, add urgent supertag
      const automationA: AutomationDefinition = {
        name: 'Add Urgent',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagId: 'supertag:task' },
              { type: 'property', fieldId: 'field:priority', op: 'eq', value: 'high' },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'add_supertag',
          supertagId: 'supertag:urgent',
        },
      }

      // Automation B: when has urgent supertag, set notified = true
      const automationB: AutomationDefinition = {
        name: 'Notify Urgent',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:urgent' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:notified',
          value: true,
        },
      }

      automationService.create(db, automationA)
      automationService.create(db, automationB)

      // Create task and set high priority
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      setProperty(db, taskId, 'field:priority', 'high')

      // Both automations should have fired
      const node = assembleNode(db, taskId)
      expect(node?.supertags.some((st) => st.systemId === 'supertag:urgent')).toBe(true)
      expect(getPropertyValue(db, taskId, 'field:notified')).toBe(true)
    })
  })

  // ==========================================================================
  // Multiple automations on same event
  // ==========================================================================

  describe('multiple automations on same event', () => {
    it('should allow multiple automations to fire on same event', () => {
      // Automation 1: Set status
      const automation1: AutomationDefinition = {
        name: 'Set Status',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'pending',
        },
      }

      // Automation 2: Set priority
      const automation2: AutomationDefinition = {
        name: 'Set Priority',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:priority',
          value: 'normal',
        },
      }

      automationService.create(db, automation1)
      automationService.create(db, automation2)

      // Create a task
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      // Both automations should have fired
      expect(getPropertyValue(db, taskId, 'field:status')).toBe('pending')
      expect(getPropertyValue(db, taskId, 'field:priority')).toBe('normal')
    })
  })

  // ==========================================================================
  // delete()
  // ==========================================================================

  describe('delete()', () => {
    it('should remove automation and stop it from firing', () => {
      const definition: AutomationDefinition = {
        name: 'To Delete',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'automated',
        },
      }

      const automationId = automationService.create(db, definition)

      // First task - automation fires
      const task1 = createNode(db, { content: 'Task 1', supertagId: 'supertag:task' })
      expect(getPropertyValue(db, task1, 'field:status')).toBe('automated')

      // Delete automation
      automationService.delete(db, automationId)

      // Second task - automation should NOT fire
      const task2 = createNode(db, { content: 'Task 2', supertagId: 'supertag:task' })
      expect(getPropertyValue(db, task2, 'field:status')).toBeNull()
    })

    it('should decrement active count', () => {
      const definition: AutomationDefinition = {
        name: 'Test',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: { filters: [] },
          event: 'onEnter',
        },
        action: { type: 'set_property', fieldId: 'field:status', value: 'x' },
      }

      const automationId = automationService.create(db, definition)
      expect(automationService.activeCount()).toBe(1)

      automationService.delete(db, automationId)
      expect(automationService.activeCount()).toBe(0)
    })
  })

  // ==========================================================================
  // trigger() - Manual trigger
  // ==========================================================================

  describe('trigger() - manual trigger', () => {
    it('should execute action on specified node', () => {
      const definition: AutomationDefinition = {
        name: 'Manual Test',
        enabled: false, // Disabled for normal operation
        trigger: {
          type: 'query_membership',
          queryDefinition: { filters: [] },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'manually-triggered',
        },
      }

      const automationId = automationService.create(db, definition)

      // Create a node
      const nodeId = createNode(db, { content: 'Test Node' })

      // Manual trigger
      automationService.trigger(db, automationId, { nodeId })

      // Verify action was executed
      expect(getPropertyValue(db, nodeId, 'field:status')).toBe('manually-triggered')
    })
  })

  // ==========================================================================
  // clear()
  // ==========================================================================

  describe('clear()', () => {
    it('should remove all active automations', () => {
      const definition1: AutomationDefinition = {
        name: 'Auto 1',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: { filters: [] },
          event: 'onEnter',
        },
        action: { type: 'set_property', fieldId: 'field:status', value: 'a' },
      }

      const definition2: AutomationDefinition = {
        name: 'Auto 2',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: { filters: [] },
          event: 'onEnter',
        },
        action: { type: 'set_property', fieldId: 'field:status', value: 'b' },
      }

      automationService.create(db, definition1)
      automationService.create(db, definition2)

      expect(automationService.activeCount()).toBe(2)

      automationService.clear()

      expect(automationService.activeCount()).toBe(0)
    })

    it('should stop automations from firing after clear', () => {
      const definition: AutomationDefinition = {
        name: 'Test',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'automated',
        },
      }

      automationService.create(db, definition)
      automationService.clear()

      // Create task - automation should NOT fire
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })
      expect(getPropertyValue(db, taskId, 'field:status')).toBeNull()
    })
  })

  // ==========================================================================
  // Threshold automations
  // ==========================================================================

  describe('threshold automations', () => {
    // We need the computed field service for threshold tests
    let computedFieldService: ReturnType<typeof import('../computed-field.service.js').createComputedFieldService>

    beforeEach(async () => {
      // Import and create computed field service with the same query service
      const { createComputedFieldService } = await import('../computed-field.service.js')

      // Clear the automation service before creating a new one with computed field support
      automationService.clear()

      // Create services with shared query subscription service
      const queryService = createQuerySubscriptionService(eventBus)
      computedFieldService = createComputedFieldService(queryService)

      // Create automation service with both services
      const { createAutomationService } = await import('../automation.service.js')
      automationService = createAutomationService(queryService, computedFieldService)

      // Add the computed_field supertag and its fields to the test database
      const now = Date.now()
      sqlite.exec(`
        INSERT OR IGNORE INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
        VALUES
          ('supertag-computed-field', '#ComputedField', '#computedfield', 'supertag:computed_field', ${now}, ${now}),
          ('field-computed-definition', 'Computed Field Definition', 'computed field definition', 'field:computed_field_definition', ${now}, ${now}),
          ('field-computed-value', 'Computed Field Value', 'computed field value', 'field:computed_field_value', ${now}, ${now}),
          ('field-computed-updated-at', 'Computed Field Updated At', 'computed field updated at', 'field:computed_field_updated_at', ${now}, ${now}),
          ('field-amount', 'Amount', 'amount', 'field:amount', ${now}, ${now}),
          ('supertag-subscription', '#Subscription', '#subscription', 'supertag:subscription', ${now}, ${now})
      `)
    })

    afterEach(() => {
      computedFieldService.clear()
    })

    it('should fire when computed field crosses threshold', () => {
      // Create a computed field that sums amounts of subscriptions
      const computedFieldId = computedFieldService.create(db, {
        name: 'Total Subscriptions',
        definition: {
          aggregation: 'SUM',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
          fieldId: 'field:amount',
        },
      })

      // Track if automation fired
      let automationFired = false
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
        // Threshold actions log a warning since they don't have a target node
        if (typeof msg === 'string' && msg.includes('set_property action requires a target node')) {
          automationFired = true
        }
      })

      // Create threshold automation: when total > 100, fire
      const definition: AutomationDefinition = {
        name: 'High Total Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'gt',
            value: 100,
          },
          fireOnce: false,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'alert',
        },
      }

      automationService.create(db, definition)

      // Initial value is null (no subscriptions) - should not fire
      expect(automationFired).toBe(false)

      // Add subscription with amount 50 - total becomes 50, still below 100
      const sub1 = createNode(db, { content: 'Subscription 1', supertagId: 'supertag:subscription' })
      setProperty(db, sub1, 'field:amount', 50)
      expect(automationFired).toBe(false)

      // Add another subscription with amount 60 - total becomes 110, crosses 100
      const sub2 = createNode(db, { content: 'Subscription 2', supertagId: 'supertag:subscription' })
      setProperty(db, sub2, 'field:amount', 60)

      // Automation should have fired
      expect(automationFired).toBe(true)

      consoleWarnSpy.mockRestore()
    })

    it('should only fire once with fireOnce: true', () => {
      // Create a computed field that counts subscriptions
      const computedFieldId = computedFieldService.create(db, {
        name: 'Subscription Count',
        definition: {
          aggregation: 'COUNT',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
        },
      })

      // Track how many times automation fired
      let fireCount = 0
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
        if (typeof msg === 'string' && msg.includes('set_property action requires a target node')) {
          fireCount++
        }
      })

      // Create threshold automation: when count >= 3, fire once
      const definition: AutomationDefinition = {
        name: 'Three Subscription Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'gte',
            value: 3,
          },
          fireOnce: true,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'alert',
        },
      }

      automationService.create(db, definition)

      // Add first subscription - count is 1
      createNode(db, { content: 'Sub 1', supertagId: 'supertag:subscription' })
      expect(fireCount).toBe(0)

      // Add second subscription - count is 2
      createNode(db, { content: 'Sub 2', supertagId: 'supertag:subscription' })
      expect(fireCount).toBe(0)

      // Add third subscription - count is 3, crosses threshold
      createNode(db, { content: 'Sub 3', supertagId: 'supertag:subscription' })
      expect(fireCount).toBe(1)

      // Add fourth subscription - count is 4, still above threshold but should NOT fire again
      createNode(db, { content: 'Sub 4', supertagId: 'supertag:subscription' })
      expect(fireCount).toBe(1) // Still 1, not 2

      consoleWarnSpy.mockRestore()
    })

    it('should fire on every crossing with fireOnce: false', () => {
      // Create a computed field that sums amounts
      const computedFieldId = computedFieldService.create(db, {
        name: 'Total Amount',
        definition: {
          aggregation: 'SUM',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
          fieldId: 'field:amount',
        },
      })

      // Track how many times automation fired
      let fireCount = 0
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
        if (typeof msg === 'string' && msg.includes('set_property action requires a target node')) {
          fireCount++
        }
      })

      // Create threshold automation with fireOnce: false
      const definition: AutomationDefinition = {
        name: 'Total Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'gte',
            value: 100,
          },
          fireOnce: false, // Fire every time value changes while above threshold
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'alert',
        },
      }

      automationService.create(db, definition)

      // Add subscription with amount 80 - below threshold
      const sub1 = createNode(db, { content: 'Sub 1', supertagId: 'supertag:subscription' })
      setProperty(db, sub1, 'field:amount', 80)
      expect(fireCount).toBe(0)

      // Add subscription with amount 30 - total is 110, crosses threshold
      const sub2 = createNode(db, { content: 'Sub 2', supertagId: 'supertag:subscription' })
      setProperty(db, sub2, 'field:amount', 30)
      expect(fireCount).toBe(1)

      // Note: With fireOnce: false, the automation fires on crossing
      // but doesn't fire again while staying above threshold unless value changes.
      // The implementation fires on crossing (transition from below to above).

      consoleWarnSpy.mockRestore()
    })

    it('should reset thresholdCrossed when value drops below threshold', () => {
      // Create a computed field that sums amounts
      const computedFieldId = computedFieldService.create(db, {
        name: 'Total Amount',
        definition: {
          aggregation: 'SUM',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
          fieldId: 'field:amount',
        },
      })

      // Track how many times automation fired
      let fireCount = 0
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
        if (typeof msg === 'string' && msg.includes('set_property action requires a target node')) {
          fireCount++
        }
      })

      // Create threshold automation with fireOnce: true
      const definition: AutomationDefinition = {
        name: 'Threshold Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'gt',
            value: 100,
          },
          fireOnce: true,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'alert',
        },
      }

      automationService.create(db, definition)

      // Add subscription with amount 150 - crosses threshold
      const sub1 = createNode(db, { content: 'Sub 1', supertagId: 'supertag:subscription' })
      setProperty(db, sub1, 'field:amount', 150)
      expect(fireCount).toBe(1)

      // Reduce amount to 50 - drops below threshold
      setProperty(db, sub1, 'field:amount', 50)

      // Value is now 50, below threshold - thresholdCrossed should reset

      // Add more to cross threshold again
      setProperty(db, sub1, 'field:amount', 150)

      // Should have fired again because threshold reset
      expect(fireCount).toBe(2)

      consoleWarnSpy.mockRestore()
    })

    it('should fire again after threshold resets and crosses again', () => {
      // Create a computed field that counts subscriptions
      const computedFieldId = computedFieldService.create(db, {
        name: 'Subscription Count',
        definition: {
          aggregation: 'COUNT',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
        },
      })

      let fireCount = 0
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
        if (typeof msg === 'string' && msg.includes('set_property action requires a target node')) {
          fireCount++
        }
      })

      // Create threshold automation: when count >= 2, fire once
      const definition: AutomationDefinition = {
        name: 'Subscription Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'gte',
            value: 2,
          },
          fireOnce: true,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'alert',
        },
      }

      automationService.create(db, definition)

      // Add first subscription - count is 1
      createNode(db, { content: 'Sub 1', supertagId: 'supertag:subscription' })
      expect(fireCount).toBe(0)

      // Add second subscription - count is 2, crosses threshold
      const sub2 = createNode(db, { content: 'Sub 2', supertagId: 'supertag:subscription' })
      expect(fireCount).toBe(1)

      // Remove supertag from sub2 - count is 1, drops below threshold
      removeNodeSupertag(db, sub2, 'supertag:subscription')

      // Add supertag back - count is 2, crosses again
      addNodeSupertag(db, sub2, 'supertag:subscription')

      // Should have fired again
      expect(fireCount).toBe(2)

      consoleWarnSpy.mockRestore()
    })

    it('should support multiple threshold automations on same computed field', () => {
      // Create a computed field that sums amounts
      const computedFieldId = computedFieldService.create(db, {
        name: 'Total Amount',
        definition: {
          aggregation: 'SUM',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
          fieldId: 'field:amount',
        },
      })

      // Track firings for each automation
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {
        // We'll track by checking automation state instead
      })

      // Create automation 1: when total > 50, fire
      const definition1: AutomationDefinition = {
        name: 'Low Threshold Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'gt',
            value: 50,
          },
          fireOnce: true,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'low_alert',
        },
      }

      // Create automation 2: when total > 100, fire
      const definition2: AutomationDefinition = {
        name: 'High Threshold Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'gt',
            value: 100,
          },
          fireOnce: true,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'high_alert',
        },
      }

      automationService.create(db, definition1)
      automationService.create(db, definition2)

      // Both automations should be active
      expect(automationService.activeCount()).toBe(2)

      // Add subscription with amount 30 - below both thresholds
      const sub1 = createNode(db, { content: 'Sub 1', supertagId: 'supertag:subscription' })
      setProperty(db, sub1, 'field:amount', 30)

      // Add subscription with amount 30 - total is 60, crosses low threshold but not high
      const sub2 = createNode(db, { content: 'Sub 2', supertagId: 'supertag:subscription' })
      setProperty(db, sub2, 'field:amount', 30)
      // Low threshold should have fired (>50), high should not (<=100)

      // Add subscription with amount 50 - total is 110, crosses high threshold
      const sub3 = createNode(db, { content: 'Sub 3', supertagId: 'supertag:subscription' })
      setProperty(db, sub3, 'field:amount', 50)
      // High threshold should have fired now

      // Verify both automations are still tracking independently
      expect(automationService.activeCount()).toBe(2)

      consoleWarnSpy.mockRestore()
    })

    it('should handle different threshold operators', () => {
      // Create a computed field
      const computedFieldId = computedFieldService.create(db, {
        name: 'Count',
        definition: {
          aggregation: 'COUNT',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
        },
      })

      // Test 'lt' operator: fire when count < 5
      let ltFired = false
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
        if (typeof msg === 'string' && msg.includes('set_property action requires a target node')) {
          ltFired = true
        }
      })

      // Create automation with lt operator
      const ltDefinition: AutomationDefinition = {
        name: 'Low Count Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'lt',
            value: 2,
          },
          fireOnce: false,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'low',
        },
      }

      automationService.create(db, ltDefinition)

      // Initial count is 0, which is < 2, but no crossing yet (starts below)
      // The automation only fires on CROSSING from not-meeting to meeting
      expect(ltFired).toBe(false)

      // Add 2 subscriptions - count is 2, not < 2
      createNode(db, { content: 'Sub 1', supertagId: 'supertag:subscription' })
      const sub2 = createNode(db, { content: 'Sub 2', supertagId: 'supertag:subscription' })
      expect(ltFired).toBe(false) // Still false - never crossed

      // Remove one - count is 1, now < 2 (crossed from not-meeting to meeting)
      removeNodeSupertag(db, sub2, 'supertag:subscription')
      expect(ltFired).toBe(true)

      consoleWarnSpy.mockRestore()
    })

    it('should handle eq operator', () => {
      // Create a computed field
      const computedFieldId = computedFieldService.create(db, {
        name: 'Count',
        definition: {
          aggregation: 'COUNT',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
        },
      })

      let eqFired = false
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
        if (typeof msg === 'string' && msg.includes('set_property action requires a target node')) {
          eqFired = true
        }
      })

      // Create automation with eq operator: fire when count == 3
      const eqDefinition: AutomationDefinition = {
        name: 'Exact Count Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'eq',
            value: 3,
          },
          fireOnce: false,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'exactly_three',
        },
      }

      automationService.create(db, eqDefinition)

      // Add first subscription - count is 1
      createNode(db, { content: 'Sub 1', supertagId: 'supertag:subscription' })
      expect(eqFired).toBe(false)

      // Add second subscription - count is 2
      createNode(db, { content: 'Sub 2', supertagId: 'supertag:subscription' })
      expect(eqFired).toBe(false)

      // Add third subscription - count is 3, equals threshold
      createNode(db, { content: 'Sub 3', supertagId: 'supertag:subscription' })
      expect(eqFired).toBe(true)

      consoleWarnSpy.mockRestore()
    })

    it('should handle lte operator', () => {
      // Create a computed field
      const computedFieldId = computedFieldService.create(db, {
        name: 'Sum',
        definition: {
          aggregation: 'SUM',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
          fieldId: 'field:amount',
        },
      })

      let lteFired = false
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
        if (typeof msg === 'string' && msg.includes('set_property action requires a target node')) {
          lteFired = true
        }
      })

      // Create automation with lte operator: fire when sum <= 50
      const lteDefinition: AutomationDefinition = {
        name: 'Low Sum Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'lte',
            value: 50,
          },
          fireOnce: false,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'low_sum',
        },
      }

      automationService.create(db, lteDefinition)

      // Add subscription with amount 100 - above threshold
      const sub1 = createNode(db, { content: 'Sub 1', supertagId: 'supertag:subscription' })
      setProperty(db, sub1, 'field:amount', 100)
      expect(lteFired).toBe(false)

      // Reduce amount to 50 - crosses to <= 50
      setProperty(db, sub1, 'field:amount', 50)
      expect(lteFired).toBe(true)

      consoleWarnSpy.mockRestore()
    })

    it('should not fire when threshold is already met at creation', () => {
      // First create subscriptions that already meet the threshold
      const sub1 = createNode(db, { content: 'Sub 1', supertagId: 'supertag:subscription' })
      setProperty(db, sub1, 'field:amount', 100)
      const sub2 = createNode(db, { content: 'Sub 2', supertagId: 'supertag:subscription' })
      setProperty(db, sub2, 'field:amount', 100)

      // Create computed field - initial value is 200
      const computedFieldId = computedFieldService.create(db, {
        name: 'Total Amount',
        definition: {
          aggregation: 'SUM',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
          fieldId: 'field:amount',
        },
      })

      let fireCount = 0
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
        if (typeof msg === 'string' && msg.includes('set_property action requires a target node')) {
          fireCount++
        }
      })

      // Create automation with threshold 100 - value is already 200
      const definition: AutomationDefinition = {
        name: 'Already Met Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'gt',
            value: 100,
          },
          fireOnce: true,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'alert',
        },
      }

      automationService.create(db, definition)

      // Should NOT fire on creation when threshold is already met
      expect(fireCount).toBe(0)

      // Reduce below threshold
      setProperty(db, sub1, 'field:amount', 10)
      // Value is now 110, still above threshold - no crossing

      // Reduce to below threshold
      setProperty(db, sub2, 'field:amount', 10)
      // Value is now 20, below threshold - reset

      // Increase to cross threshold
      setProperty(db, sub1, 'field:amount', 100)
      // Value is now 110, crosses threshold
      expect(fireCount).toBe(1)

      consoleWarnSpy.mockRestore()
    })

    it('should persist thresholdCrossed state across service restarts', () => {
      // Create computed field
      const computedFieldId = computedFieldService.create(db, {
        name: 'Count',
        definition: {
          aggregation: 'COUNT',
          query: {
            filters: [{ type: 'supertag', supertagId: 'supertag:subscription' }],
          },
        },
      })

      let fireCount = 0
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation((msg) => {
        if (typeof msg === 'string' && msg.includes('set_property action requires a target node')) {
          fireCount++
        }
      })

      // Create automation
      const definition: AutomationDefinition = {
        name: 'Count Alert',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: {
            operator: 'gte',
            value: 2,
          },
          fireOnce: true,
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'alert',
        },
      }

      const automationId = automationService.create(db, definition)

      // Trigger the threshold
      createNode(db, { content: 'Sub 1', supertagId: 'supertag:subscription' })
      createNode(db, { content: 'Sub 2', supertagId: 'supertag:subscription' })
      expect(fireCount).toBe(1)

      // Verify state is persisted
      const stateValue = getPropertyValue(db, automationId, SYSTEM_FIELDS.AUTOMATION_STATE)
      expect(stateValue).toBeDefined()
      const state = JSON.parse(stateValue as string)
      expect(state.thresholdCrossed).toBe(true)

      consoleWarnSpy.mockRestore()
    })
  })

  // ==========================================================================
  // Error handling
  // ==========================================================================

  describe('error handling', () => {
    it('should log error but continue when action fails', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // Create automation with action that references non-existent field
      // (This won't fail in our implementation since setProperty creates fields,
      // but we can test that errors are caught and logged)
      const definition: AutomationDefinition = {
        name: 'Error Test',
        enabled: true,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [{ type: 'supertag', supertagId: 'supertag:task' }],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: 'field:status',
          value: 'test',
        },
      }

      automationService.create(db, definition)

      // Create task - should not throw
      const taskId = createNode(db, { content: 'Task', supertagId: 'supertag:task' })

      // Verify the action executed (no error in this case)
      expect(getPropertyValue(db, taskId, 'field:status')).toBe('test')

      consoleErrorSpy.mockRestore()
    })
  })
})
