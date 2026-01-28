/**
 * query-subscription.service.ts - Live query subscription management
 *
 * This module implements the QuerySubscriptionService that manages reactive
 * query subscriptions. It:
 *
 * - Registers query subscriptions with callbacks
 * - Auto-subscribes to the event bus for mutation events
 * - Re-evaluates queries when relevant mutations occur
 * - Computes diffs (added/removed/changed nodes) between evaluations
 * - Delivers change events to subscription callbacks
 *
 * Phase 1: Brute-force re-evaluation (all subscriptions on any mutation)
 * Phase 3: Smart invalidation using dependency tracking (current implementation)
 *
 * Smart invalidation analyzes each query's filters to determine which fields/
 * supertags it depends on, then only re-evaluates subscriptions affected by
 * each mutation event.
 */

import type { QueryDefinition } from '../types/query.js'
import type { AssembledNode } from '../types/node.js'
import type {
  EventBus,
  MutationEvent,
  QuerySubscription,
  QueryResultChangeEvent,
} from './types.js'
import { eventBus as defaultEventBus } from './event-bus.js'
import { evaluateQuery } from '../services/query-evaluator.service.js'
import {
  createDependencyTracker,
  type DependencyTracker,
} from './dependency-tracker.js'
import { reactiveMetrics } from './metrics.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Database type - accepts any object with the required methods
 * This allows the service to work with any drizzle database instance
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Database = any

/**
 * Callback for query result changes
 */
export type QueryResultChangeCallback = (event: QueryResultChangeEvent) => void

/**
 * Subscription handle returned to the caller
 */
export interface SubscriptionHandle {
  /** Unique subscription ID */
  id: string
  /** Unsubscribe and stop receiving events */
  unsubscribe: () => void
  /** Get the current results (synchronous) */
  getLastResults: () => AssembledNode[]
}

/**
 * Query subscription service interface
 */
export interface QuerySubscriptionService {
  /**
   * Subscribe to a query's results with automatic re-evaluation on mutations
   *
   * @param db - Database instance for query evaluation
   * @param definition - Query definition to subscribe to
   * @param onResultChange - Callback for result changes
   * @returns Subscription handle with id, unsubscribe, and getLastResults
   */
  subscribe(
    db: Database,
    definition: QueryDefinition,
    onResultChange: QueryResultChangeCallback,
  ): SubscriptionHandle

  /**
   * Unsubscribe by subscription ID
   *
   * @param subscriptionId - ID of the subscription to remove
   */
  unsubscribe(subscriptionId: string): void

  /**
   * Get all active subscriptions (for debugging/monitoring)
   */
  getActiveSubscriptions(): QuerySubscription[]

  /**
   * Force re-evaluate all subscriptions
   * Useful for testing or manual refresh
   *
   * @param db - Database instance
   */
  refreshAll(db: Database): void

  /**
   * Get the number of active subscriptions
   */
  subscriptionCount(): number

  /**
   * Clear all subscriptions (for testing)
   */
  clear(): void

  /**
   * Enable or disable smart invalidation (for testing/comparison)
   * When disabled, falls back to brute-force re-evaluation
   *
   * @param enabled - Whether to use smart invalidation
   */
  setSmartInvalidation(enabled: boolean): void

  /**
   * Check if smart invalidation is enabled
   */
  isSmartInvalidationEnabled(): boolean

  /**
   * Get the dependency tracker (for testing/debugging)
   */
  getDependencyTracker(): DependencyTracker

  /**
   * Set the debounce window for batching mutations
   * When debounceMs > 0, mutations are collected during the window and
   * subscriptions are evaluated once after the window expires.
   * When debounceMs = 0, mutations are processed immediately (no batching).
   *
   * @param ms - Debounce window in milliseconds (default: 10)
   */
  setDebounceMs(ms: number): void

  /**
   * Get the current debounce window setting
   */
  getDebounceMs(): number

