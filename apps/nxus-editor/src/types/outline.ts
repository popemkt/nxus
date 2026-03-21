export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'instance'
  | 'url'
  | 'email'
  | 'node'
  | 'nodes'
  | 'json'

export type HideWhen = 'never' | 'when_empty' | 'when_not_empty' | 'always'

export interface OutlineField {
  fieldId: string
  fieldName: string
  fieldNodeId: string
  fieldSystemId: string | null
  fieldType: FieldType
  values: { value: unknown; order: number }[]
  required?: boolean
  hideWhen?: HideWhen
  pinned?: boolean
}

export interface OutlineNode {
  id: string
  content: string
  parentId: string | null
  children: string[]
  order: string
  createdAt?: number
  collapsed: boolean
  supertags: SupertagBadge[]
  fields: OutlineField[]
}

export interface SupertagBadge {
  id: string
  name: string
  color: string | null
  systemId: string | null
}

/**
 * A node IS a supertag definition if it's tagged with the meta-supertag.
 */
export const SUPERTAG_DEFINITION_SYSTEM_ID = 'supertag:supertag'

/**
 * A node IS a field definition if it's tagged with the field meta-supertag.
 */
export const FIELD_DEFINITION_SYSTEM_ID = 'supertag:field'

/**
 * A node IS a query if it's tagged with the query supertag.
 */
export const QUERY_SYSTEM_ID = 'supertag:query'

/**
 * Query-internal field system IDs — hidden from field display on query nodes
 * because their content is rendered as live query results instead.
 */
export const QUERY_FIELD_SYSTEM_IDS = new Set([
  'field:query_definition',
  'field:query_sort',
  'field:query_limit',
])

export type ViewMode = 'outline' | 'table' | 'kanban' | 'cards' | 'list'

export interface ViewFilter {
  fieldId: string
  operator: 'equals' | 'not_equals' | 'contains' | 'is_empty' | 'is_not_empty'
  value?: string
}

export interface ViewConfig {
  groupByFieldId?: string
  sortByFieldId?: string
  sortDirection?: 'asc' | 'desc'
  columnWidths?: Record<string, number>
  visibleFieldIds?: string[]
  filters?: ViewFilter[]
}

export type NodeMap = Map<string, OutlineNode>

/**
 * Virtual root node ID for the workspace level.
 * This node doesn't exist in the DB — it's a local-only container
 * whose children are the top-level nodes (ownerId = null in DB).
 */
export const WORKSPACE_ROOT_ID = '__workspace__'

/**
 * System field IDs hidden from the outline field display.
 * These are engine-internal properties, not user-facing data.
 */
export const HIDDEN_FIELD_SYSTEM_IDS = new Set([
  'field:supertag',
  'field:extends',
  'field:field_type',
  'field:order',
  'field:parent',
  'field:query_result_cache',
  'field:query_evaluated_at',
  'field:recall_cached_question',
  'field:gcal_access_token',
  'field:gcal_refresh_token',
  'field:gcal_token_expiry',
  // Supertag config fields — shown in config panel, not in field rows
  'field:default_child_supertag',
  'field:content_template',
  'field:auto_collect',
  'field:instance_supertag',
  'field:view_config',
  // Field constraint metadata — stored on field definition nodes, not displayed as node fields
  'field:required',
  'field:hide_when',
  'field:pinned',
])
