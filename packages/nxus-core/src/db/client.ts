import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js'
import { drizzle, type SQLJsDatabase } from 'drizzle-orm/sql-js'
import * as schema from './schema'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

// Get the data directory path relative to this file
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const dataDir = resolve(__dirname, '../data')
const dbPath = resolve(dataDir, 'nxus.db')

// Ensure data directory exists
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true })
}

let sqliteDb: SqlJsDatabase | null = null
let drizzleDb: SQLJsDatabase<typeof schema> | null = null

/**
 * Initialize the database connection (async because sql.js needs WASM)
 */
export async function initDatabase(): Promise<SQLJsDatabase<typeof schema>> {
  if (drizzleDb) return drizzleDb

  const SQL = await initSqlJs()

  // Load existing database or create new one
  if (existsSync(dbPath)) {
    const fileBuffer = readFileSync(dbPath)
    sqliteDb = new SQL.Database(fileBuffer)
  } else {
    sqliteDb = new SQL.Database()
  }

  drizzleDb = drizzle(sqliteDb, { schema })

  // Create tables if they don't exist
  sqliteDb.run(`
    CREATE TABLE IF NOT EXISTS inbox_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  sqliteDb.run(`
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

  // Save the database after creating tables
  saveDatabase()

  return drizzleDb
}

/**
 * Save the database to disk
 */
export function saveDatabase() {
  if (!sqliteDb) return

  const data = sqliteDb.export()
  const buffer = Buffer.from(data)
  writeFileSync(dbPath, buffer)
}

/**
 * Get the database instance (must call initDatabase first)
 */
export function getDatabase(): SQLJsDatabase<typeof schema> {
  if (!drizzleDb) {
    throw new Error('Database not initialized. Call initDatabase() first.')
  }
  return drizzleDb
}

// Export the path for reference
export const DB_PATH = dbPath
