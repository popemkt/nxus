import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'
import * as ephemeralSchema from '../schemas/ephemeral-schema.js'
import * as schema from '../schemas/item-schema.js'

// Get the data directory path relative to this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = resolve(__dirname, '../data')

// User data directory for ephemeral/local data
const userDataDir = resolve(homedir(), '.popemkt', '.nxus')

// Database paths
const masterDbPath = resolve(dataDir, 'nxus.db')
const ephemeralDbPath = resolve(userDataDir, 'ephemeral.db')

// Ensure directories exist
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}
if (!existsSync(userDataDir)) {
  mkdirSync(userDataDir, { recursive: true })
}

// ============================================================================
// Master Database (nxus.db) - Committed via JSON export
// ============================================================================

let masterDb: Database.Database | null = null
let masterDrizzleDb: BetterSQLite3Database<typeof schema> | null = null

/**
 * Initialize the master database connection
 */
export function initDatabase(): BetterSQLite3Database<typeof schema> {
  if (masterDrizzleDb) return masterDrizzleDb

  // better-sqlite3 opens the file directly and persists changes automatically
  masterDb = new Database(masterDbPath)

  // Enable WAL mode for better concurrency
  masterDb.pragma('journal_mode = WAL')

  masterDrizzleDb = drizzle(masterDb, { schema })

  // Create tables if they don't exist
  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      "order" INTEGER NOT NULL DEFAULT 0,
      color TEXT,
      icon TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS item_tags (
      app_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (app_id, tag_id)
    )
  `)

  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
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

  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS item_commands (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT NOT NULL,
      category TEXT NOT NULL,
      target TEXT NOT NULL,
      mode TEXT NOT NULL,
      command TEXT,
      workflow TEXT,
      script_source TEXT,
      cwd TEXT,
      platforms TEXT,
      requires TEXT,
      options TEXT,
      requirements TEXT,
      params TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Migrate existing item_commands table if columns are missing
  try {
    masterDb.exec('ALTER TABLE item_commands ADD COLUMN workflow TEXT')
  } catch (e) {
    // Column already exists, ignore
  }
  try {
    // SQLite doesn't support DROP NOT NULL easily, but we can try to re-create or just ignore if it's already nullable
    // For now, adding workflow is more important. If command NOT NULL is an issue, we'll see it in seed.
  } catch (e) {}

  // Tag configuration tables
  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS tag_schemas (
      tag_id INTEGER PRIMARY KEY,
      schema TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  masterDb.exec(`
    CREATE TABLE IF NOT EXISTS item_tag_configs (
      app_id TEXT NOT NULL,
      tag_id INTEGER NOT NULL,
      config_values TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (app_id, tag_id)
    )
  `)

  // ============================================================================
  // Node-Based Architecture Tables (Simplified: 2 tables only)
  // Everything is encoded through field values, including supertags!
  // ============================================================================

  masterDb.exec(`
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

  masterDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_nodes_system_id ON nodes(system_id)
  `)

  masterDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_nodes_owner_id ON nodes(owner_id)
  `)

  masterDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_nodes_content_plain ON nodes(content_plain)
  `)

  masterDb.exec(`
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

  masterDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_node_properties_node ON node_properties(node_id)
  `)

  masterDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_node_properties_field ON node_properties(field_node_id)
  `)

  masterDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_node_properties_value ON node_properties(value)
  `)

  // No need to manually save - better-sqlite3 persists automatically

  return masterDrizzleDb
}

/**
 * Save the master database to disk
 * Note: better-sqlite3 persists automatically, so this is now a no-op
 * Kept for backwards compatibility
 */
export function saveMasterDatabase() {
  // better-sqlite3 writes changes immediately to disk
  // This function is kept for backwards compatibility only
}

/**
 * Get the master database instance (must call initDatabase first)
 */
export function getDatabase(): BetterSQLite3Database<typeof schema> {
  if (!masterDrizzleDb) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return masterDrizzleDb
}

// ============================================================================
// Ephemeral Database (~/.popemkt/.nxus/ephemeral.db) - Local-only, gitignored
// ============================================================================

let ephemeralDb: Database.Database | null = null
let ephemeralDrizzleDb: BetterSQLite3Database<typeof ephemeralSchema> | null =
  null

/**
 * Initialize the ephemeral database connection
 */
export function initEphemeralDatabase(): BetterSQLite3Database<
  typeof ephemeralSchema
> {
  if (ephemeralDrizzleDb) return ephemeralDrizzleDb

  ephemeralDb = new Database(ephemeralDbPath)

  // Enable WAL mode for better concurrency
  ephemeralDb.pragma('journal_mode = WAL')

  ephemeralDrizzleDb = drizzle(ephemeralDb, { schema: ephemeralSchema })

  // Create tables if they don't exist
  ephemeralDb.exec(`
    CREATE TABLE IF NOT EXISTS local_installations (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      install_path TEXT NOT NULL,
      name TEXT,
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  ephemeralDb.exec(`
    CREATE TABLE IF NOT EXISTS health_cache (
      tool_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      version TEXT,
      error TEXT,
      checked_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `)

  ephemeralDb.exec(`
    CREATE TABLE IF NOT EXISTS aliases (
      id TEXT PRIMARY KEY,
      command_id TEXT NOT NULL,
      alias TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `)

  // No need to manually save - better-sqlite3 persists automatically

  return ephemeralDrizzleDb
}

/**
 * Save the ephemeral database to disk
 * Note: better-sqlite3 persists automatically, so this is now a no-op
 * Kept for backwards compatibility
 */
export function saveEphemeralDatabase() {
  // better-sqlite3 writes changes immediately to disk
  // This function is kept for backwards compatibility only
}

/**
 * Get the ephemeral database instance (must call initEphemeralDatabase first)
 */
export function getEphemeralDatabase(): BetterSQLite3Database<
  typeof ephemeralSchema
> {
  if (!ephemeralDrizzleDb) {
    throw new Error(
      'Ephemeral database not initialized. Call initEphemeralDatabase() first.',
    )
  }
  return ephemeralDrizzleDb
}

// ============================================================================
// Convenience: Initialize both databases
// ============================================================================

/**
 * Initialize both master and ephemeral databases
 */
export function initAllDatabases() {
  initDatabase()
  initEphemeralDatabase()
}

// Export paths for reference
export const MASTER_DB_PATH = masterDbPath
export const EPHEMERAL_DB_PATH = ephemeralDbPath

// Legacy alias for backwards compatibility
export const DB_PATH = masterDbPath
export const saveDatabase = saveMasterDatabase
