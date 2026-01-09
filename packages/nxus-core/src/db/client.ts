import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js'
import * as schema from './schema'
import * as ephemeralSchema from './ephemeral-schema'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

// Get the data directory path relative to this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = resolve(__dirname, '../data')

// Database paths
const masterDbPath = resolve(dataDir, 'nxus.db')
const ephemeralDbPath = resolve(__dirname, '../../ephemeral.db') // In package root, gitignored

// Ensure data directory exists
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

// ============================================================================
// Master Database (nxus.db) - Committed via JSON export
// ============================================================================

let masterSqliteDb: SqlJsDatabase | null = null
let masterDrizzleDb: SQLJsDatabase<typeof schema> | null = null

/**
 * Initialize the master database connection
 */
export async function initDatabase(): Promise<SQLJsDatabase<typeof schema>> {
  if (masterDrizzleDb) return masterDrizzleDb

  const SQL = await initSqlJs()

  // Load existing database or create new one
  if (existsSync(masterDbPath)) {
    const fileBuffer = readFileSync(masterDbPath)
    masterSqliteDb = new SQL.Database(fileBuffer)
  } else {
    masterSqliteDb = new SQL.Database()
  }

  masterDrizzleDb = drizzle(masterSqliteDb, { schema })

  // Create tables if they don't exist
  masterSqliteDb.run(`
    CREATE TABLE IF NOT EXISTS inbox_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  masterSqliteDb.run(`
    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      parent_id TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      color TEXT,
      icon TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  masterSqliteDb.run(`
    CREATE TABLE IF NOT EXISTS apps (
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

  masterSqliteDb.run(`
    CREATE TABLE IF NOT EXISTS commands (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      icon TEXT NOT NULL,
      category TEXT NOT NULL,
      target TEXT NOT NULL,
      mode TEXT NOT NULL,
      command TEXT NOT NULL,
      script_source TEXT,
      cwd TEXT,
      platforms TEXT,
      requires TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  // Save the database after creating tables
  saveMasterDatabase()

  return masterDrizzleDb
}

/**
 * Save the master database to disk
 */
export function saveMasterDatabase() {
  if (!masterSqliteDb) return

  const data = masterSqliteDb.export()
  const buffer = Buffer.from(data)
  writeFileSync(masterDbPath, buffer)
}

/**
 * Get the master database instance (must call initDatabase first)
 */
export function getDatabase(): SQLJsDatabase<typeof schema> {
  if (!masterDrizzleDb) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return masterDrizzleDb
}

// ============================================================================
// Ephemeral Database (ephemeral.db) - Local-only, gitignored
// ============================================================================

let ephemeralSqliteDb: SqlJsDatabase | null = null
let ephemeralDrizzleDb: SQLJsDatabase<typeof ephemeralSchema> | null = null

/**
 * Initialize the ephemeral database connection
 */
export async function initEphemeralDatabase(): Promise<
  SQLJsDatabase<typeof ephemeralSchema>
> {
  if (ephemeralDrizzleDb) return ephemeralDrizzleDb

  const SQL = await initSqlJs()

  // Load existing database or create new one
  if (existsSync(ephemeralDbPath)) {
    const fileBuffer = readFileSync(ephemeralDbPath)
    ephemeralSqliteDb = new SQL.Database(fileBuffer)
  } else {
    ephemeralSqliteDb = new SQL.Database()
  }

  ephemeralDrizzleDb = drizzle(ephemeralSqliteDb, { schema: ephemeralSchema })

  // Create tables if they don't exist
  ephemeralSqliteDb.run(`
    CREATE TABLE IF NOT EXISTS installations (
      id TEXT PRIMARY KEY,
      app_id TEXT NOT NULL,
      install_path TEXT NOT NULL,
      name TEXT,
      installed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  ephemeralSqliteDb.run(`
    CREATE TABLE IF NOT EXISTS tool_health (
      tool_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      version TEXT,
      error TEXT,
      checked_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    )
  `)

  // Save the database after creating tables
  saveEphemeralDatabase()

  return ephemeralDrizzleDb
}

/**
 * Save the ephemeral database to disk
 */
export function saveEphemeralDatabase() {
  if (!ephemeralSqliteDb) return

  const data = ephemeralSqliteDb.export()
  const buffer = Buffer.from(data)
  writeFileSync(ephemeralDbPath, buffer)
}

/**
 * Get the ephemeral database instance (must call initEphemeralDatabase first)
 */
export function getEphemeralDatabase(): SQLJsDatabase<typeof ephemeralSchema> {
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
export async function initAllDatabases() {
  await initDatabase()
  await initEphemeralDatabase()
}

// Export paths for reference
export const MASTER_DB_PATH = masterDbPath
export const EPHEMERAL_DB_PATH = ephemeralDbPath

// Legacy alias for backwards compatibility
export const DB_PATH = masterDbPath
export const saveDatabase = saveMasterDatabase
