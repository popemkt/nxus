/**
 * subscription-tracker.test.ts - Acceptance test for Phase 2 reactive system
 *
 * This test validates the complete reactive system by implementing a real-world
 * subscription tracking scenario:
 *
 * Scenario: Track total monthly subscription cost and alert when it exceeds $100
 *
 * 1. Create computed field: SUM(subscription.monthlyPrice) for nodes with supertag:subscription
 * 2. Create threshold automation: when total > $100, call webhook
 * 3. Test that:
 *    - Computed field correctly sums all subscription prices
 *    - Threshold automation fires exactly once when crossing $100
 *    - Additional subscriptions don't trigger again (fireOnce)
 *    - Threshold resets when total drops below $100
 *    - Second crossing triggers webhook again
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
} from '../../services/node.service.js'
import { eventBus } from '../event-bus.js'
import { createQuerySubscriptionService } from '../query-subscription.service.js'
import { createComputedFieldService, type ComputedFieldService } from '../computed-field.service.js'
import { createAutomationService, type AutomationService } from '../automation.service.js'
import { createWebhookQueue, type WebhookQueue } from '../webhook-queue.js'
import type { AutomationDefinition, ComputedFieldDefinition } from '../types.js'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Mock fetch function that tracks all calls
 */
function createMockFetch() {
  const calls: Array<{ url: string; options: RequestInit }> = []
  const mockFetch = vi.fn(async (url: string, options?: RequestInit) => {
    calls.push({ url, options: options || {} })
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  })
  return { mockFetch, calls }
}

