/**
 * membership-narrowing-integration.test.ts - Integration edge cases for
 * membership-narrowing (commit 716b9a9), extending
 * membership-narrowing.test.ts (which exercises the DependencyTracker in
 * isolation with hand-built MutationEvent fixtures) without editing it.
 *
 * These tests go through the REAL write path — node.service's createNode/
 * deleteNode/restoreNode emitting onto the real eventBus singleton — wired
 * into an actual QuerySubscriptionService instance, same setup pattern as
 * query-subscription.test.ts. The goal is to prove the enrichment
 * (ancestor-expanded supertagIds on node:created/deleted) that
 * dependency-tracker.ts consumes is actually produced correctly by
 * node.service.ts in a live extends chain, not just asserted against
 * fixtures.
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
  restoreNode,
  setProperty,
} from '../../services/node.service.js'
import type { QueryDefinition } from '../../types/query.js'
import { eventBus } from '../event-bus.js'
import { createQuerySubscriptionService, type QuerySubscriptionService } from '../query-subscription.service.js'
import type { QueryResultChangeEvent } from '../types.js'
import type { MutationEvent } from '../types.js'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>
let service: QuerySubscriptionService

function setupTestDatabase(): BetterSQLite3Database<typeof schema> {
  sqlite = new Database(':memory:')
  db = drizzle(sqlite, { schema })

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
    );
    CREATE INDEX IF NOT EXISTS idx_nodes_system_id ON nodes(system_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_owner_id ON nodes(owner_id);
    CREATE INDEX IF NOT EXISTS idx_nodes_content_plain ON nodes(content_plain);
    CREATE TABLE IF NOT EXISTS node_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL,
      field_node_id TEXT NOT NULL,
      value TEXT,
      "order" INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_node_properties_node ON node_properties(node_id);
    CREATE INDEX IF NOT EXISTS idx_node_properties_field ON node_properties(field_node_id);
    CREATE INDEX IF NOT EXISTS idx_node_properties_value ON node_properties(value);
  `)

  return db
}

function seedSystemNodes() {
  const now = Date.now()
  const systemFields = [
    { id: 'field-supertag', systemId: SYSTEM_FIELDS.SUPERTAG, content: 'supertag' },
    { id: 'field-extends', systemId: SYSTEM_FIELDS.EXTENDS, content: 'extends' },
  ]
  for (const field of systemFields) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${field.id}', '${field.content}', '${field.content.toLowerCase()}', '${field.systemId}', ${now}, ${now})
    `)
  }
  sqlite.exec(`
    INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
    VALUES ('supertag-tag', '#Tag', '#tag', '${SYSTEM_SUPERTAGS.TAG}', ${now}, ${now})
  `)
}

describe('membership narrowing — through the real write path (QuerySubscriptionService)', () => {
  beforeEach(() => {
    setupTestDatabase()
    clearSystemNodeCache()
    seedSystemNodes()
    eventBus.clear()
    service = createQuerySubscriptionService(eventBus)
  })

  afterEach(() => {
    service.clear()
    eventBus.clear()
    sqlite.close()
    clearSystemNodeCache()
  })

  it('createNode(tagged X) invalidates the X and content subscriptions but not the Y subscription', () => {
    const tagX = createNode(db, { content: '#TagX', supertagId: SYSTEM_SUPERTAGS.TAG })
    const tagY = createNode(db, { content: '#TagY', supertagId: SYSTEM_SUPERTAGS.TAG })

    const xQuery: QueryDefinition = {
      filters: [{ type: 'supertag', supertagId: tagX, includeInherited: true }],
      limit: 500,
    }
    const yQuery: QueryDefinition = {
      filters: [{ type: 'supertag', supertagId: tagY, includeInherited: true }],
      limit: 500,
    }
    const contentQuery: QueryDefinition = {
      filters: [{ type: 'content', query: 'hello', caseSensitive: false }],
      limit: 500,
    }

    const xCallback = vi.fn()
    const yCallback = vi.fn()
    const contentCallback = vi.fn()
    service.subscribe(db, xQuery, xCallback)
    service.subscribe(db, yQuery, yCallback)
    service.subscribe(db, contentQuery, contentCallback)

    const newNodeId = createNode(db, { content: 'hello from X', supertagId: tagX })

    expect(xCallback).toHaveBeenCalledTimes(1)
    const xEvent = xCallback.mock.calls[0][0] as QueryResultChangeEvent
    expect(xEvent.added.map((n) => n.id)).toEqual([newNodeId])

    expect(contentCallback).toHaveBeenCalledTimes(1)
    const contentEvent = contentCallback.mock.calls[0][0] as QueryResultChangeEvent
    expect(contentEvent.added.map((n) => n.id)).toEqual([newNodeId])

    expect(yCallback).not.toHaveBeenCalled()
  })

  it('deleteNode(tagged X) narrows identically: X and content subscriptions fire, Y does not', () => {
    const tagX = createNode(db, { content: '#TagX', supertagId: SYSTEM_SUPERTAGS.TAG })
    const tagY = createNode(db, { content: '#TagY', supertagId: SYSTEM_SUPERTAGS.TAG })
    const nodeId = createNode(db, { content: 'hello from X', supertagId: tagX })

    const xQuery: QueryDefinition = {
      filters: [{ type: 'supertag', supertagId: tagX, includeInherited: true }],
      limit: 500,
    }
    const yQuery: QueryDefinition = {
      filters: [{ type: 'supertag', supertagId: tagY, includeInherited: true }],
      limit: 500,
    }
    const contentQuery: QueryDefinition = {
      filters: [{ type: 'content', query: 'hello', caseSensitive: false }],
      limit: 500,
    }

    const xCallback = vi.fn()
    const yCallback = vi.fn()
    const contentCallback = vi.fn()
    const xHandle = service.subscribe(db, xQuery, xCallback)
    service.subscribe(db, yQuery, yCallback)
    service.subscribe(db, contentQuery, contentCallback)

    expect(xHandle.getLastResults().map((n) => n.id)).toEqual([nodeId])

    deleteNode(db, nodeId)

    expect(xCallback).toHaveBeenCalledTimes(1)
    const xEvent = xCallback.mock.calls[0][0] as QueryResultChangeEvent
    expect(xEvent.removed.map((n) => n.id)).toEqual([nodeId])

    expect(contentCallback).toHaveBeenCalledTimes(1)
    const contentEvent = contentCallback.mock.calls[0][0] as QueryResultChangeEvent
    expect(contentEvent.removed.map((n) => n.id)).toEqual([nodeId])

    expect(yCallback).not.toHaveBeenCalled()
  })
})

describe('membership narrowing — ancestor expansion through a REAL extends chain (raw eventBus capture)', () => {
  beforeEach(() => {
    setupTestDatabase()
    clearSystemNodeCache()
    seedSystemNodes()
    eventBus.clear()
  })

  afterEach(() => {
    eventBus.clear()
    sqlite.close()
    clearSystemNodeCache()
  })

  it('creating a node tagged #Child (which extends #Parent) emits node:created carrying BOTH the child and parent UUIDs', () => {
    const parentId = createNode(db, { content: '#Parent', supertagId: SYSTEM_SUPERTAGS.TAG })
    const childId = createNode(db, { content: '#Child', supertagId: SYSTEM_SUPERTAGS.TAG })
    setProperty(db, childId, SYSTEM_FIELDS.EXTENDS, parentId)

    const captured: MutationEvent[] = []
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === 'node:created') captured.push(event)
    })

    let taggedNodeId: string
    try {
      taggedNodeId = createNode(db, { content: 'An instance of Child', supertagId: childId })
    } finally {
      unsubscribe()
    }

    expect(captured).toHaveLength(1)
    const event = captured[0]
    expect(event.nodeId).toBe(taggedNodeId)
    expect(event.supertagIds).toBeDefined()
    expect(event.supertagIds).toContain(childId)
    expect(event.supertagIds).toContain(parentId)
  })

  it('restoreNode emits node:created carrying the ancestor-expanded supertagIds of the restored node', () => {
    const parentId = createNode(db, { content: '#Parent', supertagId: SYSTEM_SUPERTAGS.TAG })
    const childId = createNode(db, { content: '#Child', supertagId: SYSTEM_SUPERTAGS.TAG })
    setProperty(db, childId, SYSTEM_FIELDS.EXTENDS, parentId)

    const taggedNodeId = createNode(db, { content: 'An instance of Child', supertagId: childId })
    deleteNode(db, taggedNodeId)

    const captured: MutationEvent[] = []
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === 'node:created' && event.nodeId === taggedNodeId) captured.push(event)
    })

    try {
      restoreNode(db, taggedNodeId)
    } finally {
      unsubscribe()
    }

    expect(captured).toHaveLength(1)
    const restoreEvent = captured[0]
    expect(restoreEvent.supertagIds).toBeDefined()
    expect(restoreEvent.supertagIds).toContain(childId)
    expect(restoreEvent.supertagIds).toContain(parentId)
  })

  it('node:deleted also carries the ancestor-expanded supertagIds (captured pre-delete, per node.service.ts comment)', () => {
    const parentId = createNode(db, { content: '#Parent', supertagId: SYSTEM_SUPERTAGS.TAG })
    const childId = createNode(db, { content: '#Child', supertagId: SYSTEM_SUPERTAGS.TAG })
    setProperty(db, childId, SYSTEM_FIELDS.EXTENDS, parentId)
    const taggedNodeId = createNode(db, { content: 'An instance of Child', supertagId: childId })

    const captured: MutationEvent[] = []
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === 'node:deleted') captured.push(event)
    })

    try {
      deleteNode(db, taggedNodeId)
    } finally {
      unsubscribe()
    }

    expect(captured).toHaveLength(1)
    expect(captured[0].supertagIds).toContain(childId)
    expect(captured[0].supertagIds).toContain(parentId)
  })

  it('addNodeSupertag on an already-live node emits supertag:added (sanity check that the helper used elsewhere in this file works against a real extends chain)', () => {
    // addNodeSupertag resolves its second arg via getSystemNode (systemId
    // only, unlike createNode's supertagId which also accepts a raw UUID) —
    // give the parent a real systemId so this call is valid.
    const parentSystemId = 'supertag:test-parent'
    createNode(db, { content: '#Parent', systemId: parentSystemId, supertagId: SYSTEM_SUPERTAGS.TAG })
    const nodeId = createNode(db, { content: 'Plain node' })

    const captured: MutationEvent[] = []
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === 'supertag:added') captured.push(event)
    })

    let added: boolean
    try {
      added = addNodeSupertag(db, nodeId, parentSystemId)
    } finally {
      unsubscribe()
    }

    expect(added).toBe(true)
    expect(captured).toHaveLength(1)
  })
})
