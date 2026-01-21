/**
 * graph-client.ts - SurrealDB client for graph architecture
 *
 * IMPORTANT: The SurrealDB JS SDK requires a running SurrealDB server.
 * It does NOT support embedded/in-memory mode directly.
 *
 * To use graph architecture:
 *
 * 1. Install SurrealDB:
 *    curl -sSf https://install.surrealdb.com | sh
 *
 * 2. Start the server (in-memory for dev):
 *    surreal start --user root --pass root memory
 *
 *    Or with file persistence:
 *    surreal start --user root --pass root file:~/.popemkt/.nxus/graph.db
 *
 * 3. Set environment variable (optional, defaults to localhost):
 *    export SURREAL_URL=http://127.0.0.1:8000/rpc
 */

import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { resolve } from 'path'
import Surreal from 'surrealdb'

// User data directory for graph database
const userDataDir = resolve(homedir(), '.popemkt', '.nxus')
const graphDbPath = resolve(userDataDir, 'graph.db')

// Ensure directory exists
if (!existsSync(userDataDir)) {
  mkdirSync(userDataDir, { recursive: true })
}

// Singleton instance
let db: Surreal | null = null
let isInitialized = false

/**
 * SurrealDB connection config
 *
 * The JS SDK only supports connecting to a running server via HTTP or WebSocket.
 * Default: http://127.0.0.1:8000/rpc
 */
const SURREAL_CONFIG = {
  // Connect to SurrealDB server
  url: process.env.SURREAL_URL || 'http://127.0.0.1:8000/rpc',
  namespace: process.env.SURREAL_NS || 'nxus',
  database: process.env.SURREAL_DB || 'main',
  username: process.env.SURREAL_USER || 'root',
  password: process.env.SURREAL_PASS || 'root',
}

/**
 * Initialize SurrealDB connection and schema
 */
export async function initGraphDatabase(): Promise<Surreal> {
  if (db && isInitialized) return db

  db = new Surreal()

  try {
    const url = SURREAL_CONFIG.url

    console.log('[GraphDB] Connecting to SurrealDB at:', url)

    // Connect to SurrealDB server
    await db.connect(url)

    // Sign in
    await db.signin({
      username: SURREAL_CONFIG.username,
      password: SURREAL_CONFIG.password,
    })

    // Use namespace and database
    await db.use({
      namespace: SURREAL_CONFIG.namespace,
      database: SURREAL_CONFIG.database,
    })

    // Initialize schema
    await initGraphSchema(db)

    isInitialized = true
    console.log('[GraphDB] Connected successfully')

    return db
  } catch (error: any) {
    console.error('[GraphDB] Failed to connect:', error?.message || error)
    console.error('[GraphDB] Make sure SurrealDB server is running:')
    console.error('[GraphDB]   surreal start --user root --pass root memory')
    throw new Error(
      `SurrealDB connection failed. Start server with: surreal start --user root --pass root memory`,
    )
  }
}

/**
 * Get the SurrealDB instance (must call initGraphDatabase first)
 */
export function getGraphDatabase(): Surreal {
  if (!db || !isInitialized) {
    throw new Error(
      'Graph database not initialized. Call initGraphDatabase() first.',
    )
  }
  return db
}

/**
 * Close the SurrealDB connection
 */
export async function closeGraphDatabase(): Promise<void> {
  if (db) {
    await db.close()
    db = null
    isInitialized = false
    console.log('[GraphDB] Connection closed')
  }
}

/**
 * Initialize the graph schema
 * Defines tables, fields, and indexes for the node-based architecture
 */
