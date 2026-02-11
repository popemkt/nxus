/**
 * migration.test.ts - Tests for the SQLite-to-SurrealDB migration script
 *
 * Seeds an in-memory SQLite database with nodes, properties, supertags,
 * and inheritance relations, then migrates to an in-memory SurrealDB instance
 * and verifies the output is equivalent.
 */

import type { Surreal, RecordId } from 'surrealdb'
import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../../schemas/item-schema.js'
import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  FIELD_NAMES,
} from '../../schemas/node-schema.js'
import { clearSystemNodeCache } from '../node.service.js'
import {
  setupTestGraphDatabase,
  teardownTestGraphDatabase,
} from '../../client/__tests__/graph-test-utils.js'
import { SurrealBackend } from './surreal-backend.js'
import { migrateSqliteToSurreal } from './migration.js'

// ---------------------------------------------------------------------------
// Setup helpers
// ---------------------------------------------------------------------------

let sqlite: Database.Database
let sqliteDb: BetterSQLite3Database<typeof schema>
let surrealDb: Surreal

function setupTestSqliteDatabase(): BetterSQLite3Database<typeof schema> {
  sqlite = new Database(':memory:')
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

  return db
}

function seedSystemNodes() {
  const now = Date.now()

  // System field nodes (these define the field types)
  const systemFields = [
    { id: 'field-supertag', systemId: SYSTEM_FIELDS.SUPERTAG, content: 'Supertag' },
    { id: 'field-extends', systemId: SYSTEM_FIELDS.EXTENDS, content: 'Extends' },
    { id: 'field-type', systemId: SYSTEM_FIELDS.FIELD_TYPE, content: 'Field Type' },
    { id: 'field-path', systemId: 'field:path', content: 'path' },
    { id: 'field-description', systemId: 'field:description', content: 'description' },
    { id: 'field-status', systemId: 'field:status', content: 'status' },
    { id: 'field-parent', systemId: 'field:parent', content: 'parent' },
    { id: 'field-tags', systemId: 'field:tags', content: 'tags' },
    { id: 'field-homepage', systemId: 'field:homepage', content: 'homepage' },
    { id: 'field-color', systemId: 'field:color', content: 'color' },
    { id: 'field-order', systemId: 'field:order', content: 'order' },
  ]

  for (const field of systemFields) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${field.id}', '${field.content}', '${field.content.toLowerCase()}', '${field.systemId}', ${now}, ${now})
    `)
  }

  // System supertag nodes
  const systemSupertags = [
    { id: 'supertag-item', systemId: SYSTEM_SUPERTAGS.ITEM, content: '#Item' },
    { id: 'supertag-command', systemId: SYSTEM_SUPERTAGS.COMMAND, content: '#Command' },
    { id: 'supertag-tag', systemId: SYSTEM_SUPERTAGS.TAG, content: '#Tag' },
    { id: 'supertag-tool', systemId: 'supertag:tool', content: '#Tool' },
    { id: 'supertag-repo', systemId: 'supertag:repo', content: '#Repo' },
  ]

  for (const st of systemSupertags) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${st.id}', '${st.content}', '${st.content.toLowerCase()}', '${st.systemId}', ${now}, ${now})
    `)
  }

  // #Tool extends #Item
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('supertag-tool', 'field-extends', '"supertag-item"', 0, ${now}, ${now})
  `)

  // #Repo extends #Item
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('supertag-repo', 'field-extends', '"supertag-item"', 0, ${now}, ${now})
  `)
}

