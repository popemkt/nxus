/**
 * tif.test.ts - Tests for Tana Intermediate Format import/export.
 *
 * Uses the real bootstrap (`bootstrapSystemNodesSync`) against an in-memory
 * SQLite DB, same pattern as bootstrap-parity.test.ts, since the importer
 * relies on real system fields/supertags (field:supertag, field:field_type,
 * field:view_as, ...) being present.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { and, eq, isNull } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../schemas/item-schema.js'
import { nodes as nodesTable, FIELD_NAMES, type FieldContentName } from '../../schemas/node-schema.js'
import { assembleNodes, clearSystemNodeCache, createNode, findNodeById, getProperty, getPropertyValues } from '../node.service.js'
import { bootstrapSystemNodesSync } from '../bootstrap.js'
import { importTanaIntermediateFile } from './tif-import.js'
import { exportSubtreeToTif } from './tif-export.js'
import type { TanaIntermediateFile, TanaIntermediateNode } from './tif-types.js'

type TestDb = BetterSQLite3Database<typeof schema>

interface TestDatabase {
  sqlite: Database.Database
  db: TestDb
}

function createTestDatabase(): TestDatabase {
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
    CREATE INDEX IF NOT EXISTS idx_node_properties_node_id ON node_properties(node_id);
    CREATE INDEX IF NOT EXISTS idx_node_properties_field_node_id ON node_properties(field_node_id);
    CREATE INDEX IF NOT EXISTS idx_node_properties_value ON node_properties(value);
  `)

  clearSystemNodeCache()
  bootstrapSystemNodesSync(db)
  return { sqlite, db }
}

function childrenOf(db: TestDb, ownerId: string) {
  const rows = db
    .select({ id: nodesTable.id })
    .from(nodesTable)
    .where(and(eq(nodesTable.ownerId, ownerId), isNull(nodesTable.deletedAt)))
    .all()
  return assembleNodes(db, rows.map((r) => r.id))
}

function nodeCount(db: TestDb): number {
  return db.select({ id: nodesTable.id }).from(nodesTable).all().length
}

const NOW = 1_700_000_000_000

function buildFixture(): TanaIntermediateFile {
  const linkedUid = 'n-linked'
  const rootUid = 'n-root'
  const childUid = 'n-child'
  const grandchildUid = 'n-grandchild'
  const dateUid = 'n-date'
  const codeUid = 'n-code'

  const node = (partial: Partial<TanaIntermediateNode> & Pick<TanaIntermediateNode, 'uid' | 'name' | 'type'>): TanaIntermediateNode => ({
    createdAt: NOW,
    editedAt: NOW,
    ...partial,
  })

  const fieldCarrier = (uid: string, name: string, valueUid: string, valueName: string): TanaIntermediateNode =>
    node({
      uid,
      name,
      type: 'field',
      children: [node({ uid: valueUid, name: valueName, type: 'node' })],
    })

  return {
    version: 'TanaIntermediateFile V0.1',
    summary: { leafNodes: 3, topLevelNodes: 4, totalNodes: 20, calendarNodes: 1, fields: 6, brokenRefs: 0 },
    supertags: [{ uid: 'st-task', name: 'Task' }],
    attributes: [
      { name: 'Status', values: ['active'], count: 1, dataType: 'any' },
      { name: 'Website', values: ['https://example.com'], count: 1, dataType: 'url' },
      { name: 'Contact', values: ['owner@example.com'], count: 1, dataType: 'email' },
      { name: 'Priority', values: ['3'], count: 1, dataType: 'number' },
      { name: 'Due', values: ['2024-01-15'], count: 1, dataType: 'date' },
      { name: 'Urgent', values: ['True'], count: 1, dataType: 'checkbox' },
    ],
    nodes: [
      node({
        uid: rootUid,
        name: 'Project Alpha',
        type: 'node',
        supertags: ['st-task'],
        refs: [linkedUid],
        children: [
          fieldCarrier('f-status', 'Status', 'v-status', 'active'),
          fieldCarrier('f-website', 'Website', 'v-website', 'https://example.com'),
          fieldCarrier('f-contact', 'Contact', 'v-contact', 'owner@example.com'),
          fieldCarrier('f-priority', 'Priority', 'v-priority', '3'),
          fieldCarrier('f-due', 'Due', 'v-due', '2024-01-15'),
          fieldCarrier('f-urgent', 'Urgent', 'v-urgent', 'True'),
          node({
            uid: childUid,
            name: `See also [[${linkedUid}]]`,
            type: 'node',
            todoState: 'todo',
            children: [node({ uid: grandchildUid, name: 'Nested detail', type: 'node' })],
          }),
        ],
      }),
      node({ uid: linkedUid, name: 'Linked Reference Node', type: 'node' }),
      node({ uid: dateUid, name: '2024-01-15', type: 'date' }),
      node({ uid: codeUid, name: 'console.log(1)', type: 'codeblock', codeLanguage: 'javascript' }),
    ],
  }
}

describe('TIF import', () => {
  let ctx: TestDatabase
  let baselineNodeCount: number

  beforeEach(() => {
    ctx = createTestDatabase()
    baselineNodeCount = nodeCount(ctx.db)
  })

  afterEach(() => {
    ctx.sqlite.close()
    clearSystemNodeCache()
  })

  it('imports nested children, supertags, fields (each dataType), refs, todo, date, codeblock', () => {
    const fixture = buildFixture()
    const summary = importTanaIntermediateFile(ctx.db, fixture)

    expect(summary.brokenRefs).toBe(0)
    expect(summary.skipped).toEqual([])
    expect(summary.supertagsImported).toBe(1)
    expect(summary.fieldsImported).toBe(6)
    expect(summary.topLevelNodesImported).toBe(4)
    expect(summary.refsResolved).toBe(1)
    expect(summary.topLevelNodeIds).toHaveLength(4)

    const [rootId, linkedId, dateId, codeId] = summary.topLevelNodeIds

    const root = findNodeById(ctx.db, rootId)
    expect(root).not.toBeNull()
    expect(root?.content).toBe(`Project Alpha [[node:${linkedId}]]`)
    expect(root?.supertags.map((st) => st.systemId)).toEqual(['supertag:tif_task'])
    expect(getPropertyValues<string>(root!, 'mentions' as FieldContentName)).toEqual([linkedId])

    expect(getProperty(root!, 'Status' as FieldContentName)).toBe('active')
    expect(getProperty(root!, 'Website' as FieldContentName)).toBe('https://example.com')
    expect(getProperty(root!, 'Contact' as FieldContentName)).toBe('owner@example.com')
    expect(getProperty(root!, 'Priority' as FieldContentName)).toBe(3)
    expect(getProperty(root!, 'Due' as FieldContentName)).toBe('2024-01-15')
    expect(getProperty(root!, 'Urgent' as FieldContentName)).toBe(true)

    // Field carriers collapse into properties — root has exactly one real outline child.
    const rootChildren = childrenOf(ctx.db, rootId)
    expect(rootChildren).toHaveLength(1)
    const childNode = rootChildren[0]
    expect(childNode.content).toBe(`See also [[node:${linkedId}]]`)
    expect(getProperty(childNode, FIELD_NAMES.TODO_STATE)).toBe('todo')

    const grandchildren = childrenOf(ctx.db, childNode.id)
    expect(grandchildren).toHaveLength(1)
    expect(grandchildren[0].content).toBe('Nested detail')

    const dateNode = findNodeById(ctx.db, dateId)
    expect(dateNode?.content).toBe('2024-01-15')
    expect(getProperty(dateNode!, 'TIF node type' as FieldContentName)).toBe('date')

    const codeNode = findNodeById(ctx.db, codeId)
    expect(codeNode?.content).toBe('console.log(1)')
    expect(getProperty(codeNode!, 'TIF node type' as FieldContentName)).toBe('codeblock')
    expect(getProperty(codeNode!, 'TIF code language' as FieldContentName)).toBe('javascript')
  })

  it('round-trips: export what was imported, re-import into a fresh DB, structurally equal (uids differ)', () => {
    // Bootstrap seeds its own system field/supertag definition nodes at
    // root level (ownerId null) — exporting `null` would sweep those in
    // too. Import under a wrapper node so the exported subtree is exactly
    // our fixture data.
    const wrapperId = createNode(ctx.db, { content: 'Import root' })
    const fixture = buildFixture()
    importTanaIntermediateFile(ctx.db, fixture, { ownerId: wrapperId })
    const exported = exportSubtreeToTif(ctx.db, wrapperId)

    const dbA = createTestDatabase()
    try {
      const summary2 = importTanaIntermediateFile(dbA.db, exported)
      expect(summary2.brokenRefs).toBe(0)
      expect(summary2.topLevelNodeIds).toHaveLength(1)
      const reExported = exportSubtreeToTif(dbA.db, summary2.topLevelNodeIds[0])

      // uids are real DB ids and MUST differ across the two databases.
      expect(reExported.nodes[0].uid).not.toBe(exported.nodes[0].uid)

      // Structural equality: same shape/content/tags/fields once uid-bearing
      // fields are normalized away.
      expect(normalizeFile(reExported)).toEqual(normalizeFile(exported))
      expect(reExported.summary).toEqual(exported.summary)
    } finally {
      dbA.sqlite.close()
    }
  })

  it('rejects a malformed file (Zod) and leaves the database untouched', () => {
    const malformed = { version: 'not-a-tif-version', nodes: [] }
    expect(() => importTanaIntermediateFile(ctx.db, malformed)).toThrow()
    expect(nodeCount(ctx.db)).toBe(baselineNodeCount)
  })

  it('rolls back the whole transaction on a duplicate uid (proves I6 atomicity, not just pre-tx Zod rejection)', () => {
    const dup: TanaIntermediateFile = {
      version: 'TanaIntermediateFile V0.1',
      summary: { leafNodes: 0, topLevelNodes: 2, totalNodes: 2, calendarNodes: 0, fields: 0, brokenRefs: 0 },
      nodes: [
        { uid: 'dup-1', name: 'First', type: 'node', createdAt: NOW, editedAt: NOW },
        { uid: 'dup-1', name: 'Second (duplicate uid)', type: 'node', createdAt: NOW, editedAt: NOW },
      ],
    }

    expect(() => importTanaIntermediateFile(ctx.db, dup)).toThrow(/duplicate uid/)
    // The first node's insert happened inside the transaction before the
    // throw — this proves the whole transaction rolled back, not just that
    // nothing was attempted.
    expect(nodeCount(ctx.db)).toBe(baselineNodeCount)
  })

  it('counts an unknown supertag uid as broken but still imports the node', () => {
    const tifWithUnknownTag: TanaIntermediateFile = {
      version: 'TanaIntermediateFile V0.1',
      summary: { leafNodes: 1, topLevelNodes: 1, totalNodes: 1, calendarNodes: 0, fields: 0, brokenRefs: 1 },
      nodes: [
        {
          uid: 'n-1',
          name: 'Tagged with ghost',
          type: 'node',
          createdAt: NOW,
          editedAt: NOW,
          supertags: ['ghost-uid'],
        },
      ],
    }

    const summary = importTanaIntermediateFile(ctx.db, tifWithUnknownTag)
    expect(summary.brokenRefs).toBe(1)
    expect(summary.skipped.some((s) => s.uid === 'ghost-uid')).toBe(true)
    expect(summary.nodesImported).toBe(1)

    const node = findNodeById(ctx.db, summary.topLevelNodeIds[0])
    expect(node?.supertags).toHaveLength(0)
  })
})

// ============================================================================
// Round-trip comparison helper
// ============================================================================

const BRACKET_REF = /\[\[[^[\]]+\]\]/g

function normalizeNode(n: TanaIntermediateNode): unknown {
  return {
    name: n.name.replace(BRACKET_REF, '[[REF]]'),
    description: n.description?.replace(BRACKET_REF, '[[REF]]'),
    type: n.type,
    mediaUrl: n.mediaUrl,
    codeLanguage: n.codeLanguage,
    todoState: n.todoState,
    viewType: n.viewType,
    flags: n.flags,
    refsCount: n.refs?.length ?? 0,
    supertagCount: n.supertags?.length ?? 0,
    children: (n.children ?? []).map(normalizeNode),
  }
}

function normalizeFile(f: TanaIntermediateFile): unknown {
  return {
    nodes: f.nodes.map(normalizeNode),
    attributes: (f.attributes ?? [])
      .map((a) => ({ name: a.name, values: [...a.values].sort(), count: a.count, dataType: a.dataType }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    supertagNames: (f.supertags ?? []).map((s) => s.name).sort(),
  }
}
