/**
 * query.ts - Query definition types for the Tana-like reactive query system
 *
 * This module defines the schema for query definitions that can be:
 * - Evaluated against the node database
 * - Saved as nodes with supertag:query
 * - Used by the query builder UI
 */

import { z } from 'zod'

// ============================================================================
// Filter Operators
// ============================================================================

/**
 * Comparison operators for property filters
 */
export const FilterOpSchema = z.enum([
  'eq', // equals
  'neq', // not equals
  'gt', // greater than
  'gte', // greater than or equal
  'lt', // less than
  'lte', // less than or equal
  'contains', // string contains (case-insensitive)
  'startsWith', // string starts with
  'endsWith', // string ends with
  'isEmpty', // field is empty/null
  'isNotEmpty', // field has value
])
export type FilterOp = z.infer<typeof FilterOpSchema>

// ============================================================================
// Individual Filter Types
// ============================================================================

/**
 * Base filter fields shared by all filter types
 */
const BaseFilterSchema = z.object({
  id: z.string().optional(), // For UI tracking/keying
})

/**
 * Supertag filter - matches nodes with a specific supertag
 *
 * Example: Find all nodes with #Item supertag (including #Tool which extends #Item)
 */
export const SupertagFilterSchema = BaseFilterSchema.extend({
  type: z.literal('supertag'),
  supertagSystemId: z.string(), // e.g., 'supertag:item', 'supertag:tool'
  includeInherited: z.boolean().default(true), // Include child supertags via field:extends
})
export type SupertagFilter = z.infer<typeof SupertagFilterSchema>

/**
 * Property filter - matches nodes by field value comparison
 *
 * Example: Find nodes where field:status = "installed"
 */
export const PropertyFilterSchema = BaseFilterSchema.extend({
  type: z.literal('property'),
  fieldSystemId: z.string(), // e.g., 'field:status', 'field:type'
  op: FilterOpSchema,
  value: z.unknown().optional(), // Value to compare (not needed for isEmpty/isNotEmpty)
})
export type PropertyFilter = z.infer<typeof PropertyFilterSchema>

/**
 * Content filter - full-text search on node content
 *
 * Example: Find nodes containing "Claude" in their content
 */
export const ContentFilterSchema = BaseFilterSchema.extend({
  type: z.literal('content'),
  query: z.string(), // Search text
  caseSensitive: z.boolean().default(false),
})
export type ContentFilter = z.infer<typeof ContentFilterSchema>

/**
 * Relation filter - matches based on node relationships
 *
 * Example: Find all children of a specific node, or all nodes that link to a target
 */
export const RelationFilterSchema = BaseFilterSchema.extend({
  type: z.literal('relation'),
  relationType: z.enum([
    'childOf', // Node's ownerId matches target
    'ownedBy', // Same as childOf (alias)
    'linksTo', // Node has a property value referencing target
    'linkedFrom', // Target has a property value referencing this node (backlinks)
  ]),
  targetNodeId: z.string().optional(), // Specific node ID, or omit for "has any relation"
  fieldSystemId: z.string().optional(), // For linksTo/linkedFrom: which field to check
})
export type RelationFilter = z.infer<typeof RelationFilterSchema>

/**
 * Temporal filter - matches based on timestamps
 *
 * Example: Find nodes created in the last 7 days
 */
export const TemporalFilterSchema = BaseFilterSchema.extend({
  type: z.literal('temporal'),
  field: z.enum(['createdAt', 'updatedAt']),
  op: z.enum([
    'within', // Within last N days
    'before', // Before a specific date
    'after', // After a specific date
  ]),
  days: z.number().optional(), // For 'within' - last N days
  date: z.string().optional(), // ISO date string for 'before'/'after'
})
export type TemporalFilter = z.infer<typeof TemporalFilterSchema>

/**
 * Has field filter - checks if a node has a specific field defined
 *
 * Example: Find nodes that have field:description set
 */
export const HasFieldFilterSchema = BaseFilterSchema.extend({
  type: z.literal('hasField'),
  fieldSystemId: z.string(),
  negate: z.boolean().default(false), // true = "does NOT have field"
})
export type HasFieldFilter = z.infer<typeof HasFieldFilterSchema>

// ============================================================================
// Logical Filter (recursive)
// ============================================================================

/**
 * Logical filter type for recursion
 */
export interface LogicalFilter {
  type: 'and' | 'or' | 'not'
  id?: string
  filters: QueryFilter[]
}

/**
 * Logical filter schema - combines multiple filters with AND/OR/NOT
 *
 * Example: (supertag = #Item) AND (status = "installed" OR status = "available")
 */
export const LogicalFilterSchema: z.ZodType<LogicalFilter> = z.lazy(() =>
  BaseFilterSchema.extend({
    type: z.enum(['and', 'or', 'not']),
    filters: z.array(QueryFilterSchema),
  }),
)

// ============================================================================
// Union of All Filter Types
// ============================================================================

/**
 * Discriminated union of all filter types
 */
export const QueryFilterSchema: z.ZodType<QueryFilter> = z.lazy(() =>
  z.union([
    SupertagFilterSchema,
    PropertyFilterSchema,
    ContentFilterSchema,
    RelationFilterSchema,
    TemporalFilterSchema,
    HasFieldFilterSchema,
    LogicalFilterSchema,
  ]),
)