function seedUserData() {
  const now = Date.now()

  // Create 5 user nodes
  const userNodes = [
    { id: 'node-1', content: 'VS Code', systemId: 'item:vscode', ownerId: null },
    { id: 'node-2', content: 'Neovim', systemId: 'item:neovim', ownerId: null },
    { id: 'node-3', content: 'Node.js', systemId: 'item:nodejs', ownerId: null },
    { id: 'node-4', content: 'My Task', systemId: null, ownerId: 'node-1' },
    { id: 'node-5', content: 'Archived Item', systemId: null, ownerId: null },
  ]

  for (const node of userNodes) {
    const ownerClause = node.ownerId ? `'${node.ownerId}'` : 'NULL'
    const systemIdClause = node.systemId ? `'${node.systemId}'` : 'NULL'
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, owner_id, created_at, updated_at)
      VALUES ('${node.id}', '${node.content}', '${node.content.toLowerCase()}', ${systemIdClause}, ${ownerClause}, ${now}, ${now})
    `)
  }

  // Soft-delete node-5
  sqlite.exec(`UPDATE nodes SET deleted_at = ${now} WHERE id = 'node-5'`)

  // Assign supertags via properties
  // node-1 (VS Code) → #Tool
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-1', 'field-supertag', '"supertag-tool"', 0, ${now}, ${now})
  `)

  // node-2 (Neovim) → #Tool
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-2', 'field-supertag', '"supertag-tool"', 0, ${now}, ${now})
  `)

  // node-3 (Node.js) → #Item
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-3', 'field-supertag', '"supertag-item"', 0, ${now}, ${now})
  `)

  // Set properties on nodes
  // node-1: path, description, status
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-1', 'field-path', '"~/apps/vscode"', 0, ${now}, ${now})
  `)
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-1', 'field-description', '"A code editor"', 0, ${now}, ${now})
  `)
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-1', 'field-status', '"active"', 0, ${now}, ${now})
  `)

  // node-2: path, homepage
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-2', 'field-path', '"~/apps/neovim"', 0, ${now}, ${now})
  `)
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-2', 'field-homepage', '"https://neovim.io"', 0, ${now}, ${now})
  `)

  // node-3: description, color
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-3', 'field-description', '"JavaScript runtime"', 0, ${now}, ${now})
  `)
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-3', 'field-color', '"green"', 0, ${now}, ${now})
  `)

  // node-1: multi-value property (tags) — 3 values
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-1', 'field-tags', '"tag-a"', 0, ${now}, ${now})
  `)
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-1', 'field-tags', '"tag-b"', 1, ${now}, ${now})
  `)
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-1', 'field-tags', '"tag-c"', 2, ${now}, ${now})
  `)

  // node-4: parent link
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('node-4', 'field-parent', '"node-1"', 0, ${now}, ${now})
  `)

  // Set a field definition on #Item supertag (default description for items)
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('supertag-item', 'field-description', '"default item description"', 0, ${now}, ${now})
  `)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SQLite-to-SurrealDB Migration', () => {
  beforeEach(async () => {
    sqliteDb = setupTestSqliteDatabase()
    clearSystemNodeCache()
    seedSystemNodes()
    seedUserData()

    // Also bootstrap supertag:tool and supertag:repo in SurrealDB
    surrealDb = await setupTestGraphDatabase()

    // Add tool and repo supertags to SurrealDB (they aren't in the default bootstrap)
    await surrealDb.query(`
      UPSERT supertag:tool SET
        name = 'Tool',
        system_id = 'supertag:tool',
        icon = 'Wrench',
        created_at = time::now();
    `)
    await surrealDb.query(`
      UPSERT supertag:repo SET
        name = 'Repo',
        system_id = 'supertag:repo',
        icon = 'GitBranch',
        created_at = time::now();
    `)
  })

  afterEach(async () => {
    sqlite.close()
    await teardownTestGraphDatabase(surrealDb)
  })

  // -----------------------------------------------------------------------
  // Basic migration
  // -----------------------------------------------------------------------

  it('should migrate all user nodes to SurrealDB', async () => {
    const result = await migrateSqliteToSurreal(sqliteDb, surrealDb)

    // 5 user nodes (node-1 through node-5)
    expect(result.nodesCount).toBe(5)
    expect(result.errors).toHaveLength(0)
  })

  it('should migrate properties as has_field edges', async () => {
    const result = await migrateSqliteToSurreal(sqliteDb, surrealDb)

    // Count expected properties:
    // node-1: path, description, status, tags×3 = 6
    // node-2: path, homepage = 2
    // node-3: description, color = 2
    // node-4: parent = 1
    // Total = 11
    expect(result.propertiesCount).toBe(11)
  })

  it('should migrate supertag assignments as has_supertag edges', async () => {
    const result = await migrateSqliteToSurreal(sqliteDb, surrealDb)

    // node-1 → #Tool, node-2 → #Tool, node-3 → #Item = 3
    expect(result.supertagsCount).toBe(3)
  })

  it('should migrate extends relations', async () => {
    const result = await migrateSqliteToSurreal(sqliteDb, surrealDb)

    // #Tool extends #Item, #Repo extends #Item = 2
    expect(result.extendsCount).toBe(2)
  })

  // -----------------------------------------------------------------------
  // Verify assembled nodes match
  // -----------------------------------------------------------------------

  it('should produce equivalent assembled nodes for migrated data', async () => {
    await migrateSqliteToSurreal(sqliteDb, surrealDb)

    const surrealBackend = new SurrealBackend()
    surrealBackend.initWithDb(surrealDb)

    // Find VS Code node
    const vscodeNode = await surrealBackend.findNodeBySystemId('item:vscode')
    expect(vscodeNode).not.toBeNull()
    expect(vscodeNode!.content).toBe('VS Code')

    // Verify properties
    expect(vscodeNode!.properties[FIELD_NAMES.PATH]).toBeDefined()
    expect(vscodeNode!.properties[FIELD_NAMES.PATH][0].value).toBe('~/apps/vscode')
    expect(vscodeNode!.properties[FIELD_NAMES.DESCRIPTION][0].value).toBe('A code editor')
    expect(vscodeNode!.properties[FIELD_NAMES.STATUS][0].value).toBe('active')

    // Verify multi-value property (tags)
    const tags = vscodeNode!.properties[FIELD_NAMES.TAGS]
    expect(tags).toHaveLength(3)
    const tagValues = [...tags].sort((a, b) => a.order - b.order).map((t) => t.value)
    expect(tagValues).toEqual(['tag-a', 'tag-b', 'tag-c'])

    // Verify supertag
    expect(vscodeNode!.supertags).toHaveLength(1)
    expect(vscodeNode!.supertags[0].systemId).toBe('supertag:tool')
  })

  it('should preserve node content across migration', async () => {
    await migrateSqliteToSurreal(sqliteDb, surrealDb)

    const surrealBackend = new SurrealBackend()
    surrealBackend.initWithDb(surrealDb)

    const neovimNode = await surrealBackend.findNodeBySystemId('item:neovim')
    expect(neovimNode).not.toBeNull()
    expect(neovimNode!.content).toBe('Neovim')
    expect(neovimNode!.properties[FIELD_NAMES.PATH][0].value).toBe('~/apps/neovim')
    expect(neovimNode!.properties[FIELD_NAMES.HOMEPAGE][0].value).toBe('https://neovim.io')
  })

  it('should preserve soft-deleted nodes', async () => {
    await migrateSqliteToSurreal(sqliteDb, surrealDb)

    const surrealBackend = new SurrealBackend()
    surrealBackend.initWithDb(surrealDb)

    // node-5 was soft-deleted — findNodeById includes deleted nodes
    // but assembleNode should return null for deleted nodes
    const [results] = await surrealDb.query<[Array<{ content: string; deleted_at: string | null }>]>(
      `SELECT content, deleted_at FROM node WHERE content = 'Archived Item'`,
    )
    expect(results).toHaveLength(1)
    expect(results[0].deleted_at).not.toBeNull()
  })

  it('should preserve ownerId (parent relationship)', async () => {
    await migrateSqliteToSurreal(sqliteDb, surrealDb)

    const [results] = await surrealDb.query<[Array<{ content: string; owner_id: string | null }>]>(
      `SELECT content, owner_id FROM node WHERE content = 'My Task'`,
    )
    expect(results).toHaveLength(1)
    // ownerId stores the SQLite UUID — this is fine for tracking origin
    expect(results[0].owner_id).toBe('node-1')
  })

  // -----------------------------------------------------------------------
  // Skip system nodes
  // -----------------------------------------------------------------------

  it('should not create duplicate field or supertag nodes', async () => {
    await migrateSqliteToSurreal(sqliteDb, surrealDb)

    // Field records should only be from the bootstrap, not duplicated
    const [fields] = await surrealDb.query<[Array<{ system_id: string }>]>(
      `SELECT system_id FROM field WHERE system_id = 'field:path'`,
    )
    expect(fields).toHaveLength(1)

    // Supertag records should only be from the bootstrap
    const [supertags] = await surrealDb.query<[Array<{ system_id: string }>]>(
      `SELECT system_id FROM supertag WHERE system_id = 'supertag:item'`,
    )
    expect(supertags).toHaveLength(1)
  })

  // -----------------------------------------------------------------------
  // Extends edges
  // -----------------------------------------------------------------------

  it('should create extends edges between supertags', async () => {
    await migrateSqliteToSurreal(sqliteDb, surrealDb)

    // Verify #Tool extends #Item
    const [toolExtends] = await surrealDb.query<[Array<{ out: RecordId }>]>(
      `SELECT out FROM extends WHERE in = supertag:tool`,
    )
    expect(toolExtends).toHaveLength(1)
    expect(String(toolExtends[0].out)).toBe('supertag:item')

    // Verify #Repo extends #Item
    const [repoExtends] = await surrealDb.query<[Array<{ out: RecordId }>]>(
      `SELECT out FROM extends WHERE in = supertag:repo`,
    )
    expect(repoExtends).toHaveLength(1)
    expect(String(repoExtends[0].out)).toBe('supertag:item')
  })

  // -----------------------------------------------------------------------
  // Validation mode
  // -----------------------------------------------------------------------

  it('should validate migration with zero diffs for correct data', async () => {
    const result = await migrateSqliteToSurreal(sqliteDb, surrealDb, {
      validate: true,
    })

    expect(result.validationDiffs).toHaveLength(0)
  })

  // -----------------------------------------------------------------------
  // Multi-value ordering
  // -----------------------------------------------------------------------

  it('should preserve multi-value property ordering', async () => {
    await migrateSqliteToSurreal(sqliteDb, surrealDb)

    const surrealBackend = new SurrealBackend()
    surrealBackend.initWithDb(surrealDb)

    const vscodeNode = await surrealBackend.findNodeBySystemId('item:vscode')
    expect(vscodeNode).not.toBeNull()

    const tags = vscodeNode!.properties[FIELD_NAMES.TAGS]
    expect(tags).toHaveLength(3)

    const sorted = [...tags].sort((a, b) => a.order - b.order)
    expect(sorted[0].value).toBe('tag-a')
    expect(sorted[0].order).toBe(0)
    expect(sorted[1].value).toBe('tag-b')
    expect(sorted[1].order).toBe(1)
    expect(sorted[2].value).toBe('tag-c')
    expect(sorted[2].order).toBe(2)
  })

  // -----------------------------------------------------------------------
  // Edge counts after migration
  // -----------------------------------------------------------------------

  it('should have correct edge counts in SurrealDB', async () => {
    const result = await migrateSqliteToSurreal(sqliteDb, surrealDb)

    // Count has_field edges
    const [hasFieldCount] = await surrealDb.query<[Array<{ count: number }>]>(
      `SELECT count() AS count FROM has_field GROUP ALL`,
    )
    // 11 user properties + field definition edges from supertag migration
    // Supertag #Item has a 'description' default → 1 has_field edge
    expect(hasFieldCount[0].count).toBeGreaterThanOrEqual(result.propertiesCount)

    // Count has_supertag edges
    const [hasSupertagCount] = await surrealDb.query<[Array<{ count: number }>]>(
      `SELECT count() AS count FROM has_supertag GROUP ALL`,
    )
    expect(hasSupertagCount[0].count).toBe(result.supertagsCount)

    // Count extends edges
    const [extendsCount] = await surrealDb.query<[Array<{ count: number }>]>(
      `SELECT count() AS count FROM extends GROUP ALL`,
    )
    expect(extendsCount[0].count).toBe(result.extendsCount)
  })

  // -----------------------------------------------------------------------
  // Querying migrated data with SurrealBackend
  // -----------------------------------------------------------------------

  it('should support querying migrated nodes by supertag', async () => {
    await migrateSqliteToSurreal(sqliteDb, surrealDb)

    const surrealBackend = new SurrealBackend()
    surrealBackend.initWithDb(surrealDb)

    // Find all tools
    const tools = await surrealBackend.getNodesBySupertags(['supertag:tool'])
    expect(tools).toHaveLength(2)
    expect(tools.map((n) => n.content).sort()).toEqual(['Neovim', 'VS Code'])
  })

  it('should support querying migrated nodes by content', async () => {
    await migrateSqliteToSurreal(sqliteDb, surrealDb)

    const surrealBackend = new SurrealBackend()
    surrealBackend.initWithDb(surrealDb)

    const result = await surrealBackend.evaluateQuery({
      filters: [
        { type: 'content', query: 'neovim', caseSensitive: false },
      ],
      limit: 500,
    })

    const contents = result.nodes.map((n) => n.content)
    expect(contents).toContain('Neovim')
  })

  it('should support querying migrated nodes by property', async () => {
    await migrateSqliteToSurreal(sqliteDb, surrealDb)

    const surrealBackend = new SurrealBackend()
    surrealBackend.initWithDb(surrealDb)

    const result = await surrealBackend.evaluateQuery({
      filters: [
        { type: 'property', fieldId: SYSTEM_FIELDS.STATUS, op: 'eq', value: 'active' },
      ],
      limit: 500,
    })

    expect(result.nodes).toHaveLength(1)
    expect(result.nodes[0].content).toBe('VS Code')
  })

  // -----------------------------------------------------------------------
  // Idempotency check
  // -----------------------------------------------------------------------

  it('should not fail on second migration (with unique constraint conflicts for system_id)', async () => {
    // First migration
    const result1 = await migrateSqliteToSurreal(sqliteDb, surrealDb)
    expect(result1.nodesCount).toBe(5)

    // Second migration will fail on unique system_id constraint for item:* nodes
    // but should report errors, not throw
    const result2 = await migrateSqliteToSurreal(sqliteDb, surrealDb)
    // Some nodes will fail due to unique system_id constraint
    expect(result2.errors.length).toBeGreaterThan(0)
  })
})
