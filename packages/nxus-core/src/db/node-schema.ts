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

  // Inbox-specific
  STATUS: 'field:status',
  NOTES: 'field:notes',
  TITLE: 'field:title',
} as const

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
