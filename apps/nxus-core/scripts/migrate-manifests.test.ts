/**
 * migrate-manifests.test.ts - Tests for manifest migration functionality
 *
 * Tests the type normalization and multi-type support in manifest migration.
 */

import Database from 'better-sqlite3'
import {  drizzle } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '@nxus/db'
import type {BetterSQLite3Database} from 'drizzle-orm/better-sqlite3';
import type { ItemType } from '@nxus/db'

// In-memory database for testing
let sqlite: Database.Database
let db: BetterSQLite3Database<typeof schema>

/**
 * Normalize manifest type fields to multi-type format.
 * Extracted from migrate-manifests.ts for testing.
 */
function normalizeManifestTypes(manifest: Record<string, unknown>): {
  types: Array<ItemType>
  primaryType: ItemType
  type: ItemType
} {
  const rawTypes = manifest.types as Array<ItemType> | undefined
  const rawType = manifest.type as ItemType | undefined
  const rawPrimaryType = manifest.primaryType as ItemType | undefined

  // Determine types array
  let types: Array<ItemType>
  if (rawTypes && Array.isArray(rawTypes) && rawTypes.length > 0) {
    types = rawTypes
  } else if (rawType) {
    types = [rawType]
  } else {
    throw new Error('Manifest must have either "type" or "types" field')
  }

  // Determine primary type
  let primaryType: ItemType
  if (rawPrimaryType && types.includes(rawPrimaryType)) {
    primaryType = rawPrimaryType
  } else {
    primaryType = types[0]
  }

  return {
    types,
    primaryType,
    type: primaryType,
  }
}

