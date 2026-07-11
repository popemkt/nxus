/**
 * mentions.test.ts — Inline mention extraction and reconciliation.
 *
 * Story: a node's content can carry `[[node:<uuid>]]` tokens. Those tokens
 * are extracted at write time into `field:mentions` node-refs so downstream
 * readers (backlinks) never parse content.
 *
 * Spec: spec/product/data-model.md §3 (node references),
 * spec/product/editor.md §8 (References panel, Mentioned subsection).
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import { FIELD_NAMES } from '../schemas/node-schema.js'
import {
  assembleNode,
  clearSystemNodeCache,
  createNode,
  extractMentionedNodeIds,
  getPropertyValues,
  updateNodeContent,
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
  `)
  clearSystemNodeCache()
  bootstrapSystemNodesSync(db)
})

afterEach(() => {
  sqlite.close()
  clearSystemNodeCache()
})

function mentionsOf(nodeId: string): string[] {
  const assembled = assembleNode(db, nodeId)
  if (!assembled) return []
  return getPropertyValues<string>(assembled, FIELD_NAMES.MENTIONS)
}

describe('extractMentionedNodeIds', () => {
  it('extracts a single token', () => {
    const id = '018f2c1a-1b2c-7d3e-8f4a-5b6c7d8e9f0a'
    expect(extractMentionedNodeIds(`see [[node:${id}]] for details`)).toEqual([id])
  })

  it('extracts multiple distinct tokens in first-occurrence order', () => {
    const a = '018f2c1a-1b2c-7d3e-8f4a-5b6c7d8e9f0a'
    const b = '018f2c1a-1b2c-7d3e-8f4a-5b6c7d8e9f0b'
    expect(extractMentionedNodeIds(`[[node:${b}]] and [[node:${a}]] and [[node:${b}]]`)).toEqual([
      b,
      a,
    ])
  })

  it('extracts graph-mode node record ids', () => {
    expect(extractMentionedNodeIds('see [[node:node:bznp3cj48q1rzjyovhky]]')).toEqual([
      'node:bznp3cj48q1rzjyovhky',
    ])
  })

  it('returns empty for content with no tokens', () => {
    expect(extractMentionedNodeIds('plain text, no tokens here')).toEqual([])
    expect(extractMentionedNodeIds(null)).toEqual([])
    expect(extractMentionedNodeIds(undefined)).toEqual([])
    expect(extractMentionedNodeIds('')).toEqual([])
  })

  it('ignores malformed tokens (not a UUID, missing brackets)', () => {
    expect(
      extractMentionedNodeIds('[[node:not-a-uuid]] [node:018f2c1a-1b2c-7d3e-8f4a-5b6c7d8e9f0a]'),
    ).toEqual([])
  })
})

describe('reconcileMentions via the canonical write path', () => {
  it('createNode extracts tokens present in initial content', () => {
    const target = createNode(db, { content: 'Target node' })
    const source = createNode(db, { content: `Refers to [[node:${target}]] inline` })

    expect(mentionsOf(source)).toEqual([target])
  })

  it('updateNodeContent adds a mention when a token is typed in', () => {
    const target = createNode(db, { content: 'Target node' })
    const source = createNode(db, { content: 'No mention yet' })
    expect(mentionsOf(source)).toEqual([])

    updateNodeContent(db, source, `Now mentions [[node:${target}]]`)

    expect(mentionsOf(source)).toEqual([target])
  })

  it('updateNodeContent removes a mention when its token is deleted from content', () => {
    const target = createNode(db, { content: 'Target node' })
    const source = createNode(db, { content: `Mentions [[node:${target}]]` })
    expect(mentionsOf(source)).toEqual([target])

    updateNodeContent(db, source, 'No longer mentions anything')

    expect(mentionsOf(source)).toEqual([])
  })

  it('updateNodeContent reconciles a swap: removes the gone id, adds the new one', () => {
    const targetA = createNode(db, { content: 'Target A' })
    const targetB = createNode(db, { content: 'Target B' })
    const source = createNode(db, { content: `Mentions [[node:${targetA}]]` })

    updateNodeContent(db, source, `Mentions [[node:${targetB}]] now`)

    expect(mentionsOf(source)).toEqual([targetB])
  })

  it('preserves an unrelated existing mention while adding a new one', () => {
    const kept = createNode(db, { content: 'Kept target' })
    const added = createNode(db, { content: 'Added target' })
    const source = createNode(db, { content: `Mentions [[node:${kept}]]` })

    updateNodeContent(db, source, `Mentions [[node:${kept}]] and [[node:${added}]]`)

    expect(new Set(mentionsOf(source))).toEqual(new Set([kept, added]))
  })

  it('re-running the same content is a no-op (no duplicate rows)', () => {
    const target = createNode(db, { content: 'Target node' })
    const source = createNode(db, { content: `Mentions [[node:${target}]]` })

    updateNodeContent(db, source, `Mentions [[node:${target}]]`)
    updateNodeContent(db, source, `Mentions [[node:${target}]]`)

    expect(mentionsOf(source)).toEqual([target])
  })

  it('content with no tokens produces no mentions property at all', () => {
    const source = createNode(db, { content: 'Just plain text' })
    expect(mentionsOf(source)).toEqual([])
  })
})
