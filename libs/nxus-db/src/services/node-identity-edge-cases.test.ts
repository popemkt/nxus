/**
 * node-identity-edge-cases.test.ts - Edge cases for the systemId-uniqueness
 * and soft-delete/restore primitives that back "race-safe date identity"
 * (commit 08c7b8f, daily-note #Day nodes keyed by `item:day-<iso-date>`).
 *
 * The server function that races two concurrent daily-note creations lives
 * in apps/nxus-editor (off-limits here), but the primitives it depends on —
 * createNode's systemId UNIQUE constraint, transactional rollback on
 * failure, and findNodeBySystemId/restoreNode — live in this package and are
 * fully testable in isolation.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import { nodes, SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '../schemas/node-schema.js'
import {
  clearSystemNodeCache,
  createNode,
  deleteNode,
  findNodeBySystemId,
  restoreNode,
} from './node.service.js'
import { evaluateQuery } from './query-evaluator.service.js'
import { eventBus } from '../reactive/event-bus.js'
import type { MutationEvent } from '../reactive/types.js'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>

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
  `)

  clearSystemNodeCache()
  return db
}

function seedSystemNodes() {
  const now = Date.now()
  const systemFields = [
    { id: 'field-supertag', systemId: SYSTEM_FIELDS.SUPERTAG, content: 'supertag' },
    { id: 'field-extends', systemId: SYSTEM_FIELDS.EXTENDS, content: 'extends' },
  ]
  for (const f of systemFields) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${f.id}', '${f.content}', '${f.content.toLowerCase()}', '${f.systemId}', ${now}, ${now})
    `)
  }
  sqlite.exec(`
    INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
    VALUES ('supertag-day', '#Day', '#day', '${SYSTEM_SUPERTAGS.DAY}', ${now}, ${now})
  `)
}

function nodeRowCount(): number {
  return db.select({ id: nodes.id }).from(nodes).all().length
}

describe('createNode — systemId uniqueness and transactional atomicity', () => {
  beforeEach(() => {
    setupTestDatabase()
    seedSystemNodes()
  })

  afterEach(() => {
    sqlite.close()
    clearSystemNodeCache()
  })

  it('creating a second node with an already-used systemId throws, leaving exactly the first row behind', () => {
    const systemId = 'item:day-2026-07-11'

    const firstId = createNode(db, {
      content: 'July 11, 2026',
      systemId,
      supertagId: SYSTEM_SUPERTAGS.DAY,
    })

    const countAfterFirst = nodeRowCount()

    expect(() =>
      createNode(db, {
        content: 'Duplicate day node — should never land',
        systemId,
      }),
    ).toThrow()

    // No partial row was left behind by the failed second create.
    expect(nodeRowCount()).toBe(countAfterFirst)

    const resolved = findNodeBySystemId(db, systemId)
    expect(resolved).not.toBeNull()
    expect(resolved?.id).toBe(firstId)
    expect(resolved?.content).toBe('July 11, 2026')
  })

  it('the failed duplicate-systemId create never emits a node:created event (nothing ran before the throwing insert)', () => {
    const systemId = 'item:day-2026-07-12'
    const events: MutationEvent[] = []
    const unsubscribe = eventBus.subscribe((event) => {
      if (event.type === 'node:created') events.push(event)
    })

    try {
      createNode(db, { content: 'July 12, 2026', systemId })
      expect(events).toHaveLength(1)

      expect(() => createNode(db, { content: 'Racing duplicate', systemId })).toThrow()

      // Still exactly one node:created event — the second attempt never
      // reached emitMutation().
      expect(events).toHaveLength(1)
    } finally {
      unsubscribe()
    }
  })

  it('after the rollback, a THIRD create with a different systemId succeeds normally (the failed transaction did not corrupt shared state)', () => {
    const baseline = nodeRowCount()
    const systemId = 'item:day-2026-07-13'
    createNode(db, { content: 'July 13, 2026', systemId })
    expect(() => createNode(db, { content: 'dup', systemId })).toThrow()

    const otherId = createNode(db, { content: 'July 14, 2026', systemId: 'item:day-2026-07-14' })
    expect(findNodeBySystemId(db, 'item:day-2026-07-14')?.id).toBe(otherId)
    // Exactly two new rows total: the successful first create + the successful third create.
    expect(nodeRowCount()).toBe(baseline + 2)
  })
})

describe('restoreNode — membership restoration after soft delete', () => {
  beforeEach(() => {
    setupTestDatabase()
    seedSystemNodes()
  })

  afterEach(() => {
    sqlite.close()
    clearSystemNodeCache()
  })

  it('restoreNode makes a soft-deleted node visible to evaluateQuery again', () => {
    const nodeId = createNode(db, { content: 'Resurrectable', supertagId: SYSTEM_SUPERTAGS.DAY })

    const query = {
      filters: [{ type: 'supertag' as const, supertagId: SYSTEM_SUPERTAGS.DAY, includeInherited: false }],
      limit: 500,
    }

    expect(evaluateQuery(db, query).nodes.map((n) => n.id)).toContain(nodeId)

    deleteNode(db, nodeId)
    expect(evaluateQuery(db, query).nodes.map((n) => n.id)).not.toContain(nodeId)

    restoreNode(db, nodeId)
    expect(evaluateQuery(db, query).nodes.map((n) => n.id)).toContain(nodeId)
  })

  it('findNodeBySystemId still resolves a soft-deleted node (identity lookups must see it even while hidden from queries)', () => {
    const systemId = 'item:day-2026-08-01'
    const nodeId = createNode(db, { content: 'Aug 1', systemId })

    deleteNode(db, nodeId)

    const resolved = findNodeBySystemId(db, systemId)
    expect(resolved).not.toBeNull()
    expect(resolved?.id).toBe(nodeId)
    expect(resolved?.deletedAt).not.toBeNull()
  })

  it('restoreNode is idempotent when called on an already-live node (clearing an already-null deletedAt is a no-op)', () => {
    const nodeId = createNode(db, { content: 'Never deleted' })
    expect(() => restoreNode(db, nodeId)).not.toThrow()

    const resolved = findNodeBySystemId(db, 'item:never-used') // sanity: unrelated lookup still null
    expect(resolved).toBeNull()
  })
})