function setupTestDatabase(): BetterSQLite3Database<typeof schema> {
  sqlite = new Database(':memory:')
  db = drizzle(sqlite, { schema })

  // Create items table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      path TEXT NOT NULL,
      homepage TEXT,
      thumbnail TEXT,
      platform TEXT,
      docs TEXT,
      dependencies TEXT,
      metadata TEXT,
      install_config TEXT,
      check_command TEXT,
      install_instructions TEXT,
      config_schema TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Create item_types junction table
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS item_types (
      item_id TEXT NOT NULL,
      type TEXT NOT NULL,
      is_primary INTEGER DEFAULT 0,
      "order" INTEGER DEFAULT 0,
      PRIMARY KEY (item_id, type)
    )
  `)

  // Create nodes table for node-based sync tests
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

  return db
}

describe('migrate-manifests', () => {
  beforeEach(() => {
    setupTestDatabase()
  })

  afterEach(() => {
    sqlite.close()
  })

  describe('normalizeManifestTypes', () => {
    it('should convert single type to types array', () => {
      const manifest = {
        id: 'test-app',
        type: 'tool',
      }

      const result = normalizeManifestTypes(manifest)

      expect(result.types).toEqual(['tool'])
      expect(result.primaryType).toBe('tool')
      expect(result.type).toBe('tool')
    })

    it('should handle multi-type manifest with types array', () => {
      const manifest = {
        id: 'test-app',
        types: ['tool', 'remote-repo'],
        primaryType: 'tool',
      }

      const result = normalizeManifestTypes(manifest)

      expect(result.types).toEqual(['tool', 'remote-repo'])
      expect(result.primaryType).toBe('tool')
      expect(result.type).toBe('tool')
    })

    it('should use first type as primary when primaryType not specified', () => {
      const manifest = {
        id: 'test-app',
        types: ['remote-repo', 'tool'],
      }

      const result = normalizeManifestTypes(manifest)

      expect(result.types).toEqual(['remote-repo', 'tool'])
      expect(result.primaryType).toBe('remote-repo')
      expect(result.type).toBe('remote-repo')
    })

    it('should ignore invalid primaryType not in types array', () => {
      const manifest = {
        id: 'test-app',
        types: ['tool', 'remote-repo'],
        primaryType: 'html', // Not in types array
      }

      const result = normalizeManifestTypes(manifest)

      expect(result.types).toEqual(['tool', 'remote-repo'])
      expect(result.primaryType).toBe('tool') // Falls back to first type
    })

    it('should throw error when no type or types field', () => {
      const manifest = {
        id: 'test-app',
        name: 'Test App',
      }

      expect(() => normalizeManifestTypes(manifest)).toThrow(
        'Manifest must have either "type" or "types" field',
      )
    })

    it('should throw error for empty types array', () => {
      const manifest = {
        id: 'test-app',
        types: [],
      }

      expect(() => normalizeManifestTypes(manifest)).toThrow(
        'Manifest must have either "type" or "types" field',
      )
    })

    it('should prefer types array over single type when both present', () => {
      const manifest = {
        id: 'test-app',
        type: 'html', // Should be ignored
        types: ['tool', 'remote-repo'],
        primaryType: 'remote-repo',
      }

      const result = normalizeManifestTypes(manifest)

      expect(result.types).toEqual(['tool', 'remote-repo'])
      expect(result.primaryType).toBe('remote-repo')
    })

    it('should handle all valid item types', () => {
      const validTypes: Array<ItemType> = [
        'html',
        'typescript',
        'remote-repo',
        'tool',
      ]

      for (const itemType of validTypes) {
        const manifest = { type: itemType }
        const result = normalizeManifestTypes(manifest)
        expect(result.types).toEqual([itemType])
        expect(result.primaryType).toBe(itemType)
      }
    })
  })

  describe('item_types table population', () => {
    it('should insert single type with is_primary=true', () => {
      const itemId = 'test-single-type'
      const types: Array<ItemType> = ['tool']
      const primaryType: ItemType = 'tool'

      // Simulate migration logic
      for (let i = 0; i < types.length; i++) {
        const itemType = types[i]
        const isPrimary = itemType === primaryType ? 1 : 0
        sqlite.exec(`
          INSERT INTO item_types (item_id, type, is_primary, "order")
          VALUES ('${itemId}', '${itemType}', ${isPrimary}, ${i})
        `)
      }

      const rows = sqlite
        .prepare('SELECT * FROM item_types WHERE item_id = ?')
        .all(itemId) as Array<{
        item_id: string
        type: string
        is_primary: number
        order: number
      }>

      expect(rows).toHaveLength(1)
      expect(rows[0].type).toBe('tool')
      expect(rows[0].is_primary).toBe(1)
      expect(rows[0].order).toBe(0)
    })

    it('should insert multiple types with correct primary flag', () => {
      const itemId = 'test-multi-type'
      const types: Array<ItemType> = ['tool', 'remote-repo']
      const primaryType: ItemType = 'tool'

      // Simulate migration logic
      for (let i = 0; i < types.length; i++) {
        const itemType = types[i]
        const isPrimary = itemType === primaryType ? 1 : 0
        sqlite.exec(`
          INSERT INTO item_types (item_id, type, is_primary, "order")
          VALUES ('${itemId}', '${itemType}', ${isPrimary}, ${i})
        `)
      }

      const rows = sqlite
        .prepare('SELECT * FROM item_types WHERE item_id = ? ORDER BY "order"')
        .all(itemId) as Array<{
        item_id: string
        type: string
        is_primary: number
        order: number
      }>

      expect(rows).toHaveLength(2)

      // First type (tool) should be primary
      expect(rows[0].type).toBe('tool')
      expect(rows[0].is_primary).toBe(1)
      expect(rows[0].order).toBe(0)

      // Second type (remote-repo) should not be primary
      expect(rows[1].type).toBe('remote-repo')
      expect(rows[1].is_primary).toBe(0)
      expect(rows[1].order).toBe(1)
    })

    it('should handle non-first type as primary', () => {
      const itemId = 'test-non-first-primary'
      const types: Array<ItemType> = ['tool', 'remote-repo', 'typescript']
      const primaryType: ItemType = 'remote-repo' // Second type is primary

      for (let i = 0; i < types.length; i++) {
        const itemType = types[i]
        const isPrimary = itemType === primaryType ? 1 : 0
        sqlite.exec(`
          INSERT INTO item_types (item_id, type, is_primary, "order")
          VALUES ('${itemId}', '${itemType}', ${isPrimary}, ${i})
        `)
      }

      const rows = sqlite
        .prepare('SELECT * FROM item_types WHERE item_id = ? ORDER BY "order"')
        .all(itemId) as Array<{
        item_id: string
        type: string
        is_primary: number
        order: number
      }>

      expect(rows).toHaveLength(3)
      expect(rows[0].is_primary).toBe(0) // tool - not primary
      expect(rows[1].is_primary).toBe(1) // remote-repo - primary
      expect(rows[2].is_primary).toBe(0) // typescript - not primary
    })

    it('should replace existing types on re-migration', () => {
      const itemId = 'test-replace'

      // First migration with single type
      sqlite.exec(`
        INSERT INTO item_types (item_id, type, is_primary, "order")
        VALUES ('${itemId}', 'tool', 1, 0)
      `)

      // Simulate re-migration: delete then insert new types
      sqlite.exec(`DELETE FROM item_types WHERE item_id = '${itemId}'`)

      const newTypes: Array<ItemType> = ['remote-repo', 'typescript']
      for (let i = 0; i < newTypes.length; i++) {
        sqlite.exec(`
          INSERT INTO item_types (item_id, type, is_primary, "order")
          VALUES ('${itemId}', '${newTypes[i]}', ${i === 0 ? 1 : 0}, ${i})
        `)
      }

      const rows = sqlite
        .prepare('SELECT * FROM item_types WHERE item_id = ? ORDER BY "order"')
        .all(itemId) as Array<{
        item_id: string
        type: string
        is_primary: number
        order: number
      }>

      expect(rows).toHaveLength(2)
      expect(rows[0].type).toBe('remote-repo')
      expect(rows[1].type).toBe('typescript')
    })
  })

  describe('backward compatibility', () => {
    it('should set legacy items.type to primaryType', () => {
      const itemId = 'test-backward-compat'
      const types: Array<ItemType> = ['tool', 'remote-repo']
      const primaryType: ItemType = 'tool'

      // Insert into items table with primaryType
      const now = Date.now()
      sqlite.exec(`
        INSERT INTO items (id, name, description, type, path, created_at, updated_at)
        VALUES ('${itemId}', 'Test App', 'Test description', '${primaryType}', '/test/path', ${now}, ${now})
      `)

      const row = sqlite
        .prepare('SELECT type FROM items WHERE id = ?')
        .get(itemId) as { type: string }

      expect(row.type).toBe('tool') // Legacy type field matches primaryType
    })
  })
})
