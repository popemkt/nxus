/**
 * recall-blooms.test.ts — Bloom's level write/read round-trip.
 *
 * saveConcept stores a Bloom's level as the bloom node's UUID
 * (getBloomsNodeId); the read path must resolve that UUID back to the
 * level label. Regression for the bug where resolveBloomsNodeId never
 * handled UUIDs, so assembled concepts leaked raw node IDs into
 * BloomsLevel-typed fields (rejected downstream by every
 * BloomsLevelSchema input validator) and cards silently fell back to
 * 'remember'.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import { BLOOMS_LEVELS } from '../types/recall.js'
import { clearSystemNodeCache } from './node.service.js'
import { bootstrapSystemNodesSync } from './bootstrap.js'
import { createTopic, getConceptById, saveConcept } from './recall.service.js'

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

describe('Bloom level round-trip through saveConcept/getConceptById', () => {
  it.each(BLOOMS_LEVELS)('stores and reads back %s as the label, never a node id', (level) => {
    const topicId = createTopic(db, 'Distributed Systems')
    const conceptId = saveConcept(db, {
      topicId,
      title: 'CAP Theorem',
      summary: 'Pick two of consistency, availability, partition tolerance.',
      bloomsLevel: level,
    })

    const concept = getConceptById(db, conceptId)
    expect(concept).not.toBeNull()
    expect(concept?.bloomsLevel).toBe(level)
  })

  it('returns null (not the raw stored value) for an unresolvable bloomsLevel', () => {
    const topicId = createTopic(db, 'Distributed Systems')
    const conceptId = saveConcept(db, {
      topicId,
      title: 'CAP Theorem',
      summary: 'Pick two.',
      bloomsLevel: 'analyze',
    })

    // Corrupt the stored value to simulate a dangling node reference
    sqlite
      .prepare(
        `UPDATE node_properties SET value = '"not-a-bloom-node"'
         WHERE node_id = ? AND value LIKE '"%'
           AND field_node_id = (SELECT id FROM nodes WHERE system_id = 'field:recall_blooms_level')`,
      )
      .run(conceptId)

    const concept = getConceptById(db, conceptId)
    expect(concept?.bloomsLevel).toBeNull()
  })
})
