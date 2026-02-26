import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

// ============================================================================
// Node-Based Architecture Schema (Simplified)
// Just 2 tables: nodes + node_properties
// Everything is encoded through field values, including supertags!
// ============================================================================

/**
 * Nodes - Universal container for all entities
 *
 * Every entity is a node. What makes a node special is determined by
 * its properties - specifically the "supertag" field values.
 */
export const nodes = sqliteTable(
  'nodes',
  {
    id: text('id').primaryKey(), // UUID
    content: text('content'), // Primary display text
    contentPlain: text('content_plain'), // Lowercase for FTS
    systemId: text('system_id').unique(), // For system nodes: "supertag:item", "field:type"
    ownerId: text('owner_id'), // Parent node (for hierarchy)
    createdAt: integer('created_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
    deletedAt: integer('deleted_at', { mode: 'timestamp' }),
  },
  (t) => [
    index('idx_nodes_system_id').on(t.systemId),
    index('idx_nodes_owner_id').on(t.ownerId),
    index('idx_nodes_content_plain').on(t.contentPlain),
  ],
)

export type Node = typeof nodes.$inferSelect
export type NewNode = typeof nodes.$inferInsert

/**
 * NodeProperties - All field values, including relationships
 *
 * This single table encodes:
 * - Scalar values (text, number, date, etc.)
 * - Supertag assignments (field:supertag → node UUID)
 * - Inheritance (field:extends → parent supertag UUID)
 * - References/relationships (any field with node type → UUID)
 *
 * Backlinks: Query where value = target UUID and field type is node/nodes
 */
export const nodeProperties = sqliteTable(
  'node_properties',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    nodeId: text('node_id').notNull(), // The node this property belongs to
    fieldNodeId: text('field_node_id').notNull(), // The field definition (also a node)
    value: text('value'), // JSON-encoded: string, number, UUID, or UUID[]
    order: integer('order').default(0), // For multi-value ordering
    createdAt: integer('created_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (t) => [
    index('idx_node_properties_node').on(t.nodeId),
    index('idx_node_properties_field').on(t.fieldNodeId),
    index('idx_node_properties_value').on(t.value), // For backlink queries!
  ],
)

export type NodeProperty = typeof nodeProperties.$inferSelect
export type NewNodeProperty = typeof nodeProperties.$inferInsert

// ============================================================================
// Branded types for field identifiers
// ============================================================================

declare const __fieldSystemId: unique symbol
declare const __fieldContentName: unique symbol

/**
 * A field systemId like 'field:parent', 'field:status'.
 * Used for write operations (setProperty, addPropertyValue, etc.)
 * and for DB-level field resolution via getFieldOrSupertagNode().
 */
export type FieldSystemId = string & { readonly [__fieldSystemId]: true }

/**
 * A field content/display name like 'parent', 'legacyId'.
 * Used for reading from AssembledNode.properties (keyed by field content).
 * Use FIELD_NAMES constants instead of raw strings.
 */
export type FieldContentName = string & { readonly [__fieldContentName]: true }

// ============================================================================
// System Node Constants (systemId values)
// ============================================================================

export const SYSTEM_SUPERTAGS = {
  // Meta-supertags
  SUPERTAG: 'supertag:supertag',
  FIELD: 'supertag:field',
  SYSTEM: 'supertag:system',

  // Entity supertags
  ITEM: 'supertag:item',
  TOOL: 'supertag:tool',
  REPO: 'supertag:repo',
  TAG: 'supertag:tag',
  COMMAND: 'supertag:command',
  WORKSPACE: 'supertag:workspace',
  INBOX: 'supertag:inbox',

  CONCEPT: 'supertag:concept',

  // Query supertag - for saved queries (Tana-like reactive queries)
  QUERY: 'supertag:query',

  // Automation supertag - for reactive automation rules
  AUTOMATION: 'supertag:automation',

  // Computed field supertag - for reactive computed/aggregated fields
  COMPUTED_FIELD: 'supertag:computed_field',

  // Calendar supertags - for schedule management
  TASK: 'supertag:task', // Nodes that are tasks (completable items)
  EVENT: 'supertag:event', // Nodes that are calendar events
} as const

/**
 * System query IDs — for persisted query nodes discoverable in the workbench.
 * Each maps to a node with `#Query` supertag and a `field:query_definition` property.
 */
export const SYSTEM_QUERIES = {
  INBOX_ALL: 'query:inbox-all',
  INBOX_PENDING: 'query:inbox-pending',
  INBOX_PROCESSING: 'query:inbox-processing',
  INBOX_DONE: 'query:inbox-done',
} as const

/**
 * System field IDs — used for write operations (setProperty, addPropertyValue, etc.).
 * Values are typed as FieldSystemId to prevent accidental use with getProperty/node.properties.
 * For read operations, use FIELD_NAMES instead.
 */
export const SYSTEM_FIELDS = {
  // Core system fields
  SUPERTAG: 'field:supertag' as FieldSystemId, // Links node to its supertag(s)
  EXTENDS: 'field:extends' as FieldSystemId, // Supertag inheritance
  FIELD_TYPE: 'field:field_type' as FieldSystemId, // Type of a field (text, node, nodes, etc.)

  // Common entity fields
  TYPE: 'field:type' as FieldSystemId,
  PATH: 'field:path' as FieldSystemId,
  HOMEPAGE: 'field:homepage' as FieldSystemId,
  DESCRIPTION: 'field:description' as FieldSystemId,
  COLOR: 'field:color' as FieldSystemId,
  ICON: 'field:icon' as FieldSystemId,
  LEGACY_ID: 'field:legacy_id' as FieldSystemId, // For migration: stores old ID
  CATEGORY: 'field:category' as FieldSystemId,
  PLATFORM: 'field:platform' as FieldSystemId, // platforms array
  DOCS: 'field:docs' as FieldSystemId, // docs JSON array

  // Relation fields
  DEPENDENCIES: 'field:dependencies' as FieldSystemId,
  TAGS: 'field:tags' as FieldSystemId,
  COMMANDS: 'field:commands' as FieldSystemId,
  PARENT: 'field:parent' as FieldSystemId,
  ORDER: 'field:order' as FieldSystemId,

  // Tool-specific
  CHECK_COMMAND: 'field:check_command' as FieldSystemId,
  INSTALL_INSTRUCTIONS: 'field:install_instructions' as FieldSystemId,

  // Command-specific
  COMMAND: 'field:command' as FieldSystemId,
  COMMAND_ID: 'field:command_id' as FieldSystemId,
  MODE: 'field:mode' as FieldSystemId,
  TARGET: 'field:target' as FieldSystemId,
  SCRIPT_SOURCE: 'field:script_source' as FieldSystemId,
  CWD: 'field:cwd' as FieldSystemId,
  PLATFORMS: 'field:platforms' as FieldSystemId, // command platforms
  REQUIRES: 'field:requires' as FieldSystemId,
  OPTIONS: 'field:options' as FieldSystemId,
  PARAMS: 'field:params' as FieldSystemId,
  REQUIREMENTS: 'field:requirements' as FieldSystemId,
  WORKFLOW: 'field:workflow' as FieldSystemId,

  // Inbox-specific
  STATUS: 'field:status' as FieldSystemId,
  NOTES: 'field:notes' as FieldSystemId,
  TITLE: 'field:title' as FieldSystemId,
  ARCHIVED_AT: 'field:archived_at' as FieldSystemId,

  // Query-specific fields (for saved queries with supertag:query)
  QUERY_DEFINITION: 'field:query_definition' as FieldSystemId,
  QUERY_SORT: 'field:query_sort' as FieldSystemId,
  QUERY_LIMIT: 'field:query_limit' as FieldSystemId,
  QUERY_RESULT_CACHE: 'field:query_result_cache' as FieldSystemId,
  QUERY_EVALUATED_AT: 'field:query_evaluated_at' as FieldSystemId,

  // Automation-specific fields
  AUTOMATION_DEFINITION: 'field:automation_definition' as FieldSystemId,
  AUTOMATION_STATE: 'field:automation_state' as FieldSystemId,
  AUTOMATION_LAST_FIRED: 'field:automation_last_fired' as FieldSystemId,
  AUTOMATION_ENABLED: 'field:automation_enabled' as FieldSystemId,

  // Computed field-specific fields
  COMPUTED_FIELD_DEFINITION: 'field:computed_field_definition' as FieldSystemId,
  COMPUTED_FIELD_VALUE: 'field:computed_field_value' as FieldSystemId,
  COMPUTED_FIELD_UPDATED_AT: 'field:computed_field_updated_at' as FieldSystemId,

  // Calendar-specific fields
  START_DATE: 'field:start_date' as FieldSystemId,
  END_DATE: 'field:end_date' as FieldSystemId,
  ALL_DAY: 'field:all_day' as FieldSystemId,
  RRULE: 'field:rrule' as FieldSystemId,
  GCAL_EVENT_ID: 'field:gcal_event_id' as FieldSystemId,
  GCAL_SYNCED_AT: 'field:gcal_synced_at' as FieldSystemId,
  REMINDER: 'field:reminder' as FieldSystemId,

  // Google Calendar OAuth fields (stored on settings node)
  GCAL_ACCESS_TOKEN: 'field:gcal_access_token' as FieldSystemId,
  GCAL_REFRESH_TOKEN: 'field:gcal_refresh_token' as FieldSystemId,
  GCAL_TOKEN_EXPIRY: 'field:gcal_token_expiry' as FieldSystemId,
  GCAL_USER_EMAIL: 'field:gcal_user_email' as FieldSystemId,
  GCAL_CALENDAR_ID: 'field:gcal_calendar_id' as FieldSystemId,
} as const

/**
 * Field content names — used for read operations (getProperty, node.properties[]).
 * Values are the field node's `content` value as seeded in bootstrap.
 * Each entry matches a SYSTEM_FIELDS entry (same key, different value).
 *
 * SYSTEM_FIELDS.PARENT = 'field:parent' (for writes)
 * FIELD_NAMES.PARENT   = 'parent'       (for reads)
 */
export const FIELD_NAMES = {
  // Core system fields
  SUPERTAG: 'Supertag' as FieldContentName,
  EXTENDS: 'Extends' as FieldContentName,
  FIELD_TYPE: 'Field Type' as FieldContentName,

  // Common entity fields
  TYPE: 'type' as FieldContentName,
  PATH: 'path' as FieldContentName,
  HOMEPAGE: 'homepage' as FieldContentName,
  DESCRIPTION: 'description' as FieldContentName,
  COLOR: 'color' as FieldContentName,
  ICON: 'icon' as FieldContentName,
  LEGACY_ID: 'legacyId' as FieldContentName,
  CATEGORY: 'category' as FieldContentName,
  PLATFORM: 'platform' as FieldContentName,
  DOCS: 'docs' as FieldContentName,

  // Relation fields
  DEPENDENCIES: 'dependencies' as FieldContentName,
  TAGS: 'tags' as FieldContentName,
  COMMANDS: 'commands' as FieldContentName,
  PARENT: 'parent' as FieldContentName,
  ORDER: 'order' as FieldContentName,

  // Tool-specific
  CHECK_COMMAND: 'checkCommand' as FieldContentName,
  INSTALL_INSTRUCTIONS: 'installInstructions' as FieldContentName,

  // Command-specific
  COMMAND: 'command' as FieldContentName,
  COMMAND_ID: 'commandId' as FieldContentName,
  MODE: 'mode' as FieldContentName,
  TARGET: 'target' as FieldContentName,
  SCRIPT_SOURCE: 'scriptSource' as FieldContentName,
  CWD: 'cwd' as FieldContentName,
  PLATFORMS: 'platforms' as FieldContentName,
  REQUIRES: 'requires' as FieldContentName,
  OPTIONS: 'options' as FieldContentName,
  PARAMS: 'params' as FieldContentName,
  REQUIREMENTS: 'requirements' as FieldContentName,
  WORKFLOW: 'workflow' as FieldContentName,

  // Inbox-specific
  STATUS: 'status' as FieldContentName,
  NOTES: 'notes' as FieldContentName,
  TITLE: 'title' as FieldContentName,
  ARCHIVED_AT: 'archivedAt' as FieldContentName,

  // Query-specific fields
  QUERY_DEFINITION: 'queryDefinition' as FieldContentName,
  QUERY_SORT: 'querySort' as FieldContentName,
  QUERY_LIMIT: 'queryLimit' as FieldContentName,
  QUERY_RESULT_CACHE: 'queryResultCache' as FieldContentName,
  QUERY_EVALUATED_AT: 'queryEvaluatedAt' as FieldContentName,

  // Automation-specific fields
  AUTOMATION_DEFINITION: 'automationDefinition' as FieldContentName,
  AUTOMATION_STATE: 'automationState' as FieldContentName,
  AUTOMATION_LAST_FIRED: 'automationLastFired' as FieldContentName,
  AUTOMATION_ENABLED: 'automationEnabled' as FieldContentName,

  // Computed field-specific fields
  COMPUTED_FIELD_DEFINITION: 'computedFieldDefinition' as FieldContentName,
  COMPUTED_FIELD_VALUE: 'computedFieldValue' as FieldContentName,
  COMPUTED_FIELD_UPDATED_AT: 'computedFieldUpdatedAt' as FieldContentName,

  // Calendar-specific fields
  START_DATE: 'start_date' as FieldContentName,
  END_DATE: 'end_date' as FieldContentName,
  ALL_DAY: 'all_day' as FieldContentName,
  RRULE: 'rrule' as FieldContentName,
  GCAL_EVENT_ID: 'gcal_event_id' as FieldContentName,
  GCAL_SYNCED_AT: 'gcal_synced_at' as FieldContentName,
  REMINDER: 'reminder' as FieldContentName,

  // Google Calendar OAuth fields
  GCAL_ACCESS_TOKEN: 'gcal_access_token' as FieldContentName,
  GCAL_REFRESH_TOKEN: 'gcal_refresh_token' as FieldContentName,
  GCAL_TOKEN_EXPIRY: 'gcal_token_expiry' as FieldContentName,
  GCAL_USER_EMAIL: 'gcal_user_email' as FieldContentName,
  GCAL_CALENDAR_ID: 'gcal_calendar_id' as FieldContentName,
} as const

/**
 * Valid prefixes for systemId values.
 * Used to distinguish systemIds from UUIDs in functions that accept either.
 *
 * SystemIds follow the pattern: "{prefix}:{name}"
 * - field:status
 * - supertag:task
 * - item:my-app
 *
 * Add new prefixes here when introducing new systemId types.
 */
export const VALID_SYSTEM_ID_PREFIXES = ['field:', 'supertag:', 'item:'] as const

/**
 * Type for systemId prefixes
 */
export type SystemIdPrefix = (typeof VALID_SYSTEM_ID_PREFIXES)[number]

/**
 * Check if a string is a systemId (has a known prefix).
 *
 * This is the canonical way to distinguish between systemIds and UUIDs.
 * Use this function instead of manual prefix checks.
 */
export function isSystemId(value: string): boolean {
  return VALID_SYSTEM_ID_PREFIXES.some((prefix) => value.startsWith(prefix))
}

/**
 * Field types for the field:field_type property
 */
export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'url'
  | 'email'
  | 'node' // Single node reference
  | 'nodes' // Multiple node references
  | 'json'
