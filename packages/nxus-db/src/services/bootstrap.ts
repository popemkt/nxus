/**
 * bootstrap.ts - Core system node bootstrap for @nxus/db
 *
 * Creates the foundational meta-supertags, system supertags, and field definitions
 * that are required for the node-based architecture to function.
 *
 * This should be called BEFORE any app-specific seeding.
 */

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { uuidv7 } from 'uuidv7';
import type * as schema from '../schemas/item-schema.js';
import {
  nodeProperties,
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
} from '../schemas/node-schema.js';

type DatabaseInstance = BetterSQLite3Database<typeof schema>;

// UUID cache for system nodes (systemId -> UUID)
const systemNodeIds = new Map<string, string>();

/**
 * Get or create UUID for a system node
 */
function getSystemNodeId(systemId: string): string {
  if (!systemNodeIds.has(systemId)) {
    systemNodeIds.set(systemId, uuidv7());
  }
  return systemNodeIds.get(systemId)!;
}

/**
 * Upsert a node by systemId
 */
function upsertSystemNode(
  db: DatabaseInstance,
  systemId: string,
  content: string,
  verbose = false,
): string {
  const existing = db
    .select()
    .from(nodes)
    .where(eq(nodes.systemId, systemId))
    .get();

  if (existing) {
    systemNodeIds.set(systemId, existing.id);
    if (verbose) console.log(`  ✓ Found existing: ${content}`);
    return existing.id;
  }

  const id = getSystemNodeId(systemId);
  db.insert(nodes)
    .values({
      id,
      content,
      contentPlain: content.toLowerCase(),
      systemId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
  if (verbose) console.log(`  + Created: ${content}`);
  return id;
}

/**
 * Add a property to a node (upsert by node+field)
 */
function setProperty(
  db: DatabaseInstance,
  nodeId: string,
  fieldNodeId: string,
  value: string,
  order: number = 0,
): void {
  const existing = db
    .select()
    .from(nodeProperties)
    .where(eq(nodeProperties.nodeId, nodeId))
    .all()
    .find((p) => p.fieldNodeId === fieldNodeId && p.value === value);

  if (!existing) {
    db.insert(nodeProperties)
      .values({
        nodeId,
        fieldNodeId,
        value,
        order,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .run();
  }
}

/**
 * Assign a supertag to a node (via field:supertag property)
 */
function assignSupertag(
  db: DatabaseInstance,
  nodeId: string,
  supertagNodeId: string,
  supertagFieldId: string,
  order: number = 0,
): void {
  setProperty(
    db,
    nodeId,
    supertagFieldId,
    JSON.stringify(supertagNodeId),
    order,
  );
}

export interface BootstrapOptions {
  /** Whether to print progress to console */
  verbose?: boolean;
  /** Skip initialization if db is already initialized (deprecated - use db parameter instead) */
  skipInit?: boolean;
  /** Database instance to use (if not provided, will call initDatabase) */
  db?: DatabaseInstance;
}

export interface BootstrapResult {
  nodeCount: number;
  propertyCount: number;
  alreadyBootstrapped: boolean;
}

/**
 * Check if the system has already been bootstrapped
 * @param db - Database instance (required to avoid circular dependency)
 */
export function isBootstrapped(db: DatabaseInstance): boolean {
  const supertagField = db
    .select()
    .from(nodes)
    .where(eq(nodes.systemId, SYSTEM_FIELDS.SUPERTAG))
    .get();
  return !!supertagField;
}

/**
 * Bootstrap system nodes required for node-based architecture (synchronous version)
 *
 * Creates:
 * - Core system fields (field:supertag, field:extends, field:field_type)
 * - Meta-supertags (#Supertag, #Field, #System)
 * - Entity supertags (#Item, #Tool, #Repo, #Tag, #Command, #Workspace, #Inbox)
 * - Common field definitions (type, path, description, etc.)
 *
 * This is idempotent - calling it multiple times is safe.
 *
 * @param db - Database instance (required)
 * @param options - Bootstrap options
 */
export function bootstrapSystemNodesSync(
  db: DatabaseInstance,
  options: Omit<BootstrapOptions, 'db' | 'skipInit'> = {},
): BootstrapResult {
  const { verbose = false } = options;

  // Check if already bootstrapped
  const alreadyBootstrapped = isBootstrapped(db);
  if (alreadyBootstrapped) {
    if (verbose) {
      console.log('System already bootstrapped, ensuring all fields exist...');
    }
    // Continue to ensure all fields exist (incremental updates)
  }

  if (verbose) {
    console.log('\n' + '='.repeat(50));
    console.log('  Bootstrap Nodes: Creating System Schema');
    console.log('  (Simplified 2-table model)');
    console.log('='.repeat(50) + '\n');
    console.log('[1/5] Creating core system fields...');
  }

  // ============================================================================
  // Step 1: Create field:supertag first (chicken-and-egg bootstrap)
  // ============================================================================
  const supertagFieldId = upsertSystemNode(
    db,
    SYSTEM_FIELDS.SUPERTAG,
    'supertag',
    verbose,
  );
  const extendsFieldId = upsertSystemNode(
    db,
    SYSTEM_FIELDS.EXTENDS,
    'extends',
    verbose,
  );
  const fieldTypeFieldId = upsertSystemNode(
    db,
    SYSTEM_FIELDS.FIELD_TYPE,
    'fieldType',
    verbose,
  );

  // ============================================================================
  // Step 2: Create meta-supertags
  // ============================================================================
  if (verbose) console.log('\n[2/5] Creating meta-supertags...');

  const supertagId = upsertSystemNode(
    db,
    SYSTEM_SUPERTAGS.SUPERTAG,
    '#Supertag',
    verbose,
  );
  const fieldId = upsertSystemNode(
    db,
    SYSTEM_SUPERTAGS.FIELD,
    '#Field',
    verbose,
  );
  const systemId = upsertSystemNode(
    db,
    SYSTEM_SUPERTAGS.SYSTEM,
    '#System',
    verbose,
  );

  // Self-referential: #Supertag has supertag #Supertag
  assignSupertag(db, supertagId, supertagId, supertagFieldId);
  assignSupertag(db, fieldId, supertagId, supertagFieldId);
  assignSupertag(db, systemId, supertagId, supertagFieldId);

  // Mark all as system
  assignSupertag(db, supertagId, systemId, supertagFieldId, 1);
  assignSupertag(db, fieldId, systemId, supertagFieldId, 1);
  assignSupertag(db, systemId, systemId, supertagFieldId, 1);

  // The core fields are #Field #System
  assignSupertag(db, supertagFieldId, fieldId, supertagFieldId);
  assignSupertag(db, supertagFieldId, systemId, supertagFieldId, 1);
  assignSupertag(db, extendsFieldId, fieldId, supertagFieldId);
  assignSupertag(db, extendsFieldId, systemId, supertagFieldId, 1);
  assignSupertag(db, fieldTypeFieldId, fieldId, supertagFieldId);
  assignSupertag(db, fieldTypeFieldId, systemId, supertagFieldId, 1);

  // Set field types
  setProperty(db, supertagFieldId, fieldTypeFieldId, JSON.stringify('nodes'));
  setProperty(db, extendsFieldId, fieldTypeFieldId, JSON.stringify('node'));
  setProperty(db, fieldTypeFieldId, fieldTypeFieldId, JSON.stringify('select'));

  // ============================================================================
  // Step 3: Create entity supertags
  // ============================================================================
  if (verbose) console.log('\n[3/5] Creating entity supertags...');

  const entitySupertags = [
    { systemId: SYSTEM_SUPERTAGS.ITEM, content: '#Item', extends: null },
    {
      systemId: SYSTEM_SUPERTAGS.TOOL,
      content: '#Tool',
      extends: SYSTEM_SUPERTAGS.ITEM,
    },
    {
      systemId: SYSTEM_SUPERTAGS.REPO,
      content: '#Repo',
      extends: SYSTEM_SUPERTAGS.ITEM,
    },
    { systemId: SYSTEM_SUPERTAGS.TAG, content: '#Tag', extends: null },
    { systemId: SYSTEM_SUPERTAGS.COMMAND, content: '#Command', extends: null },
    {
      systemId: SYSTEM_SUPERTAGS.WORKSPACE,
      content: '#Workspace',
      extends: null,
    },
    { systemId: SYSTEM_SUPERTAGS.INBOX, content: '#Inbox', extends: null },
    { systemId: SYSTEM_SUPERTAGS.QUERY, content: '#Query', extends: null },
  ];

  for (const st of entitySupertags) {
    const id = upsertSystemNode(db, st.systemId, st.content, verbose);
    assignSupertag(db, id, supertagId, supertagFieldId);
    assignSupertag(db, id, systemId, supertagFieldId, 1);
    if (st.extends) {
      const parentId = systemNodeIds.get(st.extends);
      if (parentId) {
        setProperty(db, id, extendsFieldId, JSON.stringify(parentId));
      }
    }
  }

  // ============================================================================
  // Step 4: Create common field definitions
  // ============================================================================
  if (verbose) console.log('\n[4/5] Creating common fields...');

  const commonFields = [
    { systemId: SYSTEM_FIELDS.TYPE, content: 'type', fieldType: 'select' },
    { systemId: SYSTEM_FIELDS.PATH, content: 'path', fieldType: 'text' },
    { systemId: SYSTEM_FIELDS.HOMEPAGE, content: 'homepage', fieldType: 'url' },
    {
      systemId: SYSTEM_FIELDS.DESCRIPTION,
      content: 'description',
      fieldType: 'text',
    },
    { systemId: SYSTEM_FIELDS.COLOR, content: 'color', fieldType: 'text' },
    { systemId: SYSTEM_FIELDS.ICON, content: 'icon', fieldType: 'text' },
    {
      systemId: SYSTEM_FIELDS.LEGACY_ID,
      content: 'legacyId',
      fieldType: 'text',
    },
    {
      systemId: SYSTEM_FIELDS.DEPENDENCIES,
      content: 'dependencies',
      fieldType: 'nodes',
    },
    { systemId: SYSTEM_FIELDS.TAGS, content: 'tags', fieldType: 'nodes' },
    {
      systemId: SYSTEM_FIELDS.COMMANDS,
      content: 'commands',
      fieldType: 'nodes',
    },
    { systemId: SYSTEM_FIELDS.PARENT, content: 'parent', fieldType: 'node' },
    {
      systemId: SYSTEM_FIELDS.CHECK_COMMAND,
      content: 'checkCommand',
      fieldType: 'text',
    },
    {
      systemId: SYSTEM_FIELDS.INSTALL_INSTRUCTIONS,
      content: 'installInstructions',
      fieldType: 'text',
    },
    {
      systemId: SYSTEM_FIELDS.CATEGORY,
      content: 'category',
      fieldType: 'text',
    },
    {
      systemId: SYSTEM_FIELDS.PLATFORM,
      content: 'platform',
      fieldType: 'json',
    },
    { systemId: SYSTEM_FIELDS.DOCS, content: 'docs', fieldType: 'json' },
    // Command-specific
    { systemId: SYSTEM_FIELDS.COMMAND, content: 'command', fieldType: 'text' },
    {
      systemId: SYSTEM_FIELDS.COMMAND_ID,
      content: 'commandId',
      fieldType: 'text',
    },
    { systemId: SYSTEM_FIELDS.MODE, content: 'mode', fieldType: 'select' },
    { systemId: SYSTEM_FIELDS.TARGET, content: 'target', fieldType: 'select' },
    {
      systemId: SYSTEM_FIELDS.SCRIPT_SOURCE,
      content: 'scriptSource',
      fieldType: 'text',
    },
    { systemId: SYSTEM_FIELDS.CWD, content: 'cwd', fieldType: 'text' },
    {
      systemId: SYSTEM_FIELDS.PLATFORMS,
      content: 'platforms',
      fieldType: 'json',
    },
    {
      systemId: SYSTEM_FIELDS.REQUIRES,
      content: 'requires',
      fieldType: 'json',
    },
    { systemId: SYSTEM_FIELDS.OPTIONS, content: 'options', fieldType: 'json' },
    { systemId: SYSTEM_FIELDS.PARAMS, content: 'params', fieldType: 'json' },
    {
      systemId: SYSTEM_FIELDS.REQUIREMENTS,
      content: 'requirements',
      fieldType: 'json',
    },
    {
      systemId: SYSTEM_FIELDS.WORKFLOW,
      content: 'workflow',
      fieldType: 'json',
    },
    // Inbox-specific
    { systemId: SYSTEM_FIELDS.STATUS, content: 'status', fieldType: 'select' },
    { systemId: SYSTEM_FIELDS.NOTES, content: 'notes', fieldType: 'text' },
    { systemId: SYSTEM_FIELDS.TITLE, content: 'title', fieldType: 'text' },
    // Query-specific (for saved queries with supertag:query)
    {
      systemId: SYSTEM_FIELDS.QUERY_DEFINITION,
      content: 'queryDefinition',
      fieldType: 'json',
    },
    {
      systemId: SYSTEM_FIELDS.QUERY_SORT,
      content: 'querySort',
      fieldType: 'json',
    },
    {
      systemId: SYSTEM_FIELDS.QUERY_LIMIT,
      content: 'queryLimit',
      fieldType: 'number',
    },
    {
      systemId: SYSTEM_FIELDS.QUERY_RESULT_CACHE,
      content: 'queryResultCache',
      fieldType: 'json',
    },
    {
      systemId: SYSTEM_FIELDS.QUERY_EVALUATED_AT,
      content: 'queryEvaluatedAt',
      fieldType: 'text',
    },
  ];

  for (const field of commonFields) {
    const id = upsertSystemNode(db, field.systemId, field.content, verbose);
    assignSupertag(db, id, fieldId, supertagFieldId);
    assignSupertag(db, id, systemId, supertagFieldId, 1);
    setProperty(db, id, fieldTypeFieldId, JSON.stringify(field.fieldType));
  }

  // ============================================================================
  // Summary
  // ============================================================================
  const nodeCount = db.select().from(nodes).all().length;
  const propertyCount = db.select().from(nodeProperties).all().length;

  if (verbose) {
    console.log('\n' + '='.repeat(50));
    console.log('Bootstrap complete!');
    console.log(`   Nodes: ${nodeCount}`);
    console.log(`   Properties: ${propertyCount}`);
    console.log('='.repeat(50) + '\n');
  }

  return { nodeCount, propertyCount, alreadyBootstrapped: false };
}

/**
 * Bootstrap system nodes required for node-based architecture (async version)
 *
 * This is a convenience wrapper that handles database initialization.
 * Use this when you don't already have a database instance.
 */
export async function bootstrapSystemNodes(
  options: BootstrapOptions = {},
): Promise<BootstrapResult> {
  const { verbose = false, skipInit = false, db: providedDb } = options;

  // Get or initialize database
  let db: DatabaseInstance;
  if (providedDb) {
    db = providedDb;
  } else {
    // Lazy import to avoid circular dependency
    const { initDatabase, getDatabase } = await import(
      '../client/master-client.js'
    );
    if (!skipInit) {
      initDatabase();
    }
    db = getDatabase();
  }

  return bootstrapSystemNodesSync(db, { verbose });
}
