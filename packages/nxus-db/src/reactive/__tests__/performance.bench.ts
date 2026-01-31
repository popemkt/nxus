/**
 * performance.bench.ts - Performance benchmarks for the reactive query system
 *
 * These benchmarks validate the performance characteristics of the reactive system:
 *
 * 1. 50 subscriptions + 10k nodes: measure mutation latency (Phase 1 target: <100ms)
 * 2. 100 subscriptions + 50k nodes: measure with smart invalidation (Phase 3 target: <50ms)
 * 3. Rapid mutations (100 in 50ms): verify batching reduces evaluations
 *
 * Run with: pnpm --filter @nxus/db bench
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { bench, describe, beforeAll, afterAll } from 'vitest'
import * as schema from '../../schemas/item-schema.js'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '../../schemas/node-schema.js'
import {
  clearSystemNodeCache,
  createNode,
  setProperty,
} from '../../services/node.service.js'
import type { QueryDefinition } from '../../types/query.js'
import { createEventBus, type EventBus } from '../event-bus.js'
import {
  createQuerySubscriptionService,
  type QuerySubscriptionService,
} from '../query-subscription.service.js'
import { createReactiveMetrics, type ReactiveMetrics } from '../metrics.js'

// ============================================================================
// Test Helpers
// ============================================================================

interface BenchContext {
  sqlite: Database.Database
  db: BetterSQLite3Database<typeof schema>
  service: QuerySubscriptionService
  eventBus: EventBus
  metrics: ReactiveMetrics
  nodeIds: string[]
}

function setupTestDatabase(): { sqlite: Database.Database; db: BetterSQLite3Database<typeof schema> } {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })

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

  return { sqlite, db }
}

function seedSystemNodes(sqlite: Database.Database) {
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
    { id: 'field-score', systemId: 'field:score', content: 'Score' },
    { id: 'field-active', systemId: 'field:active', content: 'Active' },
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
    { id: 'supertag-contact', systemId: 'supertag:contact', content: '#Contact' },
    { id: 'supertag-note', systemId: 'supertag:note', content: '#Note' },
    { id: 'supertag-event', systemId: 'supertag:event', content: '#Event' },
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

/**
 * Create diverse subscriptions for benchmarking
 * Uses a variety of query types to simulate real-world usage
 */
function createDiverseSubscriptions(service: QuerySubscriptionService, db: BetterSQLite3Database<typeof schema>, count: number): void {
  const supertags = ['supertag:task', 'supertag:project', 'supertag:contact', 'supertag:note']
  const statuses = ['pending', 'active', 'completed', 'archived']
  const priorities = ['low', 'medium', 'high', 'critical']

  for (let i = 0; i < count; i++) {
    const queryType = i % 5 // Cycle through 5 different query patterns

    let queryDefinition: QueryDefinition

    switch (queryType) {
      case 0:
        // Simple supertag filter
        queryDefinition = {
          filters: [
            { type: 'supertag', supertagId: supertags[i % supertags.length] },
          ],
        }
        break

      case 1:
        // Supertag + property filter
        queryDefinition = {
          filters: [
            { type: 'supertag', supertagId: supertags[i % supertags.length] },
            { type: 'property', fieldId: 'field:status', op: 'eq', value: statuses[i % statuses.length] },
          ],
        }
        break

      case 2:
        // Property filter only (different field)
        queryDefinition = {
          filters: [
            { type: 'property', fieldId: 'field:priority', op: 'eq', value: priorities[i % priorities.length] },
          ],
        }
        break

      case 3:
        // OR filter
        queryDefinition = {
          filters: [
            {
              type: 'or',
              filters: [
                { type: 'supertag', supertagId: supertags[i % supertags.length] },
                { type: 'property', fieldId: 'field:active', op: 'eq', value: true },
              ],
            },
          ],
        }
        break

      case 4:
      default:
        // AND filter with multiple conditions
        queryDefinition = {
          filters: [
            {
              type: 'and',
              filters: [
                { type: 'supertag', supertagId: supertags[i % supertags.length] },
                { type: 'property', fieldId: 'field:status', op: 'eq', value: statuses[i % statuses.length] },
              ],
            },
          ],
        }
        break
    }

    service.subscribe(db, queryDefinition, () => {
      // Empty callback - we're just measuring re-evaluation time
    })
  }
}

/**
 * Create a full benchmark context with database, nodes, and subscriptions
 */
