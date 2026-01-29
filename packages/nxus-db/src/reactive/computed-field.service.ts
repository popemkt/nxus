/**
 * computed-field.service.ts - Reactive computed/aggregated fields
 *
 * This module implements the ComputedFieldService that manages computed fields.
 * Computed fields aggregate data from query results and automatically update
 * when the underlying data changes.
 *
 * Key features:
 * - Computed fields are stored as nodes with supertag:computed_field
 * - Each computed field has a query definition and aggregation type
 * - Values are cached and updated reactively via query subscriptions
 * - Supports aggregations: COUNT, SUM, AVG, MIN, MAX
 *
 * Phase 2 adds:
 * - Value change events for threshold automations
 * - Integration with the automation service
 */

import type { AssembledNode } from '../types/node.js'
import type {
  ComputedFieldDefinition,
  ComputedField,
  AggregationType,
  QueryResultChangeEvent,
} from './types.js'
import {
  createQuerySubscriptionService,
  type QuerySubscriptionService,
  type SubscriptionHandle,
} from './query-subscription.service.js'
import {
  createNode,
  setProperty,
  assembleNode,
  getSystemNode,
  deleteNode,
} from '../services/node.service.js'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '../schemas/node-schema.js'
import type { getDatabase } from '../client/master-client.js'

// ============================================================================
// Constants
// ============================================================================

/**
 * Local aliases for computed field-related schema constants
 */
const COMPUTED_FIELD_FIELDS = {
  DEFINITION: SYSTEM_FIELDS.COMPUTED_FIELD_DEFINITION,
  VALUE: SYSTEM_FIELDS.COMPUTED_FIELD_VALUE,
  UPDATED_AT: SYSTEM_FIELDS.COMPUTED_FIELD_UPDATED_AT,
} as const

const COMPUTED_FIELD_SUPERTAG = SYSTEM_SUPERTAGS.COMPUTED_FIELD

// ============================================================================
// Types
// ============================================================================

/**
 * Database type - accepts any object with the required methods
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = ReturnType<typeof getDatabase>

/**
 * Callback for computed field value changes
 */
export type ComputedFieldValueChangeCallback = (event: ComputedFieldValueChangeEvent) => void

/**
 * Event emitted when a computed field's value changes
 */
export interface ComputedFieldValueChangeEvent {
  computedFieldId: string
  previousValue: number | null
  currentValue: number | null
  changedAt: Date
}

/**
 * Runtime tracking for active computed fields
 */
interface ActiveComputedField {
  id: string
  definition: ComputedFieldDefinition
  subscriptionHandle: SubscriptionHandle | null
  lastValue: number | null
}

/**
 * Computed field service interface
 */
export interface ComputedFieldService {
  /**
   * Create a new computed field (stored as node with supertag:computed_field)
   * @param db Database instance
   * @param options Computed field options (name, definition, optional ownerId)
   * @returns Computed field node ID
   */
  create(
    db: Database,
    options: {
      name: string
      definition: ComputedFieldDefinition
      ownerId?: string
    },
  ): string

  /**
   * Get the current value of a computed field
   * @param db Database instance
   * @param computedFieldId Computed field node ID
   * @returns Current computed value or null
   */
  getValue(db: Database, computedFieldId: string): number | null

  /**
   * Force recompute a computed field's value
   * @param db Database instance
   * @param computedFieldId Computed field node ID
   * @returns New computed value
   */
  recompute(db: Database, computedFieldId: string): number | null

  /**
   * Get all computed fields with their current values
   * @param db Database instance
   */
  getAll(db: Database): ComputedField[]

  /**
   * Delete a computed field
   * @param db Database instance
   * @param computedFieldId Computed field node ID
   */
  delete(db: Database, computedFieldId: string): void

  /**
   * Subscribe to value changes for a specific computed field
   * @param computedFieldId Computed field node ID
   * @param callback Callback for value changes
   * @returns Unsubscribe function
   */
  onValueChange(
    computedFieldId: string,
    callback: ComputedFieldValueChangeCallback,
  ): () => void