  /**
   * Flush any pending batched mutations immediately
   * Useful for testing to avoid waiting for debounce timeout
   */
  flushPendingMutations(): void
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Internal subscription entry with additional metadata
 */
interface InternalSubscription extends QuerySubscription {
  db: Database
  callback: QueryResultChangeCallback
  lastAssembledNodes: Map<string, AssembledNode>
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new QuerySubscriptionService instance
 *
 * @param eventBusInstance - Event bus to subscribe to (defaults to singleton)
 * @returns QuerySubscriptionService instance
 */
export function createQuerySubscriptionService(
  eventBusInstance: EventBus = defaultEventBus,
): QuerySubscriptionService {
  const subscriptions = new Map<string, InternalSubscription>()
  let nextId = 0
  let eventBusUnsubscribe: (() => void) | null = null

  // Dependency tracker for smart invalidation
  const dependencyTracker = createDependencyTracker()
  let smartInvalidationEnabled = true

  // Batching state
  // Default 0ms = immediate processing (no batching) for backward compatibility
  // Use setDebounceMs(ms) to enable batching, e.g., setDebounceMs(10) for 10ms window
  let debounceMs = 0
  let pendingMutations: MutationEvent[] = []
  let debounceTimer: ReturnType<typeof setTimeout> | null = null

  /**
   * Compute a hash/signature for an AssembledNode to detect changes
   * This compares relevant fields that would indicate a meaningful change
   */
  function computeNodeSignature(node: AssembledNode): string {
    // Include content, properties, and supertags in the signature
    const propsSignature = Object.entries(node.properties)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, values]) => {
        const sortedValues = values
          .slice()
          .sort((a, b) => a.order - b.order)
          .map((v) => v.rawValue)
          .join('|')
        return `${key}:${sortedValues}`
      })
      .join(';')

    const supertagsSignature = node.supertags
      .map((s) => s.systemId || s.id)
      .sort()
      .join(',')

