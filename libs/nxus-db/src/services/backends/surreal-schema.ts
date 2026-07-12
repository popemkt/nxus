/**
 * surreal-schema.ts - SurrealDB schema for field table and has_field edges
 *
 * Extends the graph schema with:
 * - `field` table: stores field definitions (system fields like path, description, etc.)
 * - `has_field` relation: connects nodes to fields with values (node->has_field->field)
 *
 * This is the graph equivalent of the SQLite `node_properties` table.
 * Instead of a flat property table, each property is a typed edge from a node
 * to a field definition, with the value stored on the edge.
 */

import type { Surreal } from 'surrealdb'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '../../schemas/node-schema.js'

/**
 * All common fields that should be bootstrapped in SurrealDB.
 *
 * Each entry maps a system_id (from SYSTEM_FIELDS) to a content name and value_type.
 * This mirrors the `commonFields` array in bootstrap.ts for SQLite.
 */
const SURREAL_FIELD_DEFINITIONS: Array<{
  systemId: string
  content: string
  valueType: string
}> = [
  // Core system fields
  { systemId: SYSTEM_FIELDS.SUPERTAG, content: 'supertag', valueType: 'nodes' },
  { systemId: SYSTEM_FIELDS.EXTENDS, content: 'extends', valueType: 'node' },
  { systemId: SYSTEM_FIELDS.FIELD_TYPE, content: 'fieldType', valueType: 'select' },
  { systemId: SYSTEM_FIELDS.BASE_TYPE, content: 'baseType', valueType: 'select' },

  // Common entity fields
  { systemId: SYSTEM_FIELDS.TYPE, content: 'type', valueType: 'select' },
  { systemId: SYSTEM_FIELDS.PATH, content: 'path', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.HOMEPAGE, content: 'homepage', valueType: 'url' },
  { systemId: SYSTEM_FIELDS.DESCRIPTION, content: 'description', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.COLOR, content: 'color', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.ICON, content: 'icon', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.LEGACY_ID, content: 'legacyId', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.CATEGORY, content: 'category', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.PLATFORM, content: 'platform', valueType: 'json' },
  { systemId: SYSTEM_FIELDS.DOCS, content: 'docs', valueType: 'json' },

  // Relation fields
  { systemId: SYSTEM_FIELDS.DEPENDENCIES, content: 'dependencies', valueType: 'nodes' },
  { systemId: SYSTEM_FIELDS.TAGS, content: 'tags', valueType: 'nodes' },
  { systemId: SYSTEM_FIELDS.COMMANDS, content: 'commands', valueType: 'nodes' },
  { systemId: SYSTEM_FIELDS.PARENT, content: 'parent', valueType: 'node' },
  { systemId: SYSTEM_FIELDS.ORDER, content: 'order', valueType: 'number' },
  { systemId: SYSTEM_FIELDS.MENTIONS, content: 'mentions', valueType: 'nodes' },

  // Tool-specific
  { systemId: SYSTEM_FIELDS.CHECK_COMMAND, content: 'checkCommand', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.INSTALL_INSTRUCTIONS, content: 'installInstructions', valueType: 'text' },

  // Command-specific
  { systemId: SYSTEM_FIELDS.COMMAND, content: 'command', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.COMMAND_ID, content: 'commandId', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.MODE, content: 'mode', valueType: 'select' },
  { systemId: SYSTEM_FIELDS.TARGET, content: 'target', valueType: 'select' },
  { systemId: SYSTEM_FIELDS.SCRIPT_SOURCE, content: 'scriptSource', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.CWD, content: 'cwd', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.PLATFORMS, content: 'platforms', valueType: 'json' },
  { systemId: SYSTEM_FIELDS.REQUIRES, content: 'requires', valueType: 'json' },
  { systemId: SYSTEM_FIELDS.OPTIONS, content: 'options', valueType: 'json' },
  { systemId: SYSTEM_FIELDS.PARAMS, content: 'params', valueType: 'json' },
  { systemId: SYSTEM_FIELDS.REQUIREMENTS, content: 'requirements', valueType: 'json' },
  { systemId: SYSTEM_FIELDS.WORKFLOW, content: 'workflow', valueType: 'json' },

  // Inbox-specific
  { systemId: SYSTEM_FIELDS.STATUS, content: 'status', valueType: 'select' },
  { systemId: SYSTEM_FIELDS.NOTES, content: 'notes', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.TITLE, content: 'title', valueType: 'text' },

  // Query-specific
  { systemId: SYSTEM_FIELDS.QUERY_DEFINITION, content: 'queryDefinition', valueType: 'json' },
  { systemId: SYSTEM_FIELDS.QUERY_SORT, content: 'querySort', valueType: 'json' },
  { systemId: SYSTEM_FIELDS.QUERY_LIMIT, content: 'queryLimit', valueType: 'number' },
  { systemId: SYSTEM_FIELDS.QUERY_RESULT_CACHE, content: 'queryResultCache', valueType: 'json' },
  { systemId: SYSTEM_FIELDS.QUERY_EVALUATED_AT, content: 'queryEvaluatedAt', valueType: 'text' },

  // Calendar-specific
  { systemId: SYSTEM_FIELDS.START_DATE, content: 'start_date', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.END_DATE, content: 'end_date', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.ALL_DAY, content: 'all_day', valueType: 'boolean' },
  { systemId: SYSTEM_FIELDS.RRULE, content: 'rrule', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.GCAL_EVENT_ID, content: 'gcal_event_id', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.GCAL_SYNCED_AT, content: 'gcal_synced_at', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.REMINDER, content: 'reminder', valueType: 'number' },

  // Google Calendar OAuth fields
  { systemId: SYSTEM_FIELDS.GCAL_ACCESS_TOKEN, content: 'gcal_access_token', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.GCAL_REFRESH_TOKEN, content: 'gcal_refresh_token', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.GCAL_TOKEN_EXPIRY, content: 'gcal_token_expiry', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.GCAL_USER_EMAIL, content: 'gcal_user_email', valueType: 'text' },
  { systemId: SYSTEM_FIELDS.GCAL_CALENDAR_ID, content: 'gcal_calendar_id', valueType: 'text' },
]