async function initGraphSchema(db: Surreal): Promise<void> {
  // ============================================================================
  // Core Node Table
  // ============================================================================
  await db.query(`
    DEFINE TABLE node SCHEMAFULL;
    
    -- Core fields
    DEFINE FIELD content ON node TYPE option<string>;
    DEFINE FIELD content_plain ON node TYPE option<string>;
    DEFINE FIELD system_id ON node TYPE option<string>;
    DEFINE FIELD created_at ON node TYPE datetime DEFAULT time::now();
    DEFINE FIELD updated_at ON node TYPE datetime DEFAULT time::now();
    DEFINE FIELD deleted_at ON node TYPE option<datetime>;
    
    -- Flexible properties (schemaless within this field)
    DEFINE FIELD props ON node FLEXIBLE TYPE option<object>;
    
    -- Indexes
    DEFINE INDEX idx_system_id ON node FIELDS system_id UNIQUE;
    DEFINE INDEX idx_content_plain ON node FIELDS content_plain;
    DEFINE INDEX idx_deleted ON node FIELDS deleted_at;
  `)

  // ============================================================================
  // Supertag Table (types/classes for nodes)
  // ============================================================================
  await db.query(`
    DEFINE TABLE supertag SCHEMAFULL;
    
    DEFINE FIELD name ON supertag TYPE string;
    DEFINE FIELD system_id ON supertag TYPE option<string>;
    DEFINE FIELD color ON supertag TYPE option<string>;
    DEFINE FIELD icon ON supertag TYPE option<string>;
    DEFINE FIELD created_at ON supertag TYPE datetime DEFAULT time::now();
    
    -- Schema definition for fields this supertag adds
    DEFINE FIELD field_schema ON supertag FLEXIBLE TYPE option<array>;
    
    DEFINE INDEX idx_supertag_system ON supertag FIELDS system_id UNIQUE;
    DEFINE INDEX idx_supertag_name ON supertag FIELDS name;
  `)

  // ============================================================================
  // Relation Tables (Edges) - Semantic Relationships
  // ============================================================================

  // has_supertag: Node -> Supertag (type assignment)
  await db.query(`
    DEFINE TABLE has_supertag SCHEMAFULL TYPE RELATION IN node OUT supertag;
    DEFINE FIELD order ON has_supertag TYPE option<int> DEFAULT 0;
    DEFINE FIELD created_at ON has_supertag TYPE datetime DEFAULT time::now();
  `)

  // extends: Supertag -> Supertag (inheritance)
  await db.query(`
    DEFINE TABLE extends SCHEMAFULL TYPE RELATION IN supertag OUT supertag;
    DEFINE FIELD created_at ON extends TYPE datetime DEFAULT time::now();
  `)

  // ============================================================================
  // Semantic Relations (Tana-style meaningful edges)
  // ============================================================================

  // part_of: Node -> Node (hierarchical composition)
  // Use: COMPONENTS REC traversal
  await db.query(`
    DEFINE TABLE part_of SCHEMAFULL TYPE RELATION IN node OUT node;
    DEFINE FIELD order ON part_of TYPE option<int> DEFAULT 0;
    DEFINE FIELD created_at ON part_of TYPE datetime DEFAULT time::now();
    
    DEFINE INDEX idx_part_of_out ON part_of FIELDS out;
  `)

  // dependency_of: Node -> Node (sequential dependency)
  // Use: Task ordering, prerequisites
  await db.query(`
    DEFINE TABLE dependency_of SCHEMAFULL TYPE RELATION IN node OUT node;
    DEFINE FIELD created_at ON dependency_of TYPE datetime DEFAULT time::now();
    
    DEFINE INDEX idx_dependency_out ON dependency_of FIELDS out;
  `)

  // references: Node -> Node (generic link)
  // Use: Backlinks, mentions
  await db.query(`
    DEFINE TABLE references SCHEMAFULL TYPE RELATION IN node OUT node;
    DEFINE FIELD context ON references TYPE option<string>;
    DEFINE FIELD created_at ON references TYPE datetime DEFAULT time::now();
    
    DEFINE INDEX idx_references_out ON references FIELDS out;
  `)

  // tagged_with: Node -> Node (tag assignment, where tag is also a node)
  await db.query(`
    DEFINE TABLE tagged_with SCHEMAFULL TYPE RELATION IN node OUT node;
    DEFINE FIELD created_at ON tagged_with TYPE datetime DEFAULT time::now();
    
    DEFINE INDEX idx_tagged_out ON tagged_with FIELDS out;
  `)

  // ============================================================================
  // System Supertags (bootstrap)
  // ============================================================================
  await db.query(`
    -- Item supertag (for apps/tools)
    UPSERT supertag:item SET 
      name = 'Item',
      system_id = 'supertag:item',
      icon = 'Package',
      created_at = time::now();
    
    -- Tag supertag (for user tags)
    UPSERT supertag:tag SET 
      name = 'Tag',
      system_id = 'supertag:tag',
      icon = 'Tag',
      created_at = time::now();
    
    -- Field supertag (for property definitions)
    UPSERT supertag:field SET 
      name = 'Field',
      system_id = 'supertag:field',
      icon = 'TextAa',
      created_at = time::now();
    
    -- Command supertag (for item commands)
    UPSERT supertag:command SET 
      name = 'Command',
      system_id = 'supertag:command',
      icon = 'Terminal',
      created_at = time::now();
  `)

  console.log('[GraphDB] Schema initialized')
}

// Export paths for reference
export const GRAPH_DB_PATH = graphDbPath
export { SURREAL_CONFIG }
