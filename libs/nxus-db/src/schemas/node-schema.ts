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
    index('idx_nodes_deleted_at').on(t.deletedAt),
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

export const SYSTEM_FIELDS = {
  // Core system fields
  SUPERTAG: 'field:supertag', // Links node to its supertag(s)
  EXTENDS: 'field:extends', // Supertag inheritance
  FIELD_TYPE: 'field:field_type', // Type of a field (text, node, nodes, etc.)

  // Common entity fields
  TYPE: 'field:type',
  PATH: 'field:path',
  HOMEPAGE: 'field:homepage',
  DESCRIPTION: 'field:description',
  COLOR: 'field:color',
  ICON: 'field:icon',
  LEGACY_ID: 'field:legacy_id', // For migration: stores old ID
  CATEGORY: 'field:category',
  PLATFORM: 'field:platform', // platforms array
  DOCS: 'field:docs', // docs JSON array

  // Relation fields
  DEPENDENCIES: 'field:dependencies',
  TAGS: 'field:tags',
  COMMANDS: 'field:commands',
  PARENT: 'field:parent',

  // Tool-specific
  CHECK_COMMAND: 'field:check_command',
  INSTALL_INSTRUCTIONS: 'field:install_instructions',

  // Command-specific
  COMMAND: 'field:command',
  COMMAND_ID: 'field:command_id',
  MODE: 'field:mode',
  TARGET: 'field:target',
  SCRIPT_SOURCE: 'field:script_source',
  CWD: 'field:cwd',
  PLATFORMS: 'field:platforms', // command platforms
  REQUIRES: 'field:requires',
  OPTIONS: 'field:options',
  PARAMS: 'field:params',
  REQUIREMENTS: 'field:requirements',
  WORKFLOW: 'field:workflow',

  // Inbox-specific
  STATUS: 'field:status',
  NOTES: 'field:notes',
  TITLE: 'field:title',

  // Query-specific fields (for saved queries with supertag:query)
  QUERY_DEFINITION: 'field:query_definition', // JSON query definition
  QUERY_SORT: 'field:query_sort', // Sort configuration
  QUERY_LIMIT: 'field:query_limit', // Max results
  QUERY_RESULT_CACHE: 'field:query_result_cache', // Cached node IDs (optional)
  QUERY_EVALUATED_AT: 'field:query_evaluated_at', // Last evaluation timestamp

  // Automation-specific fields (for reactive automations with supertag:automation)
  AUTOMATION_DEFINITION: 'field:automation_definition', // JSON automation config
  AUTOMATION_STATE: 'field:automation_state', // JSON state tracking
  AUTOMATION_LAST_FIRED: 'field:automation_last_fired', // Timestamp of last execution
  AUTOMATION_ENABLED: 'field:automation_enabled', // Boolean - whether automation is active

  // Computed field-specific fields (for reactive computed/aggregated fields with supertag:computed_field)
  COMPUTED_FIELD_DEFINITION: 'field:computed_field_definition', // JSON aggregation config (query + aggregation type)
  COMPUTED_FIELD_VALUE: 'field:computed_field_value', // Current computed value (cached)
  COMPUTED_FIELD_UPDATED_AT: 'field:computed_field_updated_at', // Timestamp of last recomputation

  // Calendar-specific fields (for calendar events and tasks)
  START_DATE: 'field:start_date', // ISO datetime or date string
  END_DATE: 'field:end_date', // ISO datetime or date string (optional)
  ALL_DAY: 'field:all_day', // Boolean for all-day events
  RRULE: 'field:rrule', // RFC 5545 recurrence rule string
  GCAL_EVENT_ID: 'field:gcal_event_id', // Google Calendar event ID
  GCAL_SYNCED_AT: 'field:gcal_synced_at', // Last sync timestamp
  REMINDER: 'field:reminder', // Reminder offset in minutes

  // Google Calendar OAuth fields (stored on settings node)
  GCAL_ACCESS_TOKEN: 'field:gcal_access_token', // OAuth access token (encrypted)
  GCAL_REFRESH_TOKEN: 'field:gcal_refresh_token', // OAuth refresh token (encrypted)
  GCAL_TOKEN_EXPIRY: 'field:gcal_token_expiry', // Token expiration timestamp
  GCAL_USER_EMAIL: 'field:gcal_user_email', // Connected Google account email
  GCAL_CALENDAR_ID: 'field:gcal_calendar_id', // Target calendar ID for sync
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