/**
 * Initialize the `field` table and `has_field` relation in SurrealDB.
 *
 * - `field` table: stores field definitions with system_id, content name, and value_type
 * - `has_field` relation: typed edge from node to field carrying the property value
 */
export async function initFieldSchema(db: Surreal): Promise<void> {
  // Field table — stores field definitions
  await db.query(`
    DEFINE TABLE OVERWRITE field SCHEMAFULL;

    DEFINE FIELD OVERWRITE content ON field TYPE string;
    DEFINE FIELD OVERWRITE system_id ON field TYPE string;
    DEFINE FIELD OVERWRITE value_type ON field TYPE option<string>;
    DEFINE FIELD OVERWRITE default_value ON field TYPE option<object> FLEXIBLE;
    DEFINE FIELD OVERWRITE created_at ON field TYPE datetime DEFAULT time::now();

    DEFINE INDEX OVERWRITE idx_field_system_id ON field FIELDS system_id UNIQUE;
  `)

  // has_field relation — carries property values on the edge
  // Uses SCHEMALESS to allow the `value` field to hold any type (string, number, bool, object, array)
  // while still enforcing the relation type constraint (IN node OUT field)
  await db.query(`
    DEFINE TABLE OVERWRITE has_field TYPE RELATION IN node OUT field;

    DEFINE FIELD OVERWRITE \`order\` ON has_field TYPE option<int> DEFAULT 0;
    DEFINE FIELD OVERWRITE created_at ON has_field TYPE datetime DEFAULT time::now();
    DEFINE FIELD OVERWRITE updated_at ON has_field TYPE datetime DEFAULT time::now();

    DEFINE INDEX OVERWRITE idx_has_field_in ON has_field FIELDS in;
    DEFINE INDEX OVERWRITE idx_has_field_out ON has_field FIELDS out;
    DEFINE INDEX OVERWRITE idx_has_field_in_out ON has_field FIELDS in, out;
  `)
}

/**
 * Bootstrap system field definitions in SurrealDB.
 *
 * Creates a `field` record for each system field (path, description, status, etc.).
 * Uses UPSERT for idempotency — safe to call multiple times.
 */
export async function bootstrapSurrealFields(db: Surreal): Promise<void> {
  for (const def of SURREAL_FIELD_DEFINITIONS) {
    // Derive a stable record ID from the system_id (e.g., 'field:path' → field:path)
    // The system_id already has the 'field:' prefix, which matches SurrealDB's record ID format
    const recordKey = def.systemId.replace(':', '_')
    await db.query(
      `UPSERT field:${recordKey} SET
        content = $content,
        system_id = $systemId,
        value_type = $valueType,
        created_at = time::now()`,
      {
        content: def.content,
        systemId: def.systemId,
        valueType: def.valueType,
      },
    )
  }
}

