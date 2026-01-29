/**
 * reactive.server.ts - TanStack server functions for the reactive query system
 *
 * This file exposes the reactive services (computed fields, automations, query subscriptions)
 * through TanStack Start server functions. These server functions wrap the pure service
 * functions from @nxus/db/server.
 *
 * IMPORTANT: All @nxus/db/server imports are done dynamically inside handlers
 * to prevent Vite from bundling better-sqlite3 into the client bundle.
 *
 * Server Functions:
 * - Computed Fields: create, getValue, recompute, getAll, delete
 * - Automations: create, getAll, setEnabled, delete, trigger
 * - Query Subscriptions: subscribe (returns ID), unsubscribe
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

// Import Zod schemas for validation - these are type-only safe imports
import {
  ComputedFieldDefinitionSchema,
  AutomationDefinitionSchema,
  type QueryResultChangeEvent,
  type AssembledNode,
} from '@nxus/db'

// ============================================================================
// Query Definition Schema (for validation)
// ============================================================================

/**
 * QueryDefinition schema for validating query inputs
 * Using z.any() for filters since they're complex and already validated in @nxus/db
 */
const QueryDefinitionSchema = z.object({
  filters: z.array(z.any()),
  sort: z.any().optional(),
  limit: z.number().optional(),
})

// ============================================================================
// Computed Field Server Functions
// ============================================================================

/**
 * Create a new computed field
 *
 * Creates a computed field node that aggregates data from query results.
 * The field automatically updates when the underlying data changes.
 */
export const createComputedFieldServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      name: z.string(),
      definition: ComputedFieldDefinitionSchema,
      ownerId: z.string().optional(),
    }),
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, computedFieldService } = await import(
      '@nxus/db/server'
    )
    const { name, definition, ownerId } = ctx.data

    const db = await initDatabaseWithBootstrap()

    const computedFieldId = computedFieldService.create(db, {
      name,
      definition,
      ownerId,
    })

    // Get the initial value
    const value = computedFieldService.getValue(db, computedFieldId)

    return {
      success: true as const,
      computedFieldId,
      value,
    }
  })

/**
 * Get the current value of a computed field
 */
export const getComputedFieldValueServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ computedFieldId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, computedFieldService } = await import(
      '@nxus/db/server'
    )
    const { computedFieldId } = ctx.data

    const db = await initDatabaseWithBootstrap()

    const value = computedFieldService.getValue(db, computedFieldId)

    return {
      success: true as const,
      computedFieldId,
      value,
    }
  })

/**
 * Force recompute a computed field's value
 *
 * Useful for ensuring the value is up-to-date or debugging.
 */
export const recomputeComputedFieldServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ computedFieldId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, computedFieldService } = await import(
      '@nxus/db/server'
    )
    const { computedFieldId } = ctx.data

    const db = await initDatabaseWithBootstrap()

    const value = computedFieldService.recompute(db, computedFieldId)

    return {
      success: true as const,
      computedFieldId,
      value,
    }
  })

/**
 * Get all computed fields with their current values
 */
export const getAllComputedFieldsServerFn = createServerFn({
  method: 'GET',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
}).handler(async (): Promise<any> => {
  const { initDatabaseWithBootstrap, computedFieldService } = await import(
    '@nxus/db/server'
  )

  const db = await initDatabaseWithBootstrap()

  const computedFields = computedFieldService.getAll(db)

  return {
    success: true as const,
    computedFields,
  }
})

/**
 * Delete a computed field
 */
export const deleteComputedFieldServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ computedFieldId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, computedFieldService } = await import(
      '@nxus/db/server'
    )
    const { computedFieldId } = ctx.data

    const db = await initDatabaseWithBootstrap()

    computedFieldService.delete(db, computedFieldId)

    return {
      success: true as const,
    }
  })

// ============================================================================
// Automation Server Functions
// ============================================================================

/**
 * Create a new automation
 *
 * Creates an automation node with a trigger and action.
 * Supported triggers: query_membership, threshold
 * Supported actions: set_property, add_supertag, remove_supertag, webhook
 */
export const createAutomationServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ definition: AutomationDefinitionSchema }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, automationService } = await import(
      '@nxus/db/server'
    )
    const { definition } = ctx.data

    const db = await initDatabaseWithBootstrap()

    const automationId = automationService.create(db, definition)

    return {
      success: true as const,
      automationId,
    }
  })

/**
 * Get all automations with their definitions and states
 */
export const getAutomationsServerFn = createServerFn({ method: 'GET' }).handler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async (): Promise<any> => {
    const { initDatabaseWithBootstrap, automationService } = await import(
      '@nxus/db/server'
    )

    const db = await initDatabaseWithBootstrap()

    const automations = automationService.getAll(db)

    return {
      success: true as const,
      automations,
    }
  },
)

/**
 * Enable or disable an automation
 */
export const setAutomationEnabledServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ automationId: z.string(), enabled: z.boolean() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, automationService } = await import(
      '@nxus/db/server'
    )
    const { automationId, enabled } = ctx.data

    const db = await initDatabaseWithBootstrap()

    automationService.setEnabled(db, automationId, enabled)

    return {
      success: true as const,
    }
  })

