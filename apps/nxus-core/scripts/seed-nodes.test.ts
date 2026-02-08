/**
 * seed-nodes.test.ts - Tests for node seeding functionality
 *
 * Tests the multi-type supertag assignment in node seeding.
 */

import Database from 'better-sqlite3'
import {  drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@nxus/db'
import {
  ITEM_TYPE_TO_SUPERTAG,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
} from '@nxus/db/server'
import type {BetterSQLite3Database} from 'drizzle-orm/better-sqlite3';
import type { ItemType } from '@nxus/db'

// In-memory database for testing
let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>

// System node ID cache (mirrors the script's approach)
const systemNodeIds = new Map<string, string>()

function getSystemNodeId(systemId: string): string {
  if (systemNodeIds.has(systemId)) return systemNodeIds.get(systemId)!
  const row = sqlite
    .prepare('SELECT id FROM nodes WHERE system_id = ?')
    .get(systemId) as { id: string } | undefined
  if (!row) throw new Error(`System node not found: ${systemId}`)
  systemNodeIds.set(systemId, row.id)
  return row.id
}

function addProperty(
  nodeId: string,
  fieldNodeId: string,
  value: string,
  order = 0,
): void {
  const now = Date.now()
  sqlite.exec(`
    INSERT INTO node_properties (node_id, field_node_id, value, "order", created_at, updated_at)
    VALUES ('${nodeId}', '${fieldNodeId}', '${value}', ${order}, ${now}, ${now})
  `)
}

function setupTestDatabase(): BetterSQLite3Database<typeof schema> {
  sqlite = new Database(':memory:')
  db = drizzle(sqlite, { schema })
  systemNodeIds.clear()

  // Create nodes table
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

  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_nodes_system_id ON nodes(system_id)`,
  )

  // Create node_properties table
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

  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_node_properties_node ON node_properties(node_id)`,
  )
  sqlite.exec(
    `CREATE INDEX IF NOT EXISTS idx_node_properties_field ON node_properties(field_node_id)`,
  )

  return db
}

function seedSystemNodes() {
  const now = Date.now()

  // Create system field nodes
  const systemFields = [
    {
      id: 'field-supertag',
      systemId: SYSTEM_FIELDS.SUPERTAG,
      content: 'Supertag',
    },
    { id: 'field-type', systemId: SYSTEM_FIELDS.TYPE, content: 'Type' },
    { id: 'field-path', systemId: SYSTEM_FIELDS.PATH, content: 'Path' },
    {
      id: 'field-description',
      systemId: SYSTEM_FIELDS.DESCRIPTION,
      content: 'Description',
    },
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
    { id: 'supertag-tool', systemId: SYSTEM_SUPERTAGS.TOOL, content: '#Tool' },
    { id: 'supertag-repo', systemId: SYSTEM_SUPERTAGS.REPO, content: '#Repo' },
    { id: 'supertag-tag', systemId: SYSTEM_SUPERTAGS.TAG, content: '#Tag' },
  ]

  for (const st of systemSupertags) {
    sqlite.exec(`
      INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
      VALUES ('${st.id}', '${st.content}', '${st.content.toLowerCase()}', '${st.systemId}', ${now}, ${now})
    `)
  }
}