/**
 * System entity supertags that must exist as first-class `node` records
 * (not just `supertag` catalog rows) — mirrors bootstrap.ts's
 * `entitySupertags` list (SQLite side). Calendar entries additionally
 * carry a `field:base_type` value so `getNodesBySupertagBaseType` can
 * find them.
 *
 * Without a `node` row here, `resolveSupertagId`'s self-heal fallback has
 * nothing to mirror into the `supertag` catalog table, and any create
 * that references the supertag by system id fails fast (STAG-B2) — which
 * is how the missing #Inbox row aborted the graph seed on 2026-07-12.
 *
 * Not yet mirrored from SQLite: the `extends` chains (tool/repo/concept →
 * item). Graph `extends` edges relate supertag CATALOG rows; wiring them
 * here needs catalog-row resolution first — tracked in persistence.md
 * (graph bootstrap parity).
 */
const SYSTEM_ENTITY_SUPERTAGS: Array<{
  systemId: string
  content: string
  baseType?: string
}> = [
  { systemId: SYSTEM_SUPERTAGS.ITEM, content: '#Item' },
  { systemId: SYSTEM_SUPERTAGS.TOOL, content: '#Tool' },
  { systemId: SYSTEM_SUPERTAGS.REPO, content: '#Repo' },
  { systemId: SYSTEM_SUPERTAGS.CONCEPT, content: '#Concept' },
  { systemId: SYSTEM_SUPERTAGS.TAG, content: '#Tag' },
  { systemId: SYSTEM_SUPERTAGS.COMMAND, content: '#Command' },
  { systemId: SYSTEM_SUPERTAGS.WORKSPACE, content: '#Workspace' },
  { systemId: SYSTEM_SUPERTAGS.INBOX, content: '#Inbox' },
  { systemId: SYSTEM_SUPERTAGS.QUERY, content: '#Query' },
  { systemId: SYSTEM_SUPERTAGS.AUTOMATION, content: '#Automation' },
  { systemId: SYSTEM_SUPERTAGS.COMPUTED_FIELD, content: '#ComputedField' },
  { systemId: SYSTEM_SUPERTAGS.TASK, content: '#Task', baseType: 'task' },
  { systemId: SYSTEM_SUPERTAGS.EVENT, content: '#Event', baseType: 'event' },
  { systemId: SYSTEM_SUPERTAGS.DAY, content: '#Day', baseType: 'day' },
  { systemId: SYSTEM_SUPERTAGS.RECALL_TOPIC, content: '#RecallTopic' },
  { systemId: SYSTEM_SUPERTAGS.RECALL_CONCEPT, content: '#RecallConcept' },
  { systemId: SYSTEM_SUPERTAGS.RECALL_REVIEW_LOG, content: '#RecallReviewLog' },
  { systemId: SYSTEM_SUPERTAGS.RECALL_BLOOM_LEVEL, content: '#BloomLevel' },
  { systemId: SYSTEM_SUPERTAGS.RECALL_SESSION, content: '#RecallSession' },
]

/**
 * Bootstrap system entity supertag definitions as `node` records (plus a
 * `field:base_type` edge where the definition carries one). Must run AFTER
 * `initFieldSchema` + `bootstrapSurrealFields` (needs `field:base_type` to
 * already exist). Idempotent — UPSERT for the node row, DELETE+RELATE for
 * the has_field edge.
 */
export async function bootstrapSystemEntitySupertags(db: Surreal): Promise<void> {
  const baseTypeFieldRecordKey = SYSTEM_FIELDS.BASE_TYPE.replace(':', '_')
  const baseTypeFieldRecordId = `field:${baseTypeFieldRecordKey}`

  for (const def of SYSTEM_ENTITY_SUPERTAGS) {
    const recordKey = def.systemId.replace(/[:-]/g, '_')
    const nodeRecordId = `node:${recordKey}`

    await db.query(
      `UPSERT ${nodeRecordId} SET
        content = $content,
        content_plain = $contentPlain,
        system_id = $systemId,
        props = {},
        created_at = time::now(),
        updated_at = time::now()`,
      {
        content: def.content,
        contentPlain: def.content.toLowerCase(),
        systemId: def.systemId,
      },
    )

    if (!def.baseType) continue

    // DELETE + RELATE keeps this idempotent across repeated bootstrap runs
    // (RELATE always inserts a new edge; UPSERT semantics don't apply to
    // relation tables the same way they do to normal tables).
    await db.query(
      `DELETE has_field WHERE in = ${nodeRecordId} AND out = ${baseTypeFieldRecordId}`,
    )
    await db.query(
      `RELATE ${nodeRecordId}->has_field->${baseTypeFieldRecordId} SET
        \`value\` = $baseType, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
      { baseType: def.baseType },
    )
  }
}

/** Exported for testing and reuse */
export { SURREAL_FIELD_DEFINITIONS, SYSTEM_ENTITY_SUPERTAGS }
