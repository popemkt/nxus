/**
 * types.ts - Reactive system types for the event bus and query subscriptions
 *
 * This module defines all types for the reactive query system:
 * - MutationEvent types emitted by the event bus
 * - Query subscription types for live queries
 * - Computed field types for aggregations
 * - Automation types for rules engine
 *
 * NO runtime imports here - types and Zod schemas only!
 */

import { z } from 'zod'
import type { QueryDefinition } from '../types/query.js'
import type { AssembledNode } from '../types/node.js'

// ============================================================================
// Mutation Event Types
// ============================================================================

/**
 * Types of mutations that trigger events
 */
export const MutationTypeSchema = z.enum([
  'node:created',
  'node:updated',
  'node:deleted',
  'property:set',
  'property:added',
  'property:removed',
  'supertag:added',
  'supertag:removed',
])
export type MutationType = z.infer<typeof MutationTypeSchema>

/**
 * Mutation event emitted by the event bus
 */
export interface MutationEvent {
  type: MutationType
  timestamp: Date
  nodeId: string
  systemId?: string | null // Node's systemId (for quick filtering)

  // Property-specific fields
  fieldSystemId?: string // e.g., 'field:status'
  beforeValue?: unknown // Previous value (for change detection)
  afterValue?: unknown // New value

  // Supertag-specific fields
  supertagSystemId?: string // e.g., 'supertag:subscription'
}

/**
 * Event listener signature
 */
export type MutationListener = (event: MutationEvent) => void | Promise<void>

/**
 * Filter to selectively receive events
 */
export interface EventFilter {
  types?: MutationType[] // Filter by event type
  nodeIds?: string[] // Filter by specific node(s)
  fieldSystemIds?: string[] // Filter by field changes
  supertagSystemIds?: string[] // Filter by supertag changes
}

// ============================================================================
// Query Subscription Types
// ============================================================================

/**
 * Live query subscription
 */
export interface QuerySubscription {
  id: string
  queryDefinition: QueryDefinition
  lastResults: Set<string> // Node IDs from last evaluation
  lastNodeStates: Map<string, AssembledNode> // For change detection
  lastEvaluatedAt: Date

  // Callbacks
  onResultChange?: (event: QueryResultChangeEvent) => void
}

/**
 * Change event for query results
 */
export interface QueryResultChangeEvent {
  subscriptionId: string
  added: AssembledNode[] // Nodes newly matching
  removed: AssembledNode[] // Nodes no longer matching
  changed: AssembledNode[] // Nodes still matching but properties changed
  totalCount: number
  evaluatedAt: Date
}

// ============================================================================
// Computed Field Types
// ============================================================================

/**
 * Aggregation types supported
 */
export const AggregationTypeSchema = z.enum(['SUM', 'COUNT', 'AVG', 'MIN', 'MAX'])
export type AggregationType = z.infer<typeof AggregationTypeSchema>

/**
 * Computed field definition (stored in field:computed_field_definition)
 */
export const ComputedFieldDefinitionSchema = z.object({
  aggregation: AggregationTypeSchema,
  query: z.lazy(() =>
    z.object({
      filters: z.array(z.unknown()),
      sort: z.unknown().optional(),
      limit: z.number().optional(),
    }),
  ) as z.ZodType<QueryDefinition>, // Which nodes to aggregate
  fieldSystemId: z.string().optional(), // Which field to aggregate (for SUM, AVG, etc.)
  parentNodeId: z.string().optional(), // Optional parent (null = global)
})
export type ComputedFieldDefinition = z.infer<typeof ComputedFieldDefinitionSchema>

/**
 * Runtime computed field with current value
 */
export interface ComputedField {
  id: string // Node ID of the computed field node
  name: string // Display name
  definition: ComputedFieldDefinition
  value: number | null // Current computed value
  updatedAt: Date
}

// ============================================================================
// Automation Trigger Types
// ============================================================================

/**
 * Trigger types for automations
 */
export const TriggerTypeSchema = z.enum([
  'query_membership', // Node enters/exits query results
  'threshold', // Computed field crosses threshold
])
export type TriggerType = z.infer<typeof TriggerTypeSchema>

/**
 * Query membership trigger events
 */
export const QueryMembershipEventSchema = z.enum(['onEnter', 'onExit', 'onChange'])
export type QueryMembershipEvent = z.infer<typeof QueryMembershipEventSchema>

/**
 * Query membership trigger
 */
export const QueryMembershipTriggerSchema = z.object({
  type: z.literal('query_membership'),
  queryDefinition: z.lazy(() =>
    z.object({
      filters: z.array(z.unknown()),
      sort: z.unknown().optional(),
      limit: z.number().optional(),
    }),
  ) as z.ZodType<QueryDefinition>,
  event: QueryMembershipEventSchema,
})
export type QueryMembershipTrigger = z.infer<typeof QueryMembershipTriggerSchema>

/**
 * Threshold comparison operators
 */
export const ThresholdOperatorSchema = z.enum(['gt', 'gte', 'lt', 'lte', 'eq'])
export type ThresholdOperator = z.infer<typeof ThresholdOperatorSchema>

/**
 * Threshold trigger for computed fields
 */
export const ThresholdTriggerSchema = z.object({
  type: z.literal('threshold'),
  computedFieldId: z.string(),
  condition: z.object({
    operator: ThresholdOperatorSchema,
    value: z.number(),
  }),
  fireOnce: z.boolean(), // Only fire once per crossing
})
export type ThresholdTrigger = z.infer<typeof ThresholdTriggerSchema>

/**
 * Union of all automation triggers
 */
