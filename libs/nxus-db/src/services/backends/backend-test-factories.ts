/**
 * backend-test-factories.ts — shared test-only factories producing an
 * initialized NodeBackend of each kind against throwaway storage
 * (in-memory SQLite / in-memory embedded SurrealDB). Consumed by the
 * backend-equivalence suite and the backend-parity perf budgets so the
 * two never drift on setup shape.
 */

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../schemas/item-schema.js'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '../../schemas/node-schema.js'
import { clearSystemNodeCache } from '../node.service.js'
import {
  setupTestGraphDatabase,
  teardownTestGraphDatabase,
} from '../../client/__tests__/graph-test-utils.js'
import type { NodeBackend } from './types.js'
import { SqliteBackend } from './sqlite-backend.js'
import { SurrealBackend } from './surreal-backend.js'

export interface TestBackendContext {
  backend: NodeBackend
  cleanup: () => Promise<void>
}

export async function createTestSqliteBackend(): Promise<TestBackendContext> {
  const sqlite = new Database(':memory:')
  const db = drizzle(sqlite, { schema })

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
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_nodes_system_id ON nodes(system_id)`)
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
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_node_properties_node ON node_properties(node_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_node_properties_field ON node_properties(field_node_id)`)
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_node_properties_value ON node_properties(value)`)

  // Seed system nodes
  const now = Date.now()

  const systemFields = [
    { id: 'field-supertag', systemId: SYSTEM_FIELDS.SUPERTAG, content: 'supertag' },
    { id: 'field-extends', systemId: SYSTEM_FIELDS.EXTENDS, content: 'extends' },
    { id: 'field-type', systemId: SYSTEM_FIELDS.FIELD_TYPE, content: 'fieldType' },
    { id: 'field-path', systemId: 'field:path', content: 'path' },
    { id: 'field-description', systemId: 'field:description', content: 'description' },
    { id: 'field-status', systemId: 'field:status', content: 'status' },
    { id: 'field-parent', systemId: 'field:parent', content: 'parent' },
    { id: 'field-order', systemId: 'field:order', content: 'order' },
    { id: 'field-base-type', systemId: 'field:base_type', content: 'baseType' },
    { id: 'field-mentions', systemId: SYSTEM_FIELDS.MENTIONS, content: 'mentions' },
  ]

  for (const field of systemFields) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${field.id}', '${field.content}', '${field.content.toLowerCase()}', '${field.systemId}', ${now}, ${now})
    `)
  }

  const systemSupertags = [
    { id: 'supertag-item', systemId: SYSTEM_SUPERTAGS.ITEM, content: '#Item' },
    { id: 'supertag-command', systemId: SYSTEM_SUPERTAGS.COMMAND, content: '#Command' },
    { id: 'supertag-tag', systemId: SYSTEM_SUPERTAGS.TAG, content: '#Tag' },
  ]

  for (const st of systemSupertags) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${st.id}', '${st.content}', '${st.content.toLowerCase()}', '${st.systemId}', ${now}, ${now})
    `)
  }

  clearSystemNodeCache()

  const backend = new SqliteBackend()
  backend.initWithDb(db)

  return {
    backend,
    cleanup: async () => { sqlite.close() },
  }
}

export async function createTestSurrealBackend(): Promise<TestBackendContext> {
  const db = await setupTestGraphDatabase()
  const backend = new SurrealBackend()
  backend.initWithDb(db)

  return {
    backend,
    cleanup: async () => { await teardownTestGraphDatabase(db) },
  }
}
