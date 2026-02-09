/**
 * event-bus.ts - In-memory pub/sub event bus for mutation events
 *
 * This module implements a simple in-memory event bus for broadcasting
 * mutation events to subscribers. It supports:
 * - Subscribing with optional filters
 * - Emitting events to all matching listeners
 * - Async listener support
 * - Error isolation between listeners
 */

import type { MutationEvent, MutationListener, EventFilter, EventBus } from './types.js'
import { reactiveMetrics } from './metrics.js'

/**
 * Internal subscriber entry with listener and optional filter
 */
interface Subscriber {
  id: string
  listener: MutationListener
  filter?: EventFilter
}

/**
 * Maximum number of subscribers before emitting a warning.
 * Similar to Node.js EventEmitter maxListeners, this helps detect subscription leaks.
 */
const MAX_SUBSCRIBERS = 50

/**
 * Creates a new event bus instance
 */
export function createEventBus(): EventBus {
  const subscribers = new Map<string, Subscriber>()
  let nextId = 0
  let maxSubscribersWarned = false

  /**
   * Check if an event matches a filter
   */
  function matchesFilter(event: MutationEvent, filter: EventFilter): boolean {
    // Check event type filter
    if (filter.types && filter.types.length > 0) {
      if (!filter.types.includes(event.type)) {
        return false
      }
    }

    // Check node ID filter
    if (filter.nodeIds && filter.nodeIds.length > 0) {
      if (!filter.nodeIds.includes(event.nodeId)) {
        return false
      }
    }

    // Check field ID filter (for property events)
    if (filter.fieldIds && filter.fieldIds.length > 0) {
      if (!event.fieldId || !filter.fieldIds.includes(event.fieldId)) {
        return false
      }
    }

    // Check supertag ID filter (for supertag events)
    if (filter.supertagIds && filter.supertagIds.length > 0) {
      if (!event.supertagId || !filter.supertagIds.includes(event.supertagId)) {
        return false
      }
    }

    return true
  }

  return {
    subscribe(listener: MutationListener, filter?: EventFilter): () => void {
      const id = `sub_${nextId++}`
      subscribers.set(id, { id, listener, filter })

      // Warn if subscriber count exceeds threshold (potential leak detection)
      if (subscribers.size > MAX_SUBSCRIBERS && !maxSubscribersWarned) {
        maxSubscribersWarned = true
        console.warn(
          `[EventBus] Subscriber count (${subscribers.size}) exceeds threshold of ${MAX_SUBSCRIBERS}. ` +
            `This may indicate a subscription leak. Check that all subscriptions are being properly unsubscribed.`,
        )
      }

      // Return unsubscribe function
      return () => {
        subscribers.delete(id)
        // Reset warning flag when count drops back below threshold
        if (subscribers.size <= MAX_SUBSCRIBERS) {
          maxSubscribersWarned = false
        }
      }
    },

    emit(event: MutationEvent): void {
      // Track event in metrics
      reactiveMetrics.incrementEventCount()

      for (const subscriber of Array.from(subscribers.values())) {
        // Check if event matches subscriber's filter
        if (subscriber.filter && !matchesFilter(event, subscriber.filter)) {
          continue
        }

        // Execute listener with error isolation
        try {
          const result = subscriber.listener(event)

          // Handle async listeners - fire and forget but log errors
          if (result instanceof Promise) {
            result.catch((error) => {
              console.error(
                `[EventBus] Async listener error for subscription ${subscriber.id}:`,
                error,
              )
            })
          }
        } catch (error) {
          // Log error but don't stop other listeners
          console.error(
            `[EventBus] Sync listener error for subscription ${subscriber.id}:`,
            error,
          )
        }
      }
    },

    listenerCount(): number {
      return subscribers.size
    },

    clear(): void {
      subscribers.clear()
    },
  }
}

/**
 * Singleton event bus instance for the reactive system
 *
 * This is the primary event bus used by mutation functions to emit events.
 * Services like QuerySubscriptionService and AutomationService subscribe to this bus.
 */
export const eventBus = createEventBus()