/**
 * Delete an automation
 */
export const deleteAutomationServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ automationId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, automationService } = await import(
      '@nxus/db/server'
    )
    const { automationId } = ctx.data

    const db = await initDatabaseWithBootstrap()

    automationService.delete(db, automationId)

    return {
      success: true as const,
    }
  })

/**
 * Manually trigger an automation (for testing or manual invocation)
 *
 * For query_membership triggers, provide nodeId.
 * For threshold triggers, provide computedFieldValue.
 */
export const triggerAutomationServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      automationId: z.string(),
      nodeId: z.string().optional(),
      computedFieldValue: z.number().optional(),
    }),
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, automationService } = await import(
      '@nxus/db/server'
    )
    const { automationId, nodeId, computedFieldValue } = ctx.data

    const db = await initDatabaseWithBootstrap()

    automationService.trigger(db, automationId, { nodeId, computedFieldValue })

    return {
      success: true as const,
    }
  })

// ============================================================================
// Query Subscription Server Functions
// ============================================================================

/**
 * In-memory subscription store for managing server-side subscriptions
 *
 * Note: This is a simple in-memory implementation. For production,
 * consider using a more robust solution (Redis, database, etc.)
 * that persists across server restarts and scales horizontally.
 *
 * The current implementation works well for:
 * - Single-server deployments
 * - Development/testing
 * - Short-lived subscriptions
 */
/**
 * Subscription handle type matching the reactive module's SubscriptionHandle
 */
interface SubscriptionHandleRef {
  unsubscribe: () => void
  getLastResults: () => AssembledNode[]
}

const subscriptionStore = new Map<
  string,
  {
    handle: SubscriptionHandleRef
    queryDefinition: z.infer<typeof QueryDefinitionSchema>
    createdAt: Date
  }
>()

/**
 * Generate a unique subscription ID
 */
function generateSubscriptionId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`
}

/**
 * Subscribe to a query for live updates
 *
 * Returns a subscription ID that can be used to unsubscribe later.
 * The subscription monitors the query results and notifies on changes.
 *
 * Note: This creates a server-side subscription. For real-time updates
 * to the client, consider using WebSocket or SSE integration.
 */
export const subscribeToQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      queryDefinition: QueryDefinitionSchema,
    }),
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, querySubscriptionService } = await import(
      '@nxus/db/server'
    )
    const { queryDefinition } = ctx.data

    const db = await initDatabaseWithBootstrap()

    // Generate unique subscription ID
    const subscriptionId = generateSubscriptionId()

    // Subscribe to the query
    // Note: The callback here is a placeholder - in a real implementation,
    // you'd want to notify clients via WebSocket, SSE, or polling
    const handle = querySubscriptionService.subscribe(
      db,
      queryDefinition,
      (_event: QueryResultChangeEvent) => {
        // For now, we just track the subscription server-side
        // Real implementations would push updates to clients here
        console.log(
          `[ReactiveServer] Query subscription ${subscriptionId} received update`,
        )
      },
    )

    // Store the subscription
    subscriptionStore.set(subscriptionId, {
      handle,
      queryDefinition,
      createdAt: new Date(),
    })

    // Get initial results
    const initialResults = handle.getLastResults()

    return {
      success: true as const,
      subscriptionId,
      initialResults,
      resultCount: initialResults.length,
    }
  })

/**
 * Unsubscribe from a query
 */
export const unsubscribeFromQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ subscriptionId: z.string() }))
  .handler(async (ctx) => {
    const { subscriptionId } = ctx.data

    const subscription = subscriptionStore.get(subscriptionId)
    if (!subscription) {
      return {
        success: false as const,
        error: `Subscription ${subscriptionId} not found`,
      }
    }

    // Unsubscribe and remove from store
    subscription.handle.unsubscribe()
    subscriptionStore.delete(subscriptionId)

    return {
      success: true as const,
    }
  })

/**
 * Get all active subscriptions (for debugging/monitoring)
 */
export const getActiveSubscriptionsServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const subscriptions = Array.from(subscriptionStore.entries()).map(
    ([id, sub]) => ({
      id,
      queryDefinition: sub.queryDefinition,
      createdAt: sub.createdAt,
    }),
  )

  return {
    success: true as const,
    subscriptions,
    count: subscriptions.length,
  }
})

/**
 * Get the current results of a subscription
 *
 * Useful for polling the latest results without setting up real-time updates.
 */
export const getSubscriptionResultsServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ subscriptionId: z.string() }))
  .handler(async (ctx) => {
    const { subscriptionId } = ctx.data

    const subscription = subscriptionStore.get(subscriptionId)
    if (!subscription) {
      return {
        success: false as const,
        error: `Subscription ${subscriptionId} not found`,
      }
    }

    const results = subscription.handle.getLastResults()

    return {
      success: true as const,
      subscriptionId,
      results,
      resultCount: results.length,
    }
  })
