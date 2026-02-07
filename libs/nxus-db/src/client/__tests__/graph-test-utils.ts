/**
 * graph-test-utils.ts - Test utilities for SurrealDB graph database
 *
 * Provides helpers for setting up and tearing down in-memory
 * embedded SurrealDB instances for testing.
 */

import type { Surreal } from 'surrealdb'
import { RecordId, StringRecordId } from 'surrealdb'
import {
  createEmbeddedGraphDatabase,
  initGraphSchema,
  setGraphDatabase,
  resetGraphDatabase,
} from '../graph-client.js'

export { RecordId, StringRecordId }

/**
 * Create a fresh in-memory SurrealDB instance with schema initialized.
 * Each call creates an independent database — safe for parallel tests.
 */
export async function setupTestGraphDatabase(options?: {
  namespace?: string
  database?: string
}): Promise<Surreal> {
  const db = await createEmbeddedGraphDatabase({
    namespace: options?.namespace ?? 'test',
    database: options?.database ?? 'test',
  })

  // Also set as the singleton so getGraphDatabase() works in code under test
  setGraphDatabase(db)

  return db
}

/**
 * Tear down the test database: close connection and reset singleton.
 */
export async function teardownTestGraphDatabase(db: Surreal): Promise<void> {
  try {
    await db.close()
  } catch {
    // Ignore close errors during teardown
  }
  resetGraphDatabase()
}

/**
 * Seed system supertags (Item, Tag, Field, Command).
 * The schema init already UPSERTs these, but this can be used
 * to verify they exist after init.
 */
export async function getSystemSupertags(db: Surreal) {
  const [result] = await db.query<[Array<{ id: RecordId; name: string; system_id: string }>]>(
    `SELECT id, name, system_id FROM supertag ORDER BY name`,
  )
  return result
}

/**
 * Create a test node with optional supertag assignment.
 */
export async function createTestNode(
  db: Surreal,
  data: {
    content?: string
    system_id?: string
    props?: Record<string, unknown>
    supertag?: string // e.g. 'supertag:item'
  },
) {
  // Build SET clauses dynamically — SurrealDB v2 SCHEMAFULL rejects NULL
  // for option<T> fields; we must use NONE or omit the field entirely.
  const setClauses: string[] = []
  const params: Record<string, unknown> = {}

  if (data.content !== undefined) {
    setClauses.push('content = $content', 'content_plain = $content_plain')
    params.content = data.content
    params.content_plain = data.content.toLowerCase()
  }

  if (data.system_id !== undefined) {
    setClauses.push('system_id = $system_id')
    params.system_id = data.system_id
  }

  setClauses.push('props = $props')
  params.props = data.props ?? {}

  setClauses.push('created_at = time::now()', 'updated_at = time::now()')

  const [nodes] = await db.query<[Array<Record<string, unknown>>]>(
    `CREATE node SET ${setClauses.join(', ')}`,
    params,
  )

  const node = nodes[0]
  if (!node) throw new Error('Failed to create test node')

  // Assign supertag if provided
  if (data.supertag) {
    await db.query(
      `RELATE $from->has_supertag->$to SET order = 0, created_at = time::now()`,
      {
        from: node.id,
        to: new StringRecordId(data.supertag),
      },
    )
  }

  return node
}

/**
 * Get all tables defined in the database.
 */
export async function getDefinedTables(db: Surreal): Promise<string[]> {
  const [result] = await db.query<[Array<{ name: string }>]>(
    `INFO FOR DB`,
  )
  // INFO FOR DB returns an object with table names as keys
  const info = result as unknown as Record<string, unknown>
  if (info && typeof info === 'object' && 'tables' in info) {
    return Object.keys(info.tables as Record<string, unknown>)
  }
  return []
}