  /**
   * Get the number of active (subscribed) computed fields
   */
  activeCount(): number

  /**
   * Clear all active computed fields (for testing)
   */
  clear(): void

  /**
   * Initialize the service by loading all computed fields from DB
   * Should be called once when the application starts
   * @param db Database instance
   */
  initialize(db: Database): void
}

// ============================================================================
// Aggregation Functions
// ============================================================================

/**
 * Compute the COUNT aggregation (number of matching nodes)
 */
function computeCount(nodes: AssembledNode[]): number {
  return nodes.length
}

/**
 * Extract numeric value from a node's property
 *
 * @param node The assembled node to extract from
 * @param fieldId The field identifier - can be either a UUID (fieldNodeId) or a systemId (fieldSystemId)
 */
function extractNumericValue(node: AssembledNode, fieldId: string): number | null {
  const properties = node.properties

  // Find the property by fieldId (matching either fieldNodeId or fieldSystemId)
  for (const propValues of Object.values(properties)) {
    for (const prop of propValues) {
      // Match by fieldNodeId (UUID) or fieldSystemId (system identifier like 'field:monthly_price')
      if (prop.fieldNodeId === fieldId || prop.fieldSystemId === fieldId) {
        // Parse the value
        const val = prop.value
        if (typeof val === 'number') return val
        if (typeof val === 'string') {
          const parsed = parseFloat(val)
          return isNaN(parsed) ? null : parsed
        }
        return null
      }
    }
  }
  return null
}

/**
 * Compute the SUM aggregation
 */
function computeSum(nodes: AssembledNode[], fieldId?: string): number | null {
  if (!fieldId) {
    console.warn('[ComputedFieldService] SUM aggregation requires fieldId')
    return null
  }

  let sum = 0
  let hasValue = false

  for (const node of nodes) {
    const value = extractNumericValue(node, fieldId)
    if (value !== null) {
      sum += value
      hasValue = true
    }
  }

  return hasValue ? sum : null
}

/**
 * Compute the AVG aggregation
 */