export const AutomationTriggerSchema = z.discriminatedUnion('type', [
  QueryMembershipTriggerSchema,
  ThresholdTriggerSchema,
])
export type AutomationTrigger = z.infer<typeof AutomationTriggerSchema>

// ============================================================================
// Automation Action Types
// ============================================================================

/**
 * Action types for automations
 */
export const ActionTypeSchema = z.enum([
  'set_property',
  'add_supertag',
  'remove_supertag',
  'create_node',
  'webhook',
])
export type ActionType = z.infer<typeof ActionTypeSchema>

/**
 * Special value marker for current timestamp
 */
export const NowMarkerSchema = z.object({ $now: z.literal(true) })
export type NowMarker = z.infer<typeof NowMarkerSchema>

/**
 * Set property action
 */
export const SetPropertyActionSchema = z.object({
  type: z.literal('set_property'),
  fieldSystemId: z.string(),
  value: z.union([z.unknown(), NowMarkerSchema]), // Value or { $now: true } for timestamp
})
export type SetPropertyAction = z.infer<typeof SetPropertyActionSchema>

/**
 * Add supertag action
 */
export const AddSupertagActionSchema = z.object({
  type: z.literal('add_supertag'),
  supertagSystemId: z.string(),
})
export type AddSupertagAction = z.infer<typeof AddSupertagActionSchema>

/**
 * Remove supertag action
 */
export const RemoveSupertagActionSchema = z.object({
  type: z.literal('remove_supertag'),
  supertagSystemId: z.string(),
})
export type RemoveSupertagAction = z.infer<typeof RemoveSupertagActionSchema>

/**
 * Create node action
 */
export const CreateNodeActionSchema = z.object({
  type: z.literal('create_node'),
  content: z.string(),
  supertagSystemId: z.string().optional(),
  ownerId: z.string().optional(),
})
export type CreateNodeAction = z.infer<typeof CreateNodeActionSchema>

/**
 * HTTP methods for webhooks
 */
export const WebhookMethodSchema = z.enum(['GET', 'POST', 'PUT'])
export type WebhookMethod = z.infer<typeof WebhookMethodSchema>

/**
 * Webhook action (executed async via job queue)
 * Template variables: {{ node.id }}, {{ node.content }}, {{ computedField.value }}
 */
export const WebhookActionSchema = z.object({
  type: z.literal('webhook'),
  url: z.string().url(),
  method: WebhookMethodSchema,
  headers: z.record(z.string(), z.string()).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
})
export type WebhookAction = z.infer<typeof WebhookActionSchema>

/**
 * Union of all automation actions
 */
export const AutomationActionSchema = z.discriminatedUnion('type', [
  SetPropertyActionSchema,
  AddSupertagActionSchema,
  RemoveSupertagActionSchema,
  CreateNodeActionSchema,
  WebhookActionSchema,
])
export type AutomationAction = z.infer<typeof AutomationActionSchema>

// ============================================================================
// Automation Definition Types
// ============================================================================

/**
 * Complete automation definition (stored in field:automation_definition)
 */
export const AutomationDefinitionSchema = z.object({
  name: z.string(),
  trigger: AutomationTriggerSchema,
  action: AutomationActionSchema,
  enabled: z.boolean(),
})
export type AutomationDefinition = z.infer<typeof AutomationDefinitionSchema>

/**
 * Automation state for threshold tracking (stored in field:automation_state)
 */
export interface AutomationState {
  lastTriggeredAt?: string // ISO timestamp
  thresholdCrossed?: boolean // For fireOnce tracking
  previousValue?: number // For detecting crossing direction
  previouslyInResults?: string[] // Node IDs that were in query results
}

// ============================================================================
// Event Bus Interface
// ============================================================================

/**
 * Event bus interface for mutation events
 */
export interface EventBus {
  /**
   * Subscribe to mutation events
   * @returns Unsubscribe function
   */
  subscribe(listener: MutationListener, filter?: EventFilter): () => void

  /**
   * Emit a mutation event (called by mutation functions)
   * @internal
   */
  emit(event: MutationEvent): void

  /**
   * Get current listener count (for debugging)
   */
  listenerCount(): number

  /**
   * Clear all listeners (for testing)
   */
  clear(): void
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for query membership trigger
 */
export function isQueryMembershipTrigger(
  trigger: AutomationTrigger,
): trigger is QueryMembershipTrigger {
  return trigger.type === 'query_membership'
}

/**
 * Type guard for threshold trigger
 */
export function isThresholdTrigger(trigger: AutomationTrigger): trigger is ThresholdTrigger {
  return trigger.type === 'threshold'
}

/**
 * Type guard for set property action
 */
export function isSetPropertyAction(action: AutomationAction): action is SetPropertyAction {
  return action.type === 'set_property'
}

/**
 * Type guard for add supertag action
 */
export function isAddSupertagAction(action: AutomationAction): action is AddSupertagAction {
  return action.type === 'add_supertag'
}

/**
 * Type guard for remove supertag action
 */
export function isRemoveSupertagAction(action: AutomationAction): action is RemoveSupertagAction {
  return action.type === 'remove_supertag'
}

/**
 * Type guard for create node action
 */
export function isCreateNodeAction(action: AutomationAction): action is CreateNodeAction {
  return action.type === 'create_node'
}

/**
 * Type guard for webhook action
 */
export function isWebhookAction(action: AutomationAction): action is WebhookAction {
  return action.type === 'webhook'
}

/**
 * Type guard for $now marker
 */
export function isNowMarker(value: unknown): value is NowMarker {
  return (
    typeof value === 'object' &&
    value !== null &&
    '$now' in value &&
    (value as NowMarker).$now === true
  )
}
