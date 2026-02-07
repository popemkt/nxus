/**
 * graph-client.ts - SurrealDB client for graph architecture
 *
 * Supports two connection modes:
 *
 * 1. Remote mode (requires a running SurrealDB server):
 *    - Install: curl -sSf https://install.surrealdb.com | sh
 *    - Start: surreal start --user root --pass root memory
 *    - Set: SURREAL_URL=http://127.0.0.1:8000/rpc
 *
 * 2. Embedded mode (in-memory, no server needed):
 *    - Used for testing via createEmbeddedGraphDatabase()
 *    - Uses @surrealdb/node with mem:// protocol
 */

import { Surreal, RecordId, StringRecordId } from 'surrealdb'

export { RecordId, StringRecordId }

// Singleton instance
let db: Surreal | null = null
let isInitialized = false

/**
 * SurrealDB connection config for remote mode.
 * Default: http://127.0.0.1:8000/rpc
 */
const SURREAL_CONFIG = {
  url: process.env.SURREAL_URL || 'http://127.0.0.1:8000/rpc',
  namespace: process.env.SURREAL_NS || 'nxus',
  database: process.env.SURREAL_DB || 'main',
  username: process.env.SURREAL_USER || 'root',
  password: process.env.SURREAL_PASS || 'root',
}

/**
 * Initialize SurrealDB connection and schema (remote mode).
 * Connects to a running SurrealDB server.
 */
