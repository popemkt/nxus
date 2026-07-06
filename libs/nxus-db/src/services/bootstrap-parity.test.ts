/**
 * bootstrap-parity.test.ts — Guards the FIELD_NAMES ↔ bootstrap contract.
 *
 * `SYSTEM_FIELDS` (systemId, write path) and `FIELD_NAMES` (display content,
 * read path) are parallel maps. Assembled properties are keyed by the field
 * node's *content*, so every read via `FIELD_NAMES.X` silently returns
 * `undefined` when the seeded content diverges from the constant.
 *
 * Bootstrap never rewrites content on existing databases (upsertSystemNode
 * is insert-only), so the constants MUST follow the seeded data.
 *
 * Spec: spec/product/data-model.md — invariant "FIELD_NAMES ↔ bootstrap parity".
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import { FIELD_NAMES, SYSTEM_FIELDS } from '../schemas/node-schema.js'
import {
  assembleNode,
  clearSystemNodeCache,
  createNode,
  getProperty,
  getSystemNode,
  setProperty,
} from './node.service.js'
import { bootstrapSystemNodesSync } from './bootstrap.js'

let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>

beforeEach(() => {
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
    CREATE TABLE IF NOT EXISTS node_properties (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      node_id TEXT NOT NULL,
      field_node_id TEXT NOT NULL,
      value TEXT,
      "order" INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_node_properties_node_id ON node_properties(node_id);
    CREATE INDEX IF NOT EXISTS idx_node_properties_field_node_id ON node_properties(field_node_id);
    CREATE INDEX IF NOT EXISTS idx_node_properties_value ON node_properties(value);
  `)
  clearSystemNodeCache()
  bootstrapSystemNodesSync(db)
})

afterEach(() => {
  sqlite.close()
  clearSystemNodeCache()
})

describe('bootstrap seeds the content that FIELD_NAMES reads', () => {
  it('a freshly bootstrapped database resolves every core meta-field read through FIELD_NAMES', () => {
    const cases: Array<[keyof typeof SYSTEM_FIELDS & keyof typeof FIELD_NAMES]> = [
      ['SUPERTAG'],
      ['EXTENDS'],
      ['FIELD_TYPE'],
    ]
    for (const [key] of cases) {
      const fieldNode = getSystemNode(db, SYSTEM_FIELDS[key])
      expect(fieldNode, `system node for ${key} exists`).not.toBeNull()
      expect(
        fieldNode?.content,
        `${key}: FIELD_NAMES value must equal the bootstrapped node content — ` +
          `reads via getProperty(node, FIELD_NAMES.${key}) key on content`,
      ).toBe(FIELD_NAMES[key])
    }
  })

  it('a field node created against the bootstrapped DB is readable via FIELD_NAMES.FIELD_TYPE', () => {
    const fieldTypeNode = getSystemNode(db, SYSTEM_FIELDS.FIELD_TYPE)
    expect(fieldTypeNode).not.toBeNull()

    const dueDate = createNode(db, { content: 'due date', systemId: 'field:due_date' })
    setProperty(db, dueDate, SYSTEM_FIELDS.FIELD_TYPE, 'date')

    const assembled = assembleNode(db, dueDate)
    expect(assembled).not.toBeNull()
    expect(getProperty(assembled!, FIELD_NAMES.FIELD_TYPE)).toBe('date')
  })
})