function createBenchContext(nodeCount: number, subscriptionCount: number): BenchContext {
  clearSystemNodeCache()

  const { sqlite, db } = setupTestDatabase()
  seedSystemNodes(sqlite)

  const eventBus = createEventBus()
  const metrics = createReactiveMetrics()
  const service = createQuerySubscriptionService(eventBus)
  service.setDebounceMs(0)

  // Create nodes with various supertags
  const supertags = ['supertag:task', 'supertag:project', 'supertag:contact', 'supertag:note']
  const nodeIds: string[] = []
  for (let i = 0; i < nodeCount; i++) {
    const nodeId = createNode(db, {
      content: `Node ${i}`,
      supertagId: supertags[i % supertags.length],
    })
    nodeIds.push(nodeId)
    // Set some properties to make queries more realistic
    if (i % 3 === 0) {
      setProperty(db, nodeId, 'field:status', 'active')
    }
    if (i % 5 === 0) {
      setProperty(db, nodeId, 'field:priority', 'high')
    }
  }

  // Reset metrics after data setup
  metrics.resetMetrics()
  eventBus.clear()

  // Create diverse subscriptions
  createDiverseSubscriptions(service, db, subscriptionCount)

  return { sqlite, db, service, eventBus, metrics, nodeIds }
}

function cleanupContext(ctx: BenchContext) {
  ctx.service.clear()
  ctx.eventBus.clear()
  ctx.sqlite.close()
}

// ============================================================================
// Benchmark Suite: 50 subscriptions + 10k nodes (Phase 1 target)
// ============================================================================

describe('Performance: 50 subscriptions + 10k nodes', () => {
  let ctx: BenchContext

  beforeAll(() => {
    ctx = createBenchContext(10000, 50)
  })

  afterAll(() => {
    cleanupContext(ctx)
  })

  bench('mutation latency - brute force (Phase 1)', () => {
    // Disable smart invalidation (Phase 1 brute force)
    ctx.service.setSmartInvalidation(false)

    // Pick a random node and mutate it
    const randomIndex = Math.floor(Math.random() * ctx.nodeIds.length)
    const nodeId = ctx.nodeIds[randomIndex]

    // Perform a mutation that affects subscriptions
    setProperty(ctx.db, nodeId, 'field:status', 'completed')
  })

  bench('mutation latency - smart invalidation (Phase 3)', () => {
    // Enable smart invalidation (Phase 3)
    ctx.service.setSmartInvalidation(true)

    // Pick a random node and mutate it
    const randomIndex = Math.floor(Math.random() * ctx.nodeIds.length)
    const nodeId = ctx.nodeIds[randomIndex]

    // Perform a mutation that affects subscriptions
    setProperty(ctx.db, nodeId, 'field:status', 'completed')
  })
})

// ============================================================================
// Benchmark Suite: 100 subscriptions + 50k nodes (Phase 3 target)
// ============================================================================

describe('Performance: 100 subscriptions + 50k nodes', () => {
  let ctx: BenchContext

  beforeAll(() => {
    ctx = createBenchContext(50000, 100)
  })

  afterAll(() => {
    cleanupContext(ctx)
  })

  bench('mutation latency - smart invalidation', () => {
    // Enable smart invalidation (Phase 3)
    ctx.service.setSmartInvalidation(true)

    // Pick a random node and mutate it
    const randomIndex = Math.floor(Math.random() * ctx.nodeIds.length)
    const nodeId = ctx.nodeIds[randomIndex]

    // Perform a mutation that affects subscriptions
    setProperty(ctx.db, nodeId, 'field:status', 'completed')
  })

  bench('mutation latency - brute force (comparison)', () => {
    // Disable smart invalidation for comparison
    ctx.service.setSmartInvalidation(false)

    // Pick a random node and mutate it
    const randomIndex = Math.floor(Math.random() * ctx.nodeIds.length)
    const nodeId = ctx.nodeIds[randomIndex]

    // Perform a mutation that affects subscriptions
    setProperty(ctx.db, nodeId, 'field:status', 'completed')
  })
})

// ============================================================================
// Benchmark Suite: Rapid mutations with batching
// ============================================================================

describe('Performance: Rapid mutations with batching', () => {
  let ctx: BenchContext

  beforeAll(() => {
    ctx = createBenchContext(5000, 30)
  })

  afterAll(() => {
    cleanupContext(ctx)
  })

  bench('100 rapid mutations - no batching', () => {
    // No debouncing - each mutation triggers immediate evaluation
    ctx.service.setDebounceMs(0)
    ctx.service.setSmartInvalidation(true)

    // Perform 100 rapid mutations
    for (let i = 0; i < 100; i++) {
      const nodeId = ctx.nodeIds[i % ctx.nodeIds.length]
      setProperty(ctx.db, nodeId, 'field:count', i)
    }
  })

  bench('100 rapid mutations - with 10ms batching', async () => {
    // Enable 10ms debounce window
    ctx.service.setDebounceMs(10)
    ctx.service.setSmartInvalidation(true)

    // Perform 100 rapid mutations
    for (let i = 0; i < 100; i++) {
      const nodeId = ctx.nodeIds[i % ctx.nodeIds.length]
      setProperty(ctx.db, nodeId, 'field:score', i)
    }

    // Flush pending mutations
    ctx.service.flushPendingMutations()
  })
})