describe('seed-nodes', () => {
  beforeEach(() => {
    setupTestDatabase()
    seedSystemNodes()
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('ITEM_TYPE_TO_SUPERTAG mapping', () => {
    it('should map tool type to supertag:tool', () => {
      expect(ITEM_TYPE_TO_SUPERTAG['tool']).toBe(SYSTEM_SUPERTAGS.TOOL)
    })

    it('should map remote-repo type to supertag:repo', () => {
      expect(ITEM_TYPE_TO_SUPERTAG['remote-repo']).toBe(SYSTEM_SUPERTAGS.REPO)
    })

    it('should have mappings for all expected types', () => {
      expect(ITEM_TYPE_TO_SUPERTAG).toHaveProperty('tool')
      expect(ITEM_TYPE_TO_SUPERTAG).toHaveProperty('remote-repo')
    })
  })

  describe('single supertag assignment', () => {
    it('should assign single supertag for single-type item', () => {
      const now = Date.now()
      const nodeId = 'test-single-type-node'
      const itemTypes: Array<ItemType> = ['tool']

      // Create item node
      sqlite.exec(`
        INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
        VALUES ('${nodeId}', 'Test Tool', 'test tool', 'item:test-tool', ${now}, ${now})
      `)

      // Assign supertag (simulating seed-nodes logic)
      const fieldNodeId = getSystemNodeId(SYSTEM_FIELDS.SUPERTAG)
      for (let i = 0; i < itemTypes.length; i++) {
        const itemType = itemTypes[i]
        const supertagSystemId = ITEM_TYPE_TO_SUPERTAG[itemType]
        if (supertagSystemId) {
          const supertagId = getSystemNodeId(supertagSystemId)
          addProperty(nodeId, fieldNodeId, JSON.stringify(supertagId), i)
        }
      }

      // Verify supertag assignment
      const rows = sqlite
        .prepare(
          `
          SELECT np.value, np."order"
          FROM node_properties np
          WHERE np.node_id = ? AND np.field_node_id = ?
          ORDER BY np."order"
        `,
        )
        .all(nodeId, fieldNodeId) as Array<{ value: string; order: number }>

      expect(rows).toHaveLength(1)
      expect(JSON.parse(rows[0].value)).toBe('supertag-tool')
      expect(rows[0].order).toBe(0)
    })
  })

  describe('multi-type supertag assignment', () => {
    it('should assign multiple supertags for multi-type item', () => {
      const now = Date.now()
      const nodeId = 'test-multi-type-node'
      const itemTypes: Array<ItemType> = ['tool', 'remote-repo']

      // Create item node
      sqlite.exec(`
        INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
        VALUES ('${nodeId}', 'Goose', 'goose', 'item:goose', ${now}, ${now})
      `)

      // Assign supertags (simulating seed-nodes logic)
      const fieldNodeId = getSystemNodeId(SYSTEM_FIELDS.SUPERTAG)
      for (let i = 0; i < itemTypes.length; i++) {
        const itemType = itemTypes[i]
        const supertagSystemId = ITEM_TYPE_TO_SUPERTAG[itemType]
        if (supertagSystemId) {
          const supertagId = getSystemNodeId(supertagSystemId)
          addProperty(nodeId, fieldNodeId, JSON.stringify(supertagId), i)
        }
      }

      // Verify both supertags assigned
      const rows = sqlite
        .prepare(
          `
          SELECT np.value, np."order"
          FROM node_properties np
          WHERE np.node_id = ? AND np.field_node_id = ?
          ORDER BY np."order"
        `,
        )
        .all(nodeId, fieldNodeId) as Array<{ value: string; order: number }>

      expect(rows).toHaveLength(2)

      // First supertag should be tool
      expect(JSON.parse(rows[0].value)).toBe('supertag-tool')
      expect(rows[0].order).toBe(0)

      // Second supertag should be repo
      expect(JSON.parse(rows[1].value)).toBe('supertag-repo')
      expect(rows[1].order).toBe(1)
    })

    it('should preserve order from types array', () => {
      const now = Date.now()
      const nodeId = 'test-order-node'
      const itemTypes: Array<ItemType> = ['remote-repo', 'tool'] // Repo first

      sqlite.exec(`
        INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
        VALUES ('${nodeId}', 'Repo First', 'repo first', 'item:repo-first', ${now}, ${now})
      `)

      const fieldNodeId = getSystemNodeId(SYSTEM_FIELDS.SUPERTAG)
      for (let i = 0; i < itemTypes.length; i++) {
        const itemType = itemTypes[i]
        const supertagSystemId = ITEM_TYPE_TO_SUPERTAG[itemType]
        if (supertagSystemId) {
          const supertagId = getSystemNodeId(supertagSystemId)
          addProperty(nodeId, fieldNodeId, JSON.stringify(supertagId), i)
        }
      }

      const rows = sqlite
        .prepare(
          `
          SELECT np.value, np."order"
          FROM node_properties np
          WHERE np.node_id = ? AND np.field_node_id = ?
          ORDER BY np."order"
        `,
        )
        .all(nodeId, fieldNodeId) as Array<{ value: string; order: number }>

      expect(rows).toHaveLength(2)
      // Order should match types array: repo first, then tool
      expect(JSON.parse(rows[0].value)).toBe('supertag-repo')
      expect(JSON.parse(rows[1].value)).toBe('supertag-tool')
    })
  })

  describe('type normalization for seeding', () => {
    it('should normalize single type to types array', () => {
      const rawManifest = {
        id: 'test-app',
        type: 'tool' as ItemType,
      }

      // Simulate normalization logic from seed-nodes
      const rawTypes = rawManifest.types as Array<ItemType> | undefined
      const rawType = rawManifest.type as ItemType | undefined

      let types: Array<ItemType>
      if (rawTypes && Array.isArray(rawTypes) && rawTypes.length > 0) {
        types = rawTypes
      } else if (rawType) {
        types = [rawType]
      } else {
        types = []
      }

      expect(types).toEqual(['tool'])
    })

    it('should use types array when present', () => {
      const rawManifest = {
        id: 'test-app',
        type: 'html' as ItemType, // Should be ignored
        types: ['tool', 'remote-repo'] as Array<ItemType>,
      }

      const rawTypes = rawManifest.types as Array<ItemType> | undefined
      const rawType = rawManifest.type as ItemType | undefined

      let types: Array<ItemType>
      if (rawTypes && Array.isArray(rawTypes) && rawTypes.length > 0) {
        types = rawTypes
      } else if (rawType) {
        types = [rawType]
      } else {
        types = []
      }

      expect(types).toEqual(['tool', 'remote-repo'])
    })

    it('should determine primaryType from explicit field or first type', () => {
      // Case 1: Explicit primaryType
      const manifest1 = {
        types: ['tool', 'remote-repo'] as Array<ItemType>,
        primaryType: 'remote-repo' as ItemType,
      }
      const types1 = manifest1.types
      const primaryType1 =
        manifest1.primaryType && types1.includes(manifest1.primaryType)
          ? manifest1.primaryType
          : types1[0]
      expect(primaryType1).toBe('remote-repo')

      // Case 2: No explicit primaryType, use first
      const manifest2 = {
        types: ['tool', 'remote-repo'] as Array<ItemType>,
      }
      const types2 = manifest2.types
      const rawPrimaryType2 = (manifest2 as any).primaryType as
        | ItemType
        | undefined
      const primaryType2 =
        rawPrimaryType2 && types2.includes(rawPrimaryType2)
          ? rawPrimaryType2
          : types2[0]
      expect(primaryType2).toBe('tool')

      // Case 3: Invalid primaryType, fallback to first
      const manifest3 = {
        types: ['tool', 'remote-repo'] as Array<ItemType>,
        primaryType: 'html' as ItemType, // Not in types
      }
      const types3 = manifest3.types
      const primaryType3 =
        manifest3.primaryType && types3.includes(manifest3.primaryType)
          ? manifest3.primaryType
          : types3[0]
      expect(primaryType3).toBe('tool')
    })
  })

  describe('supertag query verification', () => {
    it('should be able to query nodes by supertag', () => {
      const now = Date.now()

      // Create two items: one tool, one multi-type
      sqlite.exec(`
        INSERT INTO nodes (id, content, content_plain, system_id, created_at, updated_at)
        VALUES
          ('node-tool-only', 'Tool Only', 'tool only', 'item:tool-only', ${now}, ${now}),
          ('node-multi-type', 'Multi Type', 'multi type', 'item:multi-type', ${now}, ${now})
      `)

      const fieldNodeId = getSystemNodeId(SYSTEM_FIELDS.SUPERTAG)
      const toolSupertagId = getSystemNodeId(SYSTEM_SUPERTAGS.TOOL)
      const repoSupertagId = getSystemNodeId(SYSTEM_SUPERTAGS.REPO)

      // Assign supertags
      addProperty(
        'node-tool-only',
        fieldNodeId,
        JSON.stringify(toolSupertagId),
        0,
      )
      addProperty(
        'node-multi-type',
        fieldNodeId,
        JSON.stringify(toolSupertagId),
        0,
      )
      addProperty(
        'node-multi-type',
        fieldNodeId,
        JSON.stringify(repoSupertagId),
        1,
      )

      // Query for tools (should return both)
      const toolNodes = sqlite
        .prepare(
          `
          SELECT DISTINCT n.id, n.content
          FROM nodes n
          JOIN node_properties np ON n.id = np.node_id
          WHERE np.field_node_id = ? AND np.value = ?
        `,
        )
        .all(fieldNodeId, JSON.stringify(toolSupertagId)) as Array<{
        id: string
        content: string
      }>

      expect(toolNodes).toHaveLength(2)
      expect(toolNodes.map((n) => n.id)).toContain('node-tool-only')
      expect(toolNodes.map((n) => n.id)).toContain('node-multi-type')

      // Query for repos (should return only multi-type)
      const repoNodes = sqlite
        .prepare(
          `
          SELECT DISTINCT n.id, n.content
          FROM nodes n
          JOIN node_properties np ON n.id = np.node_id
          WHERE np.field_node_id = ? AND np.value = ?
        `,
        )
        .all(fieldNodeId, JSON.stringify(repoSupertagId)) as Array<{
        id: string
        content: string
      }>

      expect(repoNodes).toHaveLength(1)
      expect(repoNodes[0].id).toBe('node-multi-type')
    })
  })
})