/**
 * Union type of all possible filters
 */
export type QueryFilter =
  | SupertagFilter
  | PropertyFilter
  | ContentFilter
  | RelationFilter
  | TemporalFilter
  | HasFieldFilter
  | LogicalFilter

// ============================================================================
// Sort Configuration
// ============================================================================

/**
 * Sort configuration for query results
 */
export const QuerySortSchema = z.object({
  field: z.string(), // 'content', 'createdAt', 'updatedAt', or a field systemId
  direction: z.enum(['asc', 'desc']),
})
export type QuerySort = z.infer<typeof QuerySortSchema>

// ============================================================================
// Complete Query Definition
// ============================================================================

/**
 * Complete query definition
 *
 * This is stored in the field:query_definition property of query nodes.
 * All filters in the top-level array are combined with AND by default.
 */
export const QueryDefinitionSchema = z.object({
  filters: z.array(QueryFilterSchema).default([]),
  sort: QuerySortSchema.optional(),
  limit: z.number().default(500),
})
export type QueryDefinition = z.infer<typeof QueryDefinitionSchema>

// ============================================================================
// Saved Query Types
// ============================================================================

/**
 * Saved query structure (assembled from node + properties)
 *
 * This represents a query node with supertag:query when fully assembled.
 */
export interface SavedQuery {
  id: string
  content: string // Query name/title
  definition: QueryDefinition
  resultCache?: string[] // Cached node IDs from last evaluation
  evaluatedAt?: Date // When results were last cached
  createdAt: Date
  updatedAt: Date
}

/**
 * Input for creating a new saved query
 */
export const CreateQueryInputSchema = z.object({
  name: z.string().min(1, 'Query name is required'),
  definition: QueryDefinitionSchema,
  ownerId: z.string().optional(), // Parent node for organization
})
export type CreateQueryInput = z.infer<typeof CreateQueryInputSchema>

/**
 * Input for updating a saved query
 */
export const UpdateQueryInputSchema = z.object({
  queryId: z.string(),
  name: z.string().optional(),
  definition: QueryDefinitionSchema.optional(),
})
export type UpdateQueryInput = z.infer<typeof UpdateQueryInputSchema>

// ============================================================================
// Query Evaluation Types
// ============================================================================

/**
 * Input for evaluating a query
 */
export const EvaluateQueryInputSchema = z.object({
  definition: QueryDefinitionSchema,
  limit: z.number().optional(), // Override definition limit
})
export type EvaluateQueryInput = z.infer<typeof EvaluateQueryInputSchema>

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for supertag filter
 */
export function isSupertagFilter(filter: QueryFilter): filter is SupertagFilter {
  return filter.type === 'supertag'
}

/**
 * Type guard for property filter
 */
export function isPropertyFilter(filter: QueryFilter): filter is PropertyFilter {
  return filter.type === 'property'
}

/**
 * Type guard for content filter
 */
export function isContentFilter(filter: QueryFilter): filter is ContentFilter {
  return filter.type === 'content'
}

/**
 * Type guard for relation filter
 */
export function isRelationFilter(filter: QueryFilter): filter is RelationFilter {
  return filter.type === 'relation'
}

/**
 * Type guard for temporal filter
 */
export function isTemporalFilter(filter: QueryFilter): filter is TemporalFilter {
  return filter.type === 'temporal'
}

/**
 * Type guard for has field filter
 */
export function isHasFieldFilter(filter: QueryFilter): filter is HasFieldFilter {
  return filter.type === 'hasField'
}

/**
 * Type guard for logical filter
 */
export function isLogicalFilter(filter: QueryFilter): filter is LogicalFilter {
  return filter.type === 'and' || filter.type === 'or' || filter.type === 'not'
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create an empty query definition
 */
export function createEmptyQueryDefinition(): QueryDefinition {
  return {
    filters: [],
    limit: 500,
  }
}

/**
 * Create a simple supertag filter query
 */
export function createSupertagQuery(
  supertagSystemId: string,
  includeInherited = true,
): QueryDefinition {
  return {
    filters: [
      {
        type: 'supertag',
        supertagSystemId,
        includeInherited,
      },
    ],
    limit: 500,
  }
}

/**
 * Create a content search query
 */
export function createContentSearchQuery(query: string): QueryDefinition {
  return {
    filters: [
      {
        type: 'content',
        query,
        caseSensitive: false,
      },
    ],
    limit: 500,
  }
}

/**
 * Combine multiple queries with AND
 */
export function combineQueriesWithAnd(
  queries: QueryDefinition[],
): QueryDefinition {
  const allFilters = queries.flatMap((q) => q.filters)
  return {
    filters: allFilters,
    sort: queries.find((q) => q.sort)?.sort,
    limit: Math.min(...queries.map((q) => q.limit ?? 500)),
  }
}

/**
 * Add a filter to an existing query definition
 */
export function addFilterToQuery(
  query: QueryDefinition,
  filter: QueryFilter,
): QueryDefinition {
  return {
    ...query,
    filters: [...query.filters, filter],
  }
}

/**
 * Remove a filter from a query definition by id
 */
export function removeFilterFromQuery(
  query: QueryDefinition,
  filterId: string,
): QueryDefinition {
  return {
    ...query,
    filters: query.filters.filter((f) => f.id !== filterId),
  }
}
