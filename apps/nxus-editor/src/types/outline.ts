import type { QueryDefinition } from '@nxus/db'

export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'url'
  | 'email'
  | 'node'
  | 'nodes'
  | 'json'

export interface OutlineField {
  fieldId: string
  fieldName: string
  fieldNodeId: string
  fieldSystemId: string | null
  fieldType: FieldType
  values: { value: unknown; order: number }[]
}

export interface OutlineNode {
  id: string
  content: string
  parentId: string | null
  children: string[]
  order: string
  collapsed: boolean
  supertags: SupertagBadge[]
  fields: OutlineField[]
  special: OutlineSpecial | null
}

export interface SupertagBadge {
  id: string
  name: string
  color: string | null
  systemId: string | null
}

export interface OutlineQuerySpecial {
  kind: 'query'
  definition: QueryDefinition
}

export type OutlineSpecial = OutlineQuerySpecial

/**
 * A node IS a supertag definition if it's tagged with the meta-supertag.
 */
export const SUPERTAG_DEFINITION_SYSTEM_ID = 'supertag:supertag'

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
])
