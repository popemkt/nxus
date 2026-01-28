/**
 * automation.service.ts - Rules engine for reactive automations
 *
 * This module implements the AutomationService that manages automation rules.
 * Automations are triggered by query membership events (onEnter/onExit/onChange)
 * and execute actions like setting properties, adding/removing supertags.
 *
 * Key features:
 * - Automations are stored as nodes with supertag:automation
 * - Each enabled automation registers a query subscription
 * - Actions execute on query membership changes
 * - Cycle detection prevents infinite loops (max execution depth: 10)
 *
 * Phase 1 supports internal actions only:
 * - set_property
 * - add_supertag
 * - remove_supertag
 *
 * Phase 2 will add:
 * - create_node
 * - webhook (via async queue)
 * - threshold triggers
 */

import type { AssembledNode } from '../types/node.js'
import type {
  AutomationDefinition,
  AutomationState,
  AutomationAction,
  QueryMembershipTrigger,
  QueryResultChangeEvent,
} from './types.js'
import {
  isQueryMembershipTrigger,
  isSetPropertyAction,
  isAddSupertagAction,
  isRemoveSupertagAction,
  isNowMarker,
} from './types.js'
import {
  createQuerySubscriptionService,
  type QuerySubscriptionService,
  type SubscriptionHandle,
} from './query-subscription.service.js'
import {
  createNode,
  setProperty,
  addNodeSupertag,
  removeNodeSupertag,
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
 * Maximum execution depth to prevent infinite automation loops
 */
const MAX_EXECUTION_DEPTH = 10

/**
 * Local aliases for automation-related schema constants for convenience
 */
const AUTOMATION_FIELDS = {
  DEFINITION: SYSTEM_FIELDS.AUTOMATION_DEFINITION,
  STATE: SYSTEM_FIELDS.AUTOMATION_STATE,
  LAST_FIRED: SYSTEM_FIELDS.AUTOMATION_LAST_FIRED,
  ENABLED: SYSTEM_FIELDS.AUTOMATION_ENABLED,
} as const

const AUTOMATION_SUPERTAG = SYSTEM_SUPERTAGS.AUTOMATION

// ============================================================================
// Types
// ============================================================================

/**
 * Database type - accepts any object with the required methods
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = ReturnType<typeof getDatabase>

/**
 * Runtime automation tracking
 */
interface ActiveAutomation {
  id: string
  definition: AutomationDefinition
  subscriptionHandle: SubscriptionHandle | null
}

/**
 * Execution context for tracking depth and preventing cycles
 */
interface ExecutionContext {
  depth: number
  sourceAutomationId: string | null
  triggeringNodeIds: Set<string>
}

/**
 * Automation service interface
 */
export interface AutomationService {
  /**
   * Create a new automation (stored as node with supertag:automation)
   * @param db Database instance
   * @param definition Automation definition including trigger and action
   * @returns Automation node ID
   */
  create(db: Database, definition: AutomationDefinition): string

  /**
   * Enable or disable an automation
   * @param db Database instance
   * @param automationId Automation node ID
   * @param enabled Whether to enable the automation
   */
  setEnabled(db: Database, automationId: string, enabled: boolean): void

  /**
   * Get all automations with their definitions and states
   * @param db Database instance
   */
  getAll(
    db: Database,
  ): Array<{
    id: string
    definition: AutomationDefinition
    state: AutomationState
  }>

  /**
   * Delete an automation
   * @param db Database instance
   * @param automationId Automation node ID
   */
  delete(db: Database, automationId: string): void

  /**
   * Manually trigger an automation (for testing)
   * @param db Database instance
   * @param automationId Automation node ID
   * @param context Trigger context with nodeId and/or computedFieldValue
   */
  trigger(
    db: Database,
    automationId: string,
    context: { nodeId?: string; computedFieldValue?: number },
  ): void

  /**
   * Get the number of active (enabled and subscribed) automations
   */
  activeCount(): number

  /**
   * Clear all active automations (for testing)
   */
  clear(): void

  /**
   * Initialize the service by loading all enabled automations from DB
   * Should be called once when the application starts
   * @param db Database instance
   */
  initialize(db: Database): void
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new AutomationService instance
 *
 * @param querySubscriptionServiceInstance Optional query subscription service (defaults to creating new one)
 * @returns AutomationService instance
 */
export function createAutomationService(
  querySubscriptionServiceInstance?: QuerySubscriptionService,
): AutomationService {
  const activeAutomations = new Map<string, ActiveAutomation>()
  const queryService =
    querySubscriptionServiceInstance || createQuerySubscriptionService()

  // Current execution depth (for cycle detection)
  let currentExecutionDepth = 0

  /**
   * Execute an action on a target node
   */
  function executeAction(
    db: Database,
    action: AutomationAction,
    targetNodeId: string,
    automationId: string,
    context: ExecutionContext,
  ): void {
    // Cycle detection
    if (context.depth >= MAX_EXECUTION_DEPTH) {
      console.warn(
        `[AutomationService] Max execution depth (${MAX_EXECUTION_DEPTH}) reached for automation ${automationId}. Stopping to prevent infinite loop.`,
      )
      return
    }

    // Prevent re-triggering on the same node in the same chain
    if (context.triggeringNodeIds.has(targetNodeId)) {
      console.warn(
        `[AutomationService] Cycle detected: node ${targetNodeId} already triggered in this execution chain. Skipping.`,
      )
      return
    }

    // Track this node as triggered BEFORE executing (so nested calls can detect cycles)
    context.triggeringNodeIds.add(targetNodeId)

    // Increment depth for nested executions
    currentExecutionDepth = context.depth + 1

    try {
      if (isSetPropertyAction(action)) {
        let value = action.value
        // Handle $now marker for timestamps
        if (isNowMarker(value)) {
          value = new Date().toISOString()
        }
        setProperty(db, targetNodeId, action.fieldSystemId, value)
      } else if (isAddSupertagAction(action)) {
        addNodeSupertag(db, targetNodeId, action.supertagSystemId)
      } else if (isRemoveSupertagAction(action)) {
        removeNodeSupertag(db, targetNodeId, action.supertagSystemId)
      }
      // Phase 2 will add: create_node, webhook
    } catch (error) {
      console.error(
        `[AutomationService] Error executing action for automation ${automationId} on node ${targetNodeId}:`,
        error,
      )
    } finally {
      currentExecutionDepth = context.depth
    }
  }

  /**
   * Handle query result changes for an automation
   */
  function handleQueryResultChange(
    db: Database,
    automation: ActiveAutomation,
    event: QueryResultChangeEvent,
  ): void {
    const { definition, id: automationId } = automation
    const trigger = definition.trigger as QueryMembershipTrigger

    // Build execution context
    // Note: triggeringNodeIds starts empty and tracks nodes that have been acted upon
    // during this execution chain. This allows the first action to execute while
    // preventing infinite loops if the action causes the same node to re-enter the query.
    const context: ExecutionContext = {
      depth: currentExecutionDepth,
      sourceAutomationId: automationId,
      triggeringNodeIds: new Set<string>(),
    }

    // Determine which nodes to act on based on the trigger event type
    let targetNodes: AssembledNode[] = []

    switch (trigger.event) {
      case 'onEnter':
        targetNodes = event.added
        break
      case 'onExit':
        targetNodes = event.removed
        break
      case 'onChange':
        targetNodes = event.changed
        break
    }

    // Execute action on each target node
    for (const node of targetNodes) {
      executeAction(db, definition.action, node.id, automationId, context)

      // Update last fired timestamp
      const now = new Date()
      try {
        // Ensure the field exists before setting
        const lastFiredField = getSystemNode(db, AUTOMATION_FIELDS.LAST_FIRED)
        if (lastFiredField) {
          setProperty(
            db,
            automationId,
            AUTOMATION_FIELDS.LAST_FIRED,
            now.toISOString(),
          )
        }
      } catch {
        // Ignore errors updating last fired - the main action is what matters
      }
    }
  }

  /**
   * Register a query subscription for an automation
   */
  function registerSubscription(
    db: Database,
    automation: ActiveAutomation,
  ): void {
    const { definition, id: automationId } = automation

    // Only query_membership triggers are supported in Phase 1
    if (!isQueryMembershipTrigger(definition.trigger)) {
      console.warn(
        `[AutomationService] Automation ${automationId} has unsupported trigger type: ${definition.trigger.type}`,
      )
      return
    }

    const trigger = definition.trigger

    // Subscribe to the query
    const handle = queryService.subscribe(
      db,
      trigger.queryDefinition,
      (event) => {
        handleQueryResultChange(db, automation, event)
      },
    )

    automation.subscriptionHandle = handle
  }

  /**
   * Unregister subscription for an automation
   */
  function unregisterSubscription(automation: ActiveAutomation): void {
    if (automation.subscriptionHandle) {
      automation.subscriptionHandle.unsubscribe()
      automation.subscriptionHandle = null
    }
  }

  /**
   * Load automation definition and state from a node
   */
  function loadAutomationFromNode(
    db: Database,
    automationId: string,
  ): { definition: AutomationDefinition; state: AutomationState } | null {
    const node = assembleNode(db, automationId)
    if (!node) return null

    // Check if it has the automation supertag
    const hasAutomationSupertag = node.supertags.some(
      (st) => st.systemId === AUTOMATION_SUPERTAG,
    )
    if (!hasAutomationSupertag) return null

    // Get definition from properties
    const definitionProp = Object.values(node.properties)
      .flat()
      .find((p) => p.fieldSystemId === AUTOMATION_FIELDS.DEFINITION)

    if (!definitionProp) return null

    let definition: AutomationDefinition
    try {
      definition =
        typeof definitionProp.value === 'string'
          ? JSON.parse(definitionProp.value)
          : definitionProp.value
    } catch {
      console.error(
        `[AutomationService] Failed to parse automation definition for ${automationId}`,
      )
      return null
    }

    // Get state from properties (optional)
    const stateProp = Object.values(node.properties)
      .flat()
      .find((p) => p.fieldSystemId === AUTOMATION_FIELDS.STATE)

    let state: AutomationState = {}
    if (stateProp) {
      try {
        state =
          typeof stateProp.value === 'string'
            ? JSON.parse(stateProp.value)
            : stateProp.value
      } catch {
        // Use empty state if parsing fails
      }
    }

    return { definition, state }
  }

  return {
    create(db: Database, definition: AutomationDefinition): string {
      // Ensure automation supertag exists
      const automationSupertag = getSystemNode(db, AUTOMATION_SUPERTAG)
      if (!automationSupertag) {
        throw new Error(
          `Automation supertag (${AUTOMATION_SUPERTAG}) not found. Please bootstrap the database first.`,
        )
      }

      // Create automation node
      const automationId = createNode(db, {
        content: definition.name,
        supertagSystemId: AUTOMATION_SUPERTAG,
      })

      // Set definition property
      setProperty(
        db,
        automationId,
        AUTOMATION_FIELDS.DEFINITION,
        JSON.stringify(definition),
      )

      // Set enabled property
      setProperty(db, automationId, AUTOMATION_FIELDS.ENABLED, definition.enabled)

      // Set initial state
      const initialState: AutomationState = {}
      setProperty(
        db,
        automationId,
        AUTOMATION_FIELDS.STATE,
        JSON.stringify(initialState),
      )

      // If enabled, register subscription
      if (definition.enabled) {
        const automation: ActiveAutomation = {
          id: automationId,
          definition,
          subscriptionHandle: null,
        }
        activeAutomations.set(automationId, automation)
        registerSubscription(db, automation)
      }

      return automationId
    },

    setEnabled(db: Database, automationId: string, enabled: boolean): void {
      // Update enabled property in DB
      setProperty(db, automationId, AUTOMATION_FIELDS.ENABLED, enabled)

      // Also update the definition's enabled flag
      const loaded = loadAutomationFromNode(db, automationId)
      if (loaded) {
        loaded.definition.enabled = enabled
        setProperty(
          db,
          automationId,
          AUTOMATION_FIELDS.DEFINITION,
          JSON.stringify(loaded.definition),
        )
      }

      if (enabled) {
        // If becoming enabled, load and register
        if (!activeAutomations.has(automationId)) {
          const loadedData = loadAutomationFromNode(db, automationId)
          if (loadedData) {
            const automation: ActiveAutomation = {
              id: automationId,
              definition: loadedData.definition,
              subscriptionHandle: null,
            }
            activeAutomations.set(automationId, automation)
            registerSubscription(db, automation)
          }
        }
      } else {
        // If becoming disabled, unregister
        const automation = activeAutomations.get(automationId)
        if (automation) {
          unregisterSubscription(automation)
          activeAutomations.delete(automationId)
        }
      }
    },

    getAll(
      db: Database,
    ): Array<{
      id: string
      definition: AutomationDefinition
      state: AutomationState
    }> {
      const results: Array<{
        id: string
        definition: AutomationDefinition
        state: AutomationState
      }> = []

      // Find all nodes with supertag:automation
      const automationSupertag = getSystemNode(db, AUTOMATION_SUPERTAG)
      if (!automationSupertag) return results

      const supertagField = getSystemNode(db, SYSTEM_FIELDS.SUPERTAG)
      if (!supertagField) return results

      // Query for all automation nodes via property lookup
      // Import nodeProperties schema at the top level would cause circular deps
      // Using dynamic import pattern here
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { nodeProperties } = require('../schemas/node-schema.js') as {
        nodeProperties: typeof import('../schemas/node-schema.js').nodeProperties
      }
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { eq } = require('drizzle-orm') as typeof import('drizzle-orm')

      const automationProps = db
        .select()
        .from(nodeProperties)
        .where(eq(nodeProperties.fieldNodeId, supertagField.id))
        .all() as Array<{ nodeId: string; value: string | null }>

      const filteredProps = automationProps.filter((p) => {
        try {
          return JSON.parse(p.value || '') === automationSupertag.id
        } catch {
          return false
        }
      })

      for (const prop of filteredProps) {
        const loaded = loadAutomationFromNode(db, prop.nodeId)
        if (loaded) {
          results.push({
            id: prop.nodeId,
            definition: loaded.definition,
            state: loaded.state,
          })
        }
      }

      return results
    },

    delete(db: Database, automationId: string): void {
      // Unregister if active
      const automation = activeAutomations.get(automationId)
      if (automation) {
        unregisterSubscription(automation)
        activeAutomations.delete(automationId)
      }

      // Soft delete the node
      deleteNode(db, automationId)
    },

    trigger(
      db: Database,
      automationId: string,
      context: { nodeId?: string; computedFieldValue?: number },
    ): void {
      // Load automation
      const loaded = loadAutomationFromNode(db, automationId)
      if (!loaded) {
        console.error(
          `[AutomationService] Automation ${automationId} not found for manual trigger`,
        )
        return
      }

      if (!context.nodeId) {
        console.error(
          `[AutomationService] Manual trigger requires nodeId in context`,
        )
        return
      }

      // Get the target node
      const targetNode = assembleNode(db, context.nodeId)
      if (!targetNode) {
        console.error(
          `[AutomationService] Target node ${context.nodeId} not found`,
        )
        return
      }

      // Execute action
      // Note: triggeringNodeIds starts empty - it will track nodes as we act on them
      // to prevent cycles in nested automations
      const execContext: ExecutionContext = {
        depth: 0,
        sourceAutomationId: automationId,
        triggeringNodeIds: new Set<string>(),
      }

      executeAction(
        db,
        loaded.definition.action,
        context.nodeId,
        automationId,
        execContext,
      )

      // Update last fired timestamp
      const now = new Date()
      try {
        setProperty(
          db,
          automationId,
          AUTOMATION_FIELDS.LAST_FIRED,
          now.toISOString(),
        )
      } catch {
        // Ignore errors updating last fired
      }
    },

    activeCount(): number {
      return activeAutomations.size
    },

    clear(): void {
      for (const automation of activeAutomations.values()) {
        unregisterSubscription(automation)
      }
      activeAutomations.clear()
      currentExecutionDepth = 0
    },

    initialize(db: Database): void {
      // Load all automations from database
      const allAutomations = this.getAll(db)

      // Register subscriptions for enabled ones
      for (const auto of allAutomations) {
        if (auto.definition.enabled) {
          const automation: ActiveAutomation = {
            id: auto.id,
            definition: auto.definition,
            subscriptionHandle: null,
          }
          activeAutomations.set(auto.id, automation)
          registerSubscription(db, automation)
        }
      }
    },
  }
}

/**
 * Default singleton instance
 * Services can use this directly or create their own instance for isolation
 */
export const automationService = createAutomationService()