export async function initGraphDatabase(): Promise<Surreal> {
  if (db && isInitialized) return db

  db = new Surreal()

  try {
    const url = SURREAL_CONFIG.url

    console.log('[GraphDB] Connecting to SurrealDB at:', url)

    // Connect to SurrealDB server
    await db.connect(url)

    // Sign in (required for remote connections)
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
 * Create an embedded in-memory SurrealDB instance.
 * Used for testing — no external server needed.
 *
 * Requires @surrealdb/node as a devDependency.
 */
export async function createEmbeddedGraphDatabase(options?: {
  namespace?: string
  database?: string
  skipSchema?: boolean
}): Promise<Surreal> {
  // Dynamic import so @surrealdb/node is only loaded in test/dev
  const { createNodeEngines } = await import('@surrealdb/node')

  const instance = new Surreal({
    engines: createNodeEngines(),
  })

  await instance.connect('mem://')

  await instance.use({
    namespace: options?.namespace ?? 'test',
    database: options?.database ?? 'test',
  })

  if (!options?.skipSchema) {
    await initGraphSchema(instance)
  }

  return instance
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
 * Override the singleton instance (useful for injecting embedded DB in tests).
 */
export function setGraphDatabase(instance: Surreal): void {
  db = instance
  isInitialized = true
}

/**
 * Reset the singleton (for test cleanup).
 */
export function resetGraphDatabase(): void {
  db = null
  isInitialized = false
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
 * Parse a string record ID like "node:abc123" into a RecordId instance.
 * If already a RecordId, returns as-is.
 */
export function toRecordId(id: string | RecordId): RecordId | StringRecordId {
  if (id instanceof RecordId) return id
  if (typeof id === 'string' && id.includes(':')) {
    return new StringRecordId(id)
  }
  return id as unknown as RecordId
}

/**
 * Initialize the graph schema.
 * Defines tables, fields, and indexes for the node-based architecture.
 */
export async function initGraphSchema(db: Surreal): Promise<void> {
  // ============================================================================
  // Core Node Table
  // ============================================================================
  await db.query(`
    DEFINE TABLE OVERWRITE node SCHEMAFULL;

    -- Core fields
    DEFINE FIELD OVERWRITE content ON node TYPE option<string>;
    DEFINE FIELD OVERWRITE content_plain ON node TYPE option<string>;
    DEFINE FIELD OVERWRITE system_id ON node TYPE option<string>;
    DEFINE FIELD OVERWRITE created_at ON node TYPE datetime DEFAULT time::now();
    DEFINE FIELD OVERWRITE updated_at ON node TYPE datetime DEFAULT time::now();
    DEFINE FIELD OVERWRITE deleted_at ON node TYPE option<datetime>;

    -- Flexible properties (schemaless within this field)
    DEFINE FIELD OVERWRITE props ON node FLEXIBLE TYPE option<object>;

    -- Indexes
    DEFINE INDEX OVERWRITE idx_system_id ON node FIELDS system_id UNIQUE;
    DEFINE INDEX OVERWRITE idx_content_plain ON node FIELDS content_plain;
    DEFINE INDEX OVERWRITE idx_deleted ON node FIELDS deleted_at;
  `)

  // ============================================================================
  // Supertag Table (types/classes for nodes)
  // ============================================================================
  await db.query(`
    DEFINE TABLE OVERWRITE supertag SCHEMAFULL;

    DEFINE FIELD OVERWRITE name ON supertag TYPE string;
    DEFINE FIELD OVERWRITE system_id ON supertag TYPE option<string>;
    DEFINE FIELD OVERWRITE color ON supertag TYPE option<string>;
    DEFINE FIELD OVERWRITE icon ON supertag TYPE option<string>;
    DEFINE FIELD OVERWRITE created_at ON supertag TYPE datetime DEFAULT time::now();

    -- Schema definition for fields this supertag adds
    DEFINE FIELD OVERWRITE field_schema ON supertag FLEXIBLE TYPE option<array>;

    DEFINE INDEX OVERWRITE idx_supertag_system ON supertag FIELDS system_id UNIQUE;
    DEFINE INDEX OVERWRITE idx_supertag_name ON supertag FIELDS name;
  `)

  // ============================================================================
  // Relation Tables (Edges) - Semantic Relationships
  // ============================================================================

  // has_supertag: Node -> Supertag (type assignment)
  await db.query(`
    DEFINE TABLE OVERWRITE has_supertag SCHEMAFULL TYPE RELATION IN node OUT supertag;
    DEFINE FIELD OVERWRITE order ON has_supertag TYPE option<int> DEFAULT 0;
    DEFINE FIELD OVERWRITE created_at ON has_supertag TYPE datetime DEFAULT time::now();
  `)

  // extends: Supertag -> Supertag (inheritance)
  await db.query(`
    DEFINE TABLE OVERWRITE extends SCHEMAFULL TYPE RELATION IN supertag OUT supertag;
    DEFINE FIELD OVERWRITE created_at ON extends TYPE datetime DEFAULT time::now();
  `)

  // ============================================================================
  // Semantic Relations (Tana-style meaningful edges)
  // ============================================================================

  // part_of: Node -> Node (hierarchical composition)
  await db.query(`
    DEFINE TABLE OVERWRITE part_of SCHEMAFULL TYPE RELATION IN node OUT node;
    DEFINE FIELD OVERWRITE order ON part_of TYPE option<int> DEFAULT 0;
    DEFINE FIELD OVERWRITE created_at ON part_of TYPE datetime DEFAULT time::now();

    DEFINE INDEX OVERWRITE idx_part_of_out ON part_of FIELDS out;
  `)

  // dependency_of: Node -> Node (sequential dependency)
  await db.query(`
    DEFINE TABLE OVERWRITE dependency_of SCHEMAFULL TYPE RELATION IN node OUT node;
    DEFINE FIELD OVERWRITE created_at ON dependency_of TYPE datetime DEFAULT time::now();

    DEFINE INDEX OVERWRITE idx_dependency_out ON dependency_of FIELDS out;
  `)

  // references: Node -> Node (generic link)
  await db.query(`
    DEFINE TABLE OVERWRITE references SCHEMAFULL TYPE RELATION IN node OUT node;
    DEFINE FIELD OVERWRITE context ON references TYPE option<string>;
    DEFINE FIELD OVERWRITE created_at ON references TYPE datetime DEFAULT time::now();

    DEFINE INDEX OVERWRITE idx_references_out ON references FIELDS out;
  `)

  // tagged_with: Node -> Node (tag assignment, where tag is also a node)
  await db.query(`
    DEFINE TABLE OVERWRITE tagged_with SCHEMAFULL TYPE RELATION IN node OUT node;
    DEFINE FIELD OVERWRITE created_at ON tagged_with TYPE datetime DEFAULT time::now();

    DEFINE INDEX OVERWRITE idx_tagged_out ON tagged_with FIELDS out;
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

// Export config for reference
export { SURREAL_CONFIG }