    return `${node.content}::${propsSignature}::${supertagsSignature}`
  }

  /**
   * Compare two AssembledNodes to see if they've changed
   */
  function hasNodeChanged(oldNode: AssembledNode, newNode: AssembledNode): boolean {
    return computeNodeSignature(oldNode) !== computeNodeSignature(newNode)
  }

  /**
   * Evaluate a subscription and compute the diff from last results
   */
  function evaluateAndDiff(
    subscription: InternalSubscription,
  ): QueryResultChangeEvent | null {
    const startTime = performance.now()
    const { db, queryDefinition, lastResults, lastAssembledNodes } = subscription

    // Evaluate the query
    const result = evaluateQuery(db, queryDefinition)
    const newNodeIds = new Set(result.nodes.map((n) => n.id))
    const newNodesMap = new Map(result.nodes.map((n) => [n.id, n]))

    // Compute diff
    const added: AssembledNode[] = []
    const removed: AssembledNode[] = []
    const changed: AssembledNode[] = []

    // Find added nodes (in new results but not in last)
    for (const node of result.nodes) {
      if (!lastResults.has(node.id)) {
        added.push(node)
      }
    }

    // Find removed nodes (in last but not in new)
    for (const id of lastResults) {
      if (!newNodeIds.has(id)) {
        const oldNode = lastAssembledNodes.get(id)
        if (oldNode) {
          removed.push(oldNode)
        }
      }
    }

    // Find changed nodes (in both but different)
    for (const node of result.nodes) {
      if (lastResults.has(node.id)) {
        const oldNode = lastAssembledNodes.get(node.id)
        if (oldNode && hasNodeChanged(oldNode, node)) {
          changed.push(node)
        }
      }
    }

    // Update subscription state
    subscription.lastResults = newNodeIds
    subscription.lastNodeStates = newNodesMap
    subscription.lastAssembledNodes = newNodesMap
    subscription.lastEvaluatedAt = result.evaluatedAt

    // Record evaluation metrics
    const durationMs = performance.now() - startTime
    reactiveMetrics.recordEvaluation(durationMs)

    // Only return event if there are actual changes
    if (added.length === 0 && removed.length === 0 && changed.length === 0) {
      return null
    }

    return {
      subscriptionId: subscription.id,
      added,
      removed,
      changed,
      totalCount: result.totalCount,
      evaluatedAt: result.evaluatedAt,
    }
  }

  /**
   * Evaluate a single subscription and deliver the change event if any
   */
  function evaluateSubscription(subscription: InternalSubscription): void {
    const changeEvent = evaluateAndDiff(subscription)
    if (changeEvent) {
      // Deliver the change event to the callback
      try {
        subscription.callback(changeEvent)
      } catch (error) {
        console.error(
          `[QuerySubscriptionService] Callback error for subscription ${subscription.id}:`,
          error,
        )
      }
    }
  }

  /**
   * Process batched mutations by collecting affected subscriptions and evaluating each once
   *
   * This is the core batching logic that:
   * 1. Collects all affected subscription IDs from all pending mutations
   * 2. Evaluates each affected subscription exactly once
   * 3. Clears the pending mutations
   */
  function processBatchedMutations(): void {
    if (pendingMutations.length === 0) return

    const mutationsToProcess = pendingMutations
    pendingMutations = []
    debounceTimer = null

    if (smartInvalidationEnabled) {
      // Smart invalidation: collect all affected subscriptions from all mutations
      const subscriptionsToEvaluate = new Set<string>()

      for (const event of mutationsToProcess) {
        // 1. Check for query membership changes (node could enter/exit results)
        const { affectedIds } = dependencyTracker.getAffectedSubscriptions(event)
        for (const id of affectedIds) {
          subscriptionsToEvaluate.add(id)
        }

        // 2. Check if the mutated node is already in any subscription's results
        // This is needed to detect "changed" events (node still matches but changed)
        const mutatedNodeId = event.nodeId
        for (const subscription of subscriptions.values()) {
          if (subscription.lastResults.has(mutatedNodeId)) {
            subscriptionsToEvaluate.add(subscription.id)
          }
        }
      }

      // Track skipped evaluations (subscriptions not affected by these mutations)
      const skippedCount = subscriptions.size - subscriptionsToEvaluate.size
      for (let i = 0; i < skippedCount; i++) {
        reactiveMetrics.incrementSkippedEvaluations()
      }

      // Evaluate all affected subscriptions (each subscription only once)
      for (const id of subscriptionsToEvaluate) {
        const subscription = subscriptions.get(id)
        if (subscription) {
          evaluateSubscription(subscription)
        }
      }
    } else {
      // Brute force: re-evaluate all subscriptions once
      for (const subscription of subscriptions.values()) {
        evaluateSubscription(subscription)
      }
    }
  }

  /**
   * Handle a mutation event by batching and re-evaluating affected subscriptions
   *
   * When debounceMs > 0:
   * - Mutations are collected in pendingMutations array
   * - After debounce window, all affected subscriptions are evaluated once
   *
   * When debounceMs = 0:
   * - Mutations are processed immediately (no batching)
   *
   * Smart invalidation strategy:
   * 1. Check if mutation could affect query membership (add/remove nodes)
   *    using the dependency tracker
   * 2. Also check if mutation affects a node that's already in any
   *    subscription's result set (detect changes to existing results)
   *
   * Brute force fallback: Re-evaluate all subscriptions on any mutation.
   */
  function handleMutationEvent(event: MutationEvent): void {
    if (debounceMs === 0) {
      // No batching - process immediately
      pendingMutations = [event]
      processBatchedMutations()
    } else {
      // Batching enabled - collect mutation and schedule processing
      pendingMutations.push(event)

      // Reset the timer on each new mutation
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }

      debounceTimer = setTimeout(() => {
        processBatchedMutations()
      }, debounceMs)
    }
  }

  /**
   * Ensure we're subscribed to the event bus
   */
  function ensureEventBusSubscription(): void {
    if (!eventBusUnsubscribe && subscriptions.size > 0) {
      eventBusUnsubscribe = eventBusInstance.subscribe(handleMutationEvent)
    }
  }

  /**
   * Clean up event bus subscription if no more subscriptions
   */
  function maybeUnsubscribeFromEventBus(): void {
    if (eventBusUnsubscribe && subscriptions.size === 0) {
      eventBusUnsubscribe()
      eventBusUnsubscribe = null
    }
  }

  return {
    subscribe(
      db: Database,
      definition: QueryDefinition,
      onResultChange: QueryResultChangeCallback,
    ): SubscriptionHandle {
      const id = `qsub_${nextId++}`

      // Initial evaluation
      const initialResult = evaluateQuery(db, definition)
      const initialNodeIds = new Set(initialResult.nodes.map((n) => n.id))
      const initialNodesMap = new Map(initialResult.nodes.map((n) => [n.id, n]))

      // Create subscription entry
      const subscription: InternalSubscription = {
        id,
        queryDefinition: definition,
        lastResults: initialNodeIds,
        lastNodeStates: initialNodesMap,
        lastAssembledNodes: initialNodesMap,
        lastEvaluatedAt: initialResult.evaluatedAt,
        db,
        callback: onResultChange,
        onResultChange,
      }

      subscriptions.set(id, subscription)

      // Register dependencies for smart invalidation
      dependencyTracker.register(id, definition)

      // Update active subscription metrics
      reactiveMetrics.setActiveSubscriptions(subscriptions.size)

      // Ensure we're listening to the event bus
      ensureEventBusSubscription()

      // Return handle
      return {
        id,
        unsubscribe: () => {
          subscriptions.delete(id)
          dependencyTracker.unregister(id)
          reactiveMetrics.setActiveSubscriptions(subscriptions.size)
          maybeUnsubscribeFromEventBus()
        },
        getLastResults: () => {
          const sub = subscriptions.get(id)
          if (!sub) return []
          return Array.from(sub.lastAssembledNodes.values())
        },
      }
    },

    unsubscribe(subscriptionId: string): void {
      subscriptions.delete(subscriptionId)
      dependencyTracker.unregister(subscriptionId)
      reactiveMetrics.setActiveSubscriptions(subscriptions.size)
      maybeUnsubscribeFromEventBus()
    },

    getActiveSubscriptions(): QuerySubscription[] {
      return Array.from(subscriptions.values()).map((s) => ({
        id: s.id,
        queryDefinition: s.queryDefinition,
        lastResults: s.lastResults,
        lastNodeStates: s.lastNodeStates,
        lastEvaluatedAt: s.lastEvaluatedAt,
        onResultChange: s.onResultChange,
      }))
    },

    refreshAll(db: Database): void {
      for (const subscription of subscriptions.values()) {
        // Update db reference in case it changed
        subscription.db = db
        const changeEvent = evaluateAndDiff(subscription)
        if (changeEvent) {
          try {
            subscription.callback(changeEvent)
          } catch (error) {
            console.error(
              `[QuerySubscriptionService] Callback error for subscription ${subscription.id}:`,
              error,
            )
          }
        }
      }
    },

    subscriptionCount(): number {
      return subscriptions.size
    },

    clear(): void {
      // Cancel any pending debounce timer
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
      }
      pendingMutations = []
      subscriptions.clear()
      dependencyTracker.clear()
      reactiveMetrics.setActiveSubscriptions(0)
      maybeUnsubscribeFromEventBus()
    },

    setSmartInvalidation(enabled: boolean): void {
      smartInvalidationEnabled = enabled
    },

    isSmartInvalidationEnabled(): boolean {
      return smartInvalidationEnabled
    },

    getDependencyTracker(): DependencyTracker {
      return dependencyTracker
    },

    setDebounceMs(ms: number): void {
      debounceMs = ms
    },

    getDebounceMs(): number {
      return debounceMs
    },

    flushPendingMutations(): void {
      if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
      }
      processBatchedMutations()
    },
  }
}

/**
 * Default singleton instance
 * Services can use this directly or create their own instance for isolation
 */
export const querySubscriptionService = createQuerySubscriptionService()