function computeAvg(nodes: AssembledNode[], fieldId?: string): number | null {
  if (!fieldId) {
    console.warn('[ComputedFieldService] AVG aggregation requires fieldId')
    return null
  }

  const values: number[] = []

  for (const node of nodes) {
    const value = extractNumericValue(node, fieldId)
    if (value !== null) {
      values.push(value)
    }
  }

  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * Compute the MIN aggregation
 */
function computeMin(nodes: AssembledNode[], fieldId?: string): number | null {
  if (!fieldId) {
    console.warn('[ComputedFieldService] MIN aggregation requires fieldId')
    return null
  }

  let min: number | null = null

  for (const node of nodes) {
    const value = extractNumericValue(node, fieldId)
    if (value !== null) {
      if (min === null || value < min) {
        min = value
      }
    }
  }

  return min
}

/**
 * Compute the MAX aggregation
 */
function computeMax(nodes: AssembledNode[], fieldId?: string): number | null {
  if (!fieldId) {
    console.warn('[ComputedFieldService] MAX aggregation requires fieldId')
    return null
  }

  let max: number | null = null

  for (const node of nodes) {
    const value = extractNumericValue(node, fieldId)
    if (value !== null) {
      if (max === null || value > max) {
        max = value
      }
    }
  }

  return max
}

/**
 * Compute the aggregation value based on type
 */
function computeAggregation(
  aggregationType: AggregationType,
  nodes: AssembledNode[],
  fieldId?: string,
): number | null {
  switch (aggregationType) {
    case 'COUNT':
      return computeCount(nodes)
    case 'SUM':
      return computeSum(nodes, fieldId)
    case 'AVG':
      return computeAvg(nodes, fieldId)
    case 'MIN':
      return computeMin(nodes, fieldId)
    case 'MAX':
      return computeMax(nodes, fieldId)
    default:
      console.warn(`[ComputedFieldService] Unknown aggregation type: ${aggregationType}`)
      return null
  }
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new ComputedFieldService instance
 *
 * @param querySubscriptionServiceInstance Optional query subscription service (defaults to creating new one)
 * @returns ComputedFieldService instance
 */
export function createComputedFieldService(
  querySubscriptionServiceInstance?: QuerySubscriptionService,
): ComputedFieldService {
  const activeComputedFields = new Map<string, ActiveComputedField>()
  const valueChangeListeners = new Map<string, Set<ComputedFieldValueChangeCallback>>()
  const queryService =
    querySubscriptionServiceInstance || createQuerySubscriptionService()

  /**
   * Notify listeners of a value change
   */
  function notifyValueChange(
    computedFieldId: string,
    previousValue: number | null,
    currentValue: number | null,
  ): void {
    const listeners = valueChangeListeners.get(computedFieldId)
    if (!listeners || listeners.size === 0) return

    const event: ComputedFieldValueChangeEvent = {
      computedFieldId,
      previousValue,
      currentValue,
      changedAt: new Date(),
    }

    for (const listener of listeners) {
      try {
        listener(event)
      } catch (error) {
        console.error(
          `[ComputedFieldService] Error in value change listener for ${computedFieldId}:`,
          error,
        )
      }
    }
  }

  /**
   * Update the cached value of a computed field in the database
   */
  function updateCachedValue(
    db: Database,
    computedFieldId: string,
    value: number | null,
  ): void {
    const now = new Date().toISOString()

    // Store value as JSON to handle null properly
    setProperty(db, computedFieldId, COMPUTED_FIELD_FIELDS.VALUE, value)
    setProperty(db, computedFieldId, COMPUTED_FIELD_FIELDS.UPDATED_AT, now)
  }

  /**
   * Handle query result changes for a computed field
   */
  function handleQueryResultChange(
    db: Database,
    computedField: ActiveComputedField,
    _event: QueryResultChangeEvent,
  ): void {
    // Get current results from the subscription
    const handle = computedField.subscriptionHandle
    if (!handle) return

    const currentNodes = handle.getLastResults()

    // Compute new value
    const newValue = computeAggregation(
      computedField.definition.aggregation,
      currentNodes,
      computedField.definition.fieldId,
    )

    const previousValue = computedField.lastValue

    // Only update if value changed
    if (newValue !== previousValue) {
      computedField.lastValue = newValue

      // Update cached value in DB
      updateCachedValue(db, computedField.id, newValue)

      // Notify listeners
      notifyValueChange(computedField.id, previousValue, newValue)
    }
  }

  /**
   * Register a query subscription for a computed field
   */
  function registerSubscription(
    db: Database,
    computedField: ActiveComputedField,
  ): void {
    const { definition, id } = computedField

    // Subscribe to the query
    const handle = queryService.subscribe(
      db,
      definition.query,
      (event) => {
        handleQueryResultChange(db, computedField, event)
      },
    )

    computedField.subscriptionHandle = handle

    // Compute initial value from current results
    const currentNodes = handle.getLastResults()
    const initialValue = computeAggregation(
      definition.aggregation,
      currentNodes,
      definition.fieldId,
    )

    computedField.lastValue = initialValue

    // Update cached value in DB
    updateCachedValue(db, id, initialValue)
  }

  /**
   * Unregister subscription for a computed field
   */
  function unregisterSubscription(computedField: ActiveComputedField): void {
    if (computedField.subscriptionHandle) {
      computedField.subscriptionHandle.unsubscribe()
      computedField.subscriptionHandle = null
    }
  }

  /**
   * Load computed field definition from a node
   */
  function loadComputedFieldFromNode(
    db: Database,
    computedFieldId: string,
  ): { name: string; definition: ComputedFieldDefinition; value: number | null } | null {
    const node = assembleNode(db, computedFieldId)
    if (!node) return null

    // Check if it has the computed_field supertag
    const hasComputedFieldSupertag = node.supertags.some(
      (st) => st.systemId === COMPUTED_FIELD_SUPERTAG,
    )
    if (!hasComputedFieldSupertag) return null

    // Get definition from properties
    const definitionProp = Object.values(node.properties)
      .flat()
      .find((p) => p.fieldSystemId === COMPUTED_FIELD_FIELDS.DEFINITION)

    if (!definitionProp) return null

    let definition: ComputedFieldDefinition
    try {
      definition =
        typeof definitionProp.value === 'string'
          ? JSON.parse(definitionProp.value)
          : definitionProp.value
    } catch {
      console.error(
        `[ComputedFieldService] Failed to parse computed field definition for ${computedFieldId}`,
      )
      return null
    }

    // Get cached value from properties
    const valueProp = Object.values(node.properties)
      .flat()
      .find((p) => p.fieldSystemId === COMPUTED_FIELD_FIELDS.VALUE)

    let value: number | null = null
    if (valueProp) {
      const rawValue = valueProp.value
      if (typeof rawValue === 'number') {
        value = rawValue
      } else if (typeof rawValue === 'string') {
        const parsed = parseFloat(rawValue)
        value = isNaN(parsed) ? null : parsed
      }
    }

    return {
      name: node.content || '',
      definition,
      value,
    }
  }

  return {
    create(
      db: Database,
      options: {
        name: string
        definition: ComputedFieldDefinition
        ownerId?: string
      },
    ): string {
      const { name, definition, ownerId } = options

      // Ensure computed_field supertag exists
      const computedFieldSupertag = getSystemNode(db, COMPUTED_FIELD_SUPERTAG)
      if (!computedFieldSupertag) {
        throw new Error(
          `Computed field supertag (${COMPUTED_FIELD_SUPERTAG}) not found. Please bootstrap the database first.`,
        )
      }

      // Create computed field node
      const computedFieldId = createNode(db, {
        content: name,
        supertagId: COMPUTED_FIELD_SUPERTAG,
        ownerId,
      })

      // Set definition property
      setProperty(
        db,
        computedFieldId,
        COMPUTED_FIELD_FIELDS.DEFINITION,
        JSON.stringify(definition),
      )

      // Create active computed field and register subscription
      const active: ActiveComputedField = {
        id: computedFieldId,
        definition,
        subscriptionHandle: null,
        lastValue: null,
      }
      activeComputedFields.set(computedFieldId, active)
      registerSubscription(db, active)

      return computedFieldId
    },

    getValue(db: Database, computedFieldId: string): number | null {
      // First check active computed fields (most up-to-date)
      const active = activeComputedFields.get(computedFieldId)
      if (active) {
        return active.lastValue
      }

      // Fall back to cached value in DB
      const loaded = loadComputedFieldFromNode(db, computedFieldId)
      return loaded?.value ?? null
    },

    recompute(db: Database, computedFieldId: string): number | null {
      // Get or load the computed field
      let active = activeComputedFields.get(computedFieldId)

      if (!active) {
        // Load from DB and create active entry
        const loaded = loadComputedFieldFromNode(db, computedFieldId)
        if (!loaded) {
          console.error(
            `[ComputedFieldService] Computed field ${computedFieldId} not found`,
          )
          return null
        }

        active = {
          id: computedFieldId,
          definition: loaded.definition,
          subscriptionHandle: null,
          lastValue: loaded.value,
        }
        activeComputedFields.set(computedFieldId, active)
        registerSubscription(db, active)
      }

      // Get current results and recompute
      const handle = active.subscriptionHandle
      if (!handle) {
        console.error(
          `[ComputedFieldService] No subscription for computed field ${computedFieldId}`,
        )
        return null
      }

      const currentNodes = handle.getLastResults()
      const newValue = computeAggregation(
        active.definition.aggregation,
        currentNodes,
        active.definition.fieldId,
      )

      const previousValue = active.lastValue

      if (newValue !== previousValue) {
        active.lastValue = newValue
        updateCachedValue(db, computedFieldId, newValue)
        notifyValueChange(computedFieldId, previousValue, newValue)
      }

      return newValue
    },

    getAll(db: Database): ComputedField[] {
      const results: ComputedField[] = []

      // Find all nodes with supertag:computed_field
      const computedFieldSupertag = getSystemNode(db, COMPUTED_FIELD_SUPERTAG)
      if (!computedFieldSupertag) return results

      const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
      if (!supertagField) return results

      // Query for all computed field nodes via property lookup
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { nodeProperties } = require('../schemas/node-schema.js') as {
        nodeProperties: typeof import('../schemas/node-schema.js').nodeProperties
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { eq } = require('drizzle-orm') as typeof import('drizzle-orm')

      const computedFieldProps = db
        .select()
        .from(nodeProperties)
        .where(eq(nodeProperties.fieldNodeId, supertagField.id))
        .all() as Array<{ nodeId: string; value: string | null }>

      const filteredProps = computedFieldProps.filter((p) => {
        try {
          return JSON.parse(p.value || '') === computedFieldSupertag.id
        } catch {
          return false
        }
      })

      for (const prop of filteredProps) {
        const loaded = loadComputedFieldFromNode(db, prop.nodeId)
        if (loaded) {
          // Get the updatedAt from the node
          const node = assembleNode(db, prop.nodeId)
          const updatedAtProp = node?.properties
            ? Object.values(node.properties)
                .flat()
                .find((p) => p.fieldSystemId === COMPUTED_FIELD_FIELDS.UPDATED_AT)
            : undefined

          let updatedAt = new Date()
          if (updatedAtProp && typeof updatedAtProp.value === 'string') {
            updatedAt = new Date(updatedAtProp.value)
          }

          results.push({
            id: prop.nodeId,
            name: loaded.name,
            definition: loaded.definition,
            value: loaded.value,
            updatedAt,
          })
        }
      }

      return results
    },

    delete(db: Database, computedFieldId: string): void {
      // Unregister if active
      const active = activeComputedFields.get(computedFieldId)
      if (active) {
        unregisterSubscription(active)
        activeComputedFields.delete(computedFieldId)
      }

      // Remove listeners
      valueChangeListeners.delete(computedFieldId)

      // Soft delete the node
      deleteNode(db, computedFieldId)
    },

    onValueChange(
      computedFieldId: string,
      callback: ComputedFieldValueChangeCallback,
    ): () => void {
      if (!valueChangeListeners.has(computedFieldId)) {
        valueChangeListeners.set(computedFieldId, new Set())
      }
      valueChangeListeners.get(computedFieldId)!.add(callback)

      return () => {
        const listeners = valueChangeListeners.get(computedFieldId)
        if (listeners) {
          listeners.delete(callback)
          if (listeners.size === 0) {
            valueChangeListeners.delete(computedFieldId)
          }
        }
      }
    },

    activeCount(): number {
      return activeComputedFields.size
    },

    clear(): void {
      for (const active of activeComputedFields.values()) {
        unregisterSubscription(active)
      }
      activeComputedFields.clear()
      valueChangeListeners.clear()
    },

    initialize(db: Database): void {
      // Load all computed fields from database
      const allComputedFields = this.getAll(db)

      // Register subscriptions for each
      for (const cf of allComputedFields) {
        const active: ActiveComputedField = {
          id: cf.id,
          definition: cf.definition,
          subscriptionHandle: null,
          lastValue: cf.value,
        }
        activeComputedFields.set(cf.id, active)
        registerSubscription(db, active)
      }
    },
  }
}

/**
 * Default singleton instance
 * Services can use this directly or create their own instance for isolation
 */
export const computedFieldService = createComputedFieldService()