// ============================================================================
// Test Setup
// ============================================================================

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let computedFieldService: ComputedFieldService
let automationService: AutomationService
let webhookQueue: WebhookQueue
let mockFetch: ReturnType<typeof vi.fn>
let webhookCalls: Array<{ url: string; options: RequestInit }>

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
    { id: 'field-monthly-price', systemId: 'field:monthly_price', content: 'Monthly Price' },
    { id: 'field-subscription-name', systemId: 'field:subscription_name', content: 'Subscription Name' },
    // Automation fields
    { id: 'field-automation-definition', systemId: SYSTEM_FIELDS.AUTOMATION_DEFINITION, content: 'Automation Definition' },
    { id: 'field-automation-state', systemId: SYSTEM_FIELDS.AUTOMATION_STATE, content: 'Automation State' },
    { id: 'field-automation-last-fired', systemId: SYSTEM_FIELDS.AUTOMATION_LAST_FIRED, content: 'Automation Last Fired' },
    { id: 'field-automation-enabled', systemId: SYSTEM_FIELDS.AUTOMATION_ENABLED, content: 'Automation Enabled' },
    // Computed field nodes
    { id: 'field-computed-definition', systemId: SYSTEM_FIELDS.COMPUTED_FIELD_DEFINITION, content: 'Computed Field Definition' },
    { id: 'field-computed-value', systemId: SYSTEM_FIELDS.COMPUTED_FIELD_VALUE, content: 'Computed Field Value' },
    { id: 'field-computed-updated-at', systemId: SYSTEM_FIELDS.COMPUTED_FIELD_UPDATED_AT, content: 'Computed Field Updated At' },
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
    { id: 'supertag-subscription', systemId: 'supertag:subscription', content: '#Subscription' },
    { id: 'supertag-automation', systemId: SYSTEM_SUPERTAGS.AUTOMATION, content: '#Automation' },
    { id: 'supertag-computed-field', systemId: SYSTEM_SUPERTAGS.COMPUTED_FIELD, content: '#ComputedField' },
  ]

  for (const st of systemSupertags) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${st.id}', '${st.content}', '${st.content.toLowerCase()}', '${st.systemId}', ${now}, ${now})
    `)
  }
}

/**
 * Helper to create a subscription node with a monthly price
 */
function createSubscription(name: string, monthlyPrice: number): string {
  const nodeId = createNode(db, {
    content: name,
    supertagId: 'supertag:subscription',
  })
  setProperty(db, nodeId, 'field:monthly_price', monthlyPrice)
  setProperty(db, nodeId, 'field:subscription_name', name)
  return nodeId
}

/**
 * Helper to wait for webhook queue to process all pending jobs.
 * Since the automation service calls processQueue() async (fire-and-forget),
 * we need to wait for it to complete and then process any remaining jobs.
 */
async function processWebhooks(): Promise<void> {
  // Wait a tick for any in-flight processQueue calls to start
  await new Promise((resolve) => setTimeout(resolve, 0))

  // Keep processing until no more pending jobs
  let attempts = 0
  const maxAttempts = 10
  while (webhookQueue.pendingCount() > 0 && attempts < maxAttempts) {
    await webhookQueue.processQueue()
    // Wait a tick between attempts
    await new Promise((resolve) => setTimeout(resolve, 0))
    attempts++
  }
}

// ============================================================================
// Test Suite
// ============================================================================

describe('Subscription Tracker Integration Test (Phase 2 Acceptance)', () => {
  beforeEach(() => {
    setupTestDatabase()
    clearSystemNodeCache()
    seedSystemNodes()

    // Clear the global event bus and create services
    eventBus.clear()

    // Create fresh mock fetch
    const fetchMock = createMockFetch()
    mockFetch = fetchMock.mockFetch
    webhookCalls = fetchMock.calls

    // Create service chain with shared event bus
    const queryService = createQuerySubscriptionService(eventBus)
    computedFieldService = createComputedFieldService(queryService)
    webhookQueue = createWebhookQueue()
    webhookQueue.setFetch(mockFetch)
    automationService = createAutomationService(queryService, computedFieldService, webhookQueue)
  })

  afterEach(() => {
    automationService.clear()
    computedFieldService.clear()
    webhookQueue.clear()
    eventBus.clear()
    sqlite.close()
  })

  describe('Complete subscription tracking workflow', () => {
    it('should track subscription total and trigger webhook when exceeding $100', async () => {
      // Step 1: Create computed field for total monthly subscription cost
      const computedFieldDefinition: ComputedFieldDefinition = {
        aggregation: 'SUM',
        query: {
          filters: [
            { type: 'supertag', supertagId: 'supertag:subscription' },
          ],
        },
        fieldId: 'field:monthly_price',
      }

      const computedFieldId = computedFieldService.create(db, {
        name: 'Total Monthly Subscriptions',
        definition: computedFieldDefinition,
      })

      // Step 2: Create threshold automation - when total > 100, call webhook
      const automationDefinition: AutomationDefinition = {
        name: 'Alert on High Subscription Cost',
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
          type: 'webhook',
          url: 'https://api.example.com/alerts',
          method: 'POST',
          headers: {
            'Authorization': 'Bearer test-token',
          },
          body: {
            alert: 'Subscription cost exceeded $100',
            total: '{{ computedField.value }}',
            timestamp: '{{ timestamp }}',
          },
        },
      }

      automationService.create(db, automationDefinition)

      // Step 3: Add subscriptions totaling $95
      const netflix = createSubscription('Netflix', 15.99)
      const spotify = createSubscription('Spotify', 9.99)
      const youtube = createSubscription('YouTube Premium', 13.99)
      const github = createSubscription('GitHub Pro', 4.00)
      const aws = createSubscription('AWS', 51.03) // Total: $95

      // Wait for webhooks to process
      await processWebhooks()

      // Verify computed field value is ~$95
      const valueAt95 = computedFieldService.getValue(db, computedFieldId)
      expect(valueAt95).toBeCloseTo(95.00, 1)

      // Verify webhook NOT called yet
      expect(webhookCalls.length).toBe(0)

      // Step 4: Add subscription pushing total to > $100
      const dropbox = createSubscription('Dropbox', 11.99) // Total: ~$107

      // Wait for webhooks to process
      await processWebhooks()

      // Verify computed field value updated to ~$107
      const valueAt107 = computedFieldService.getValue(db, computedFieldId)
      expect(valueAt107).toBeCloseTo(106.99, 1)

      // Verify webhook called exactly once
      expect(webhookCalls.length).toBe(1)
      expect(webhookCalls[0].url).toBe('https://api.example.com/alerts')
      expect(webhookCalls[0].options.method).toBe('POST')

      // Verify webhook body contains computed field value
      const requestBody = JSON.parse(webhookCalls[0].options.body as string)
      expect(requestBody.alert).toBe('Subscription cost exceeded $100')
      expect(parseFloat(requestBody.total)).toBeCloseTo(106.99, 1)

      // Step 5: Add more subscriptions - should NOT trigger again (fireOnce)
      const slack = createSubscription('Slack', 12.50) // Total: ~$119.49

      // Wait for webhooks to process
      await processWebhooks()

      // Verify computed field updated
      const valueAt119 = computedFieldService.getValue(db, computedFieldId)
      expect(valueAt119).toBeCloseTo(119.49, 1)

      // Verify webhook NOT called again
      expect(webhookCalls.length).toBe(1)

      // Step 6: Remove subscriptions to drop below $100
      // Remove AWS ($51.03) and Dropbox ($11.99) = -$63.02
      // Total should be ~$56.47
      deleteNode(db, aws)
      deleteNode(db, dropbox)

      // Wait for webhooks to process
      await processWebhooks()

      // Verify computed field updated to ~$56.47
      const valueBelow100 = computedFieldService.getValue(db, computedFieldId)
      expect(valueBelow100).toBeCloseTo(56.47, 1)

      // Still only 1 webhook call
      expect(webhookCalls.length).toBe(1)

      // Step 7: Add subscription to cross threshold again
      createSubscription('Adobe Creative Cloud', 54.99) // Total: ~$111.46

      // Wait for webhooks to process
      await processWebhooks()

      // Verify computed field updated
      const valueSecondCrossing = computedFieldService.getValue(db, computedFieldId)
      expect(valueSecondCrossing).toBeCloseTo(111.46, 1)

      // Verify webhook called second time (threshold was reset)
      expect(webhookCalls.length).toBe(2)
      expect(webhookCalls[1].url).toBe('https://api.example.com/alerts')

      // Verify second webhook body contains updated value
      const secondRequestBody = JSON.parse(webhookCalls[1].options.body as string)
      expect(parseFloat(secondRequestBody.total)).toBeCloseTo(111.46, 1)
    })

    it('should handle subscription removal via supertag removal', async () => {
      // Create computed field
      const computedFieldDefinition: ComputedFieldDefinition = {
        aggregation: 'SUM',
        query: {
          filters: [
            { type: 'supertag', supertagId: 'supertag:subscription' },
          ],
        },
        fieldId: 'field:monthly_price',
      }

      const computedFieldId = computedFieldService.create(db, {
        name: 'Total Monthly Subscriptions',
        definition: computedFieldDefinition,
      })

      // Create threshold automation
      const automationDefinition: AutomationDefinition = {
        name: 'Alert on High Cost',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: { operator: 'gt', value: 50 },
          fireOnce: true,
        },
        action: {
          type: 'webhook',
          url: 'https://api.example.com/alerts',
          method: 'POST',
          body: { total: '{{ computedField.value }}' },
        },
      }

      automationService.create(db, automationDefinition)

      // Add subscriptions totaling $60
      const sub1 = createSubscription('Service A', 30)
      const sub2 = createSubscription('Service B', 30)

      await processWebhooks()

      // Verify webhook called (60 > 50)
      expect(webhookCalls.length).toBe(1)

      // Remove supertag from sub1 (no longer counts as subscription)
      removeNodeSupertag(db, sub1, 'supertag:subscription')

      await processWebhooks()

      // Verify value dropped to $30
      const valueAfterRemoval = computedFieldService.getValue(db, computedFieldId)
      expect(valueAfterRemoval).toBe(30)

      // Re-add supertag (should cross threshold again)
      addNodeSupertag(db, sub1, 'supertag:subscription')

      await processWebhooks()

      // Verify webhook called second time (threshold reset and crossed again)
      expect(webhookCalls.length).toBe(2)
    })

    it('should handle price changes on existing subscriptions', async () => {
      // Create computed field
      const computedFieldDefinition: ComputedFieldDefinition = {
        aggregation: 'SUM',
        query: {
          filters: [
            { type: 'supertag', supertagId: 'supertag:subscription' },
          ],
        },
        fieldId: 'field:monthly_price',
      }

      const computedFieldId = computedFieldService.create(db, {
        name: 'Total Monthly Subscriptions',
        definition: computedFieldDefinition,
      })

      // Create threshold automation
      const automationDefinition: AutomationDefinition = {
        name: 'Alert on High Cost',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: { operator: 'gt', value: 100 },
          fireOnce: true,
        },
        action: {
          type: 'webhook',
          url: 'https://api.example.com/alerts',
          method: 'POST',
          body: { total: '{{ computedField.value }}' },
        },
      }

      automationService.create(db, automationDefinition)

      // Add subscription at $50
      const sub1 = createSubscription('Enterprise Plan', 50)

      await processWebhooks()

      // Verify no webhook yet
      expect(webhookCalls.length).toBe(0)
      expect(computedFieldService.getValue(db, computedFieldId)).toBe(50)

      // Update price to $150 (crosses threshold)
      setProperty(db, sub1, 'field:monthly_price', 150)

      await processWebhooks()

      // Verify webhook called
      expect(webhookCalls.length).toBe(1)
      expect(computedFieldService.getValue(db, computedFieldId)).toBe(150)

      // Lower price back to $90 (below threshold)
      setProperty(db, sub1, 'field:monthly_price', 90)

      await processWebhooks()

      // Verify value updated, no new webhook
      expect(computedFieldService.getValue(db, computedFieldId)).toBe(90)
      expect(webhookCalls.length).toBe(1)

      // Raise price again to $110 (crosses threshold again)
      setProperty(db, sub1, 'field:monthly_price', 110)

      await processWebhooks()

      // Verify webhook called second time
      expect(webhookCalls.length).toBe(2)
    })

    it('should correctly calculate COUNT aggregation for subscription tracking', async () => {
      // Create computed field for counting subscriptions
      const computedFieldDefinition: ComputedFieldDefinition = {
        aggregation: 'COUNT',
        query: {
          filters: [
            { type: 'supertag', supertagId: 'supertag:subscription' },
          ],
        },
      }

      const computedFieldId = computedFieldService.create(db, {
        name: 'Subscription Count',
        definition: computedFieldDefinition,
      })

      // Create threshold automation - alert when count exceeds 5
      const automationDefinition: AutomationDefinition = {
        name: 'Alert on Too Many Subscriptions',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: { operator: 'gt', value: 5 },
          fireOnce: true,
        },
        action: {
          type: 'webhook',
          url: 'https://api.example.com/alerts',
          method: 'POST',
          body: { count: '{{ computedField.value }}' },
        },
      }

      automationService.create(db, automationDefinition)

      // Add 5 subscriptions (at threshold, not over)
      for (let i = 1; i <= 5; i++) {
        createSubscription(`Service ${i}`, i * 10)
      }

      await processWebhooks()

      // Verify count is 5, no webhook
      expect(computedFieldService.getValue(db, computedFieldId)).toBe(5)
      expect(webhookCalls.length).toBe(0)

      // Add 6th subscription (exceeds threshold)
      createSubscription('Service 6', 60)

      await processWebhooks()

      // Verify webhook called
      expect(computedFieldService.getValue(db, computedFieldId)).toBe(6)
      expect(webhookCalls.length).toBe(1)

      const requestBody = JSON.parse(webhookCalls[0].options.body as string)
      expect(requestBody.count).toBe('6')
    })

    it('should correctly calculate AVG aggregation', async () => {
      // Create computed field for average price
      const computedFieldDefinition: ComputedFieldDefinition = {
        aggregation: 'AVG',
        query: {
          filters: [
            { type: 'supertag', supertagId: 'supertag:subscription' },
          ],
        },
        fieldId: 'field:monthly_price',
      }

      const computedFieldId = computedFieldService.create(db, {
        name: 'Average Subscription Price',
        definition: computedFieldDefinition,
      })

      // Create threshold automation - alert when avg exceeds $20
      const automationDefinition: AutomationDefinition = {
        name: 'Alert on High Average Price',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: { operator: 'gt', value: 20 },
          fireOnce: true,
        },
        action: {
          type: 'webhook',
          url: 'https://api.example.com/alerts',
          method: 'POST',
          body: { avgPrice: '{{ computedField.value }}' },
        },
      }

      automationService.create(db, automationDefinition)

      // Add subscriptions with avg = $15 (below threshold)
      createSubscription('Cheap', 10)
      createSubscription('Medium', 20)

      await processWebhooks()

      // Verify avg is 15, no webhook
      expect(computedFieldService.getValue(db, computedFieldId)).toBe(15)
      expect(webhookCalls.length).toBe(0)

      // Add expensive subscription pushing avg above threshold
      // New avg = (10 + 20 + 50) / 3 = 26.67
      createSubscription('Expensive', 50)

      await processWebhooks()

      // Verify webhook called
      expect(computedFieldService.getValue(db, computedFieldId)).toBeCloseTo(26.67, 1)
      expect(webhookCalls.length).toBe(1)
    })

    it('should support multiple threshold automations on same computed field', async () => {
      // Create computed field
      const computedFieldDefinition: ComputedFieldDefinition = {
        aggregation: 'SUM',
        query: {
          filters: [
            { type: 'supertag', supertagId: 'supertag:subscription' },
          ],
        },
        fieldId: 'field:monthly_price',
      }

      const computedFieldId = computedFieldService.create(db, {
        name: 'Total Monthly Subscriptions',
        definition: computedFieldDefinition,
      })

      // Create two threshold automations at different levels
      const automation50: AutomationDefinition = {
        name: 'Alert at $50',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: { operator: 'gt', value: 50 },
          fireOnce: true,
        },
        action: {
          type: 'webhook',
          url: 'https://api.example.com/alerts/50',
          method: 'POST',
          body: { level: '50' },
        },
      }

      const automation100: AutomationDefinition = {
        name: 'Alert at $100',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: { operator: 'gt', value: 100 },
          fireOnce: true,
        },
        action: {
          type: 'webhook',
          url: 'https://api.example.com/alerts/100',
          method: 'POST',
          body: { level: '100' },
        },
      }

      automationService.create(db, automation50)
      automationService.create(db, automation100)

      // Add subscription at $60 (crosses $50 threshold)
      createSubscription('Service A', 60)

      await processWebhooks()

      // Only $50 automation should fire
      expect(webhookCalls.length).toBe(1)
      expect(webhookCalls[0].url).toBe('https://api.example.com/alerts/50')

      // Add another subscription to cross $100 threshold
      createSubscription('Service B', 50) // Total: $110

      await processWebhooks()

      // $100 automation should also fire
      expect(webhookCalls.length).toBe(2)
      expect(webhookCalls[1].url).toBe('https://api.example.com/alerts/100')
    })

    it('should work with fireOnce: false (fire on every update above threshold)', async () => {
      // Create computed field
      const computedFieldDefinition: ComputedFieldDefinition = {
        aggregation: 'SUM',
        query: {
          filters: [
            { type: 'supertag', supertagId: 'supertag:subscription' },
          ],
        },
        fieldId: 'field:monthly_price',
      }

      const computedFieldId = computedFieldService.create(db, {
        name: 'Total Monthly Subscriptions',
        definition: computedFieldDefinition,
      })

      // Create threshold automation with fireOnce: false
      const automationDefinition: AutomationDefinition = {
        name: 'Alert on High Cost (Repeat)',
        enabled: true,
        trigger: {
          type: 'threshold',
          computedFieldId,
          condition: { operator: 'gt', value: 50 },
          fireOnce: false, // Fire on every crossing, not continuously
        },
        action: {
          type: 'webhook',
          url: 'https://api.example.com/alerts',
          method: 'POST',
          body: { total: '{{ computedField.value }}' },
        },
      }

      automationService.create(db, automationDefinition)

      // Add subscription crossing threshold ($60 > $50)
      const sub1 = createSubscription('Service A', 60)

      await processWebhooks()

      // First crossing - webhook called
      expect(webhookCalls.length).toBe(1)

      // Add another subscription while already above threshold
      // This shouldn't trigger because it's not a "crossing" - we're already above
      createSubscription('Service B', 20) // Total: $80

      await processWebhooks()

      // No new webhook - we didn't cross, just stayed above
      expect(webhookCalls.length).toBe(1)

      // Drop below threshold
      deleteNode(db, sub1) // Total: $20

      await processWebhooks()

      // Still 1 call - dropping below doesn't trigger
      expect(webhookCalls.length).toBe(1)

      // Cross threshold again
      createSubscription('Service C', 40) // Total: $60

      await processWebhooks()

      // Second crossing - webhook called again
      expect(webhookCalls.length).toBe(2)
    })
  })
})
