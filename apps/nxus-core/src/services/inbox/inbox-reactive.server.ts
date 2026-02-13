/**
 * inbox-reactive.server.ts - Reactive server functions for inbox metrics, queries, and automations
 *
 * Wraps the reactive services (computed fields, automations, query evaluation)
 * with inbox-specific logic:
 * - Lazy initialization of reactive services
 * - Inbox computed fields (total, pending, processing, done counts)
 * - Query-based inbox item listings (pending, processing, done)
 * - Automation templates (auto_archive, backlog_overflow, auto_tag)
 * - CRUD operations for inbox automations
 *
 * IMPORTANT: All @nxus/db/server imports are done dynamically inside handlers
 * to prevent Vite from bundling better-sqlite3 into the client bundle.
 */

import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import {
  FIELD_NAMES,
  SYSTEM_FIELDS,
  SYSTEM_QUERIES,
  SYSTEM_SUPERTAGS,
  type FieldSystemId,
} from '@nxus/db'
import type { QueryDefinition, AssembledNode } from '@nxus/db'
import type { AutomationDefinition, ComputedFieldDefinition } from '@nxus/db'
import type { InboxItem } from './inbox.server.js'

// ============================================================================
// Types
// ============================================================================

export type AutomationTemplate = 'auto_archive' | 'backlog_overflow' | 'auto_tag'

export interface InboxMetrics {
  totalItems: number
  pendingCount: number
  processingCount: number
  doneCount: number
  updatedAt: string
}

// ============================================================================
// Computed Field Definitions
// ============================================================================

/**
 * Query definitions for inbox computed fields.
 * These use systemIds which the query evaluator resolves to UUIDs.
 */
const INBOX_QUERIES = {
  allItems: {
    filters: [
      { type: 'supertag' as const, supertagId: SYSTEM_SUPERTAGS.INBOX },
    ],
  } satisfies QueryDefinition,

  pendingItems: {
    filters: [
      { type: 'supertag' as const, supertagId: SYSTEM_SUPERTAGS.INBOX },
      {
        type: 'property' as const,
        fieldId: SYSTEM_FIELDS.STATUS as string,
        op: 'eq' as const,
        value: 'pending',
      },
    ],
  } satisfies QueryDefinition,

  processingItems: {
    filters: [
      { type: 'supertag' as const, supertagId: SYSTEM_SUPERTAGS.INBOX },
      {
        type: 'property' as const,
        fieldId: SYSTEM_FIELDS.STATUS as string,
        op: 'eq' as const,
        value: 'processing',
      },
    ],
  } satisfies QueryDefinition,

  doneItems: {
    filters: [
      { type: 'supertag' as const, supertagId: SYSTEM_SUPERTAGS.INBOX },
      {
        type: 'property' as const,
        fieldId: SYSTEM_FIELDS.STATUS as string,
        op: 'eq' as const,
        value: 'done',
      },
    ],
  } satisfies QueryDefinition,
} as const

/**
 * Computed field definitions for inbox metrics.
 * Each references a system query by its systemId; the actual QueryDefinition
 * is loaded from the persisted query node at init time (with inline fallback).
 */
const INBOX_COMPUTED_FIELD_DEFS: Array<{
  name: string
  querySystemId: string
  fallbackQuery: QueryDefinition
}> = [
  {
    name: 'Inbox: Total Items',
    querySystemId: SYSTEM_QUERIES.INBOX_ALL,
    fallbackQuery: INBOX_QUERIES.allItems,
  },
  {
    name: 'Inbox: Pending Count',
    querySystemId: SYSTEM_QUERIES.INBOX_PENDING,
    fallbackQuery: INBOX_QUERIES.pendingItems,
  },
  {
    name: 'Inbox: Processing Count',
    querySystemId: SYSTEM_QUERIES.INBOX_PROCESSING,
    fallbackQuery: INBOX_QUERIES.processingItems,
  },
  {
    name: 'Inbox: Done Count',
    querySystemId: SYSTEM_QUERIES.INBOX_DONE,
    fallbackQuery: INBOX_QUERIES.doneItems,
  },
]

// ============================================================================
// Lazy Initialization
// ============================================================================

/**
 * Cached computed field IDs after initialization.
 * Order: [totalItems, pendingCount, processingCount, doneCount]
 */
let inboxComputedFieldIds: string[] | null = null
let reactiveInitialized = false
let reactiveInitFailed = false

/**
 * Ensure reactive services are initialized and inbox computed fields exist.
 * Idempotent — safe to call multiple times.
 *
 * Returns the computed field IDs for the 4 inbox metrics.
 * Throws if initialization fails (callers should catch).
 * After a failure, subsequent calls immediately throw to avoid
 * hammering a potentially corrupted database.
 */
async function ensureInboxReactiveInit(): Promise<string[]> {
  // If a previous init attempt failed, don't keep retrying
  if (reactiveInitFailed) {
    throw new Error('Reactive init previously failed; skipping retry')
  }

  try {
    const { initDatabaseWithBootstrap, computedFieldService, automationService } =
      await import('@nxus/db/server')

    const db = await initDatabaseWithBootstrap()

    // Initialize reactive services once
    if (!reactiveInitialized) {
      computedFieldService.initialize(db)
      automationService.initialize(db)
      reactiveInitialized = true
    }

    // Create inbox computed fields if not already tracked
    if (!inboxComputedFieldIds) {
      const existing = computedFieldService.getAll(db)
      const ids: string[] = []

      for (const def of INBOX_COMPUTED_FIELD_DEFS) {
        // Check if a computed field with this name already exists
        const found = existing.find((cf) => cf.name === def.name)
        if (found) {
          ids.push(found.id)
        } else {
          // Load query definition from system query node (fallback to inline)
          const query = await loadSystemQueryDefinition(
            def.querySystemId,
            def.fallbackQuery,
          )
          const id = computedFieldService.create(db, {
            name: def.name,
            definition: { aggregation: 'COUNT', query },
          })
          ids.push(id)
        }
      }

      inboxComputedFieldIds = ids
    }

    return inboxComputedFieldIds
  } catch (err) {
    // Mark as permanently failed to avoid repeated attempts on a broken DB
    reactiveInitFailed = true
    reactiveInitialized = false
    inboxComputedFieldIds = null
    throw err
  }
}

// ============================================================================
// Template Expansion
// ============================================================================

/**
 * Expand an automation template into a full AutomationDefinition.
 *
 * Exported for testing.
 */
export function expandAutomationTemplate(
  template: AutomationTemplate,
  config: {
    threshold?: number
    webhookUrl?: string
    keyword?: string
    supertagId?: string
  },
  pendingCountComputedFieldId?: string,
): AutomationDefinition {
  switch (template) {
    case 'auto_archive':
      return {
        name: 'Auto-archive done items',
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.INBOX },
              {
                type: 'property',
                fieldId: SYSTEM_FIELDS.STATUS as string,
                op: 'eq',
                value: 'done',
              },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'set_property',
          fieldId: SYSTEM_FIELDS.ARCHIVED_AT as string,
          value: { $now: true },
        },
        enabled: true,
      }

    case 'backlog_overflow': {
      const threshold = config.threshold ?? 20
      const webhookUrl = config.webhookUrl
      if (!webhookUrl) {
        throw new Error('backlog_overflow template requires webhookUrl in config')
      }
      if (!pendingCountComputedFieldId) {
        throw new Error(
          'backlog_overflow template requires pendingCountComputedFieldId',
        )
      }
      return {
        name: `Alert when pending > ${threshold}`,
        trigger: {
          type: 'threshold',
          computedFieldId: pendingCountComputedFieldId,
          condition: { operator: 'gt', value: threshold },
          fireOnce: true,
        },
        action: {
          type: 'webhook',
          url: webhookUrl,
          method: 'POST',
          body: {
            alert: 'inbox_overflow',
            pendingCount: '{{ computedField.value }}',
            timestamp: '{{ timestamp }}',
          },
        },
        enabled: true,
      }
    }

    case 'auto_tag': {
      const keyword = config.keyword
      const supertagId = config.supertagId
      if (!keyword) {
        throw new Error('auto_tag template requires keyword in config')
      }
      if (!supertagId) {
        throw new Error('auto_tag template requires supertagId in config')
      }
      return {
        name: `Auto-tag "${keyword}"`,
        trigger: {
          type: 'query_membership',
          queryDefinition: {
            filters: [
              { type: 'supertag', supertagId: SYSTEM_SUPERTAGS.INBOX },
              {
                type: 'content',
                query: keyword,
                caseSensitive: false,
              },
            ],
          },
          event: 'onEnter',
        },
        action: {
          type: 'add_supertag',
          supertagId: supertagId,
        },
        enabled: true,
      }
    }

    default:
      throw new Error(`Unknown automation template: ${template}`)
  }
}

/**
 * Get the computed field definitions used for inbox metrics.
 * Exported for testing — returns the test-friendly format with
 * the inline query definitions (not the system node references).
 */
export function getInboxComputedFieldDefs() {
  return INBOX_COMPUTED_FIELD_DEFS.map((def) => ({
    name: def.name,
    querySystemId: def.querySystemId,
    definition: { aggregation: 'COUNT' as const, query: def.fallbackQuery },
  }))
}

/**
 * Get the inbox query definitions.
 * Exported for testing.
 */
export function getInboxQueries() {
  return INBOX_QUERIES
}

// ============================================================================
// Node → InboxItem Conversion
// ============================================================================

/**
 * Convert an AssembledNode to an InboxItem.
 * Uses getProperty to extract fields from the node's property bag.
 */
function nodeToInboxItem(node: AssembledNode): InboxItem {
  const props = node.properties
  const statusValues = props[FIELD_NAMES.STATUS]
  const notesValues = props[FIELD_NAMES.NOTES]

  const status = (statusValues?.[0]?.value as string) || 'pending'

  return {
    id: node.id,
    title: node.content || '',
    notes: notesValues?.[0]?.value as string | null ?? null,
    status: status as 'pending' | 'processing' | 'done',
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  }
}

// ============================================================================
// Server Functions — Query-Based Item Listings
// ============================================================================

/**
 * Load a QueryDefinition from a persisted system query node.
 * Falls back to the inline INBOX_QUERIES if the system node doesn't exist yet.
 */
async function loadSystemQueryDefinition(
  querySystemId: string,
  fallback: QueryDefinition,
): Promise<QueryDefinition> {
  const { nodeFacade } = await import('@nxus/db/server')
  await nodeFacade.init()

  const node = await nodeFacade.findNodeBySystemId(querySystemId)
  if (!node) return fallback

  const defProp = node.properties[FIELD_NAMES.QUERY_DEFINITION]
  if (!defProp?.[0]?.value) return fallback

  try {
    return JSON.parse(defProp[0].value as string) as QueryDefinition
  } catch {
    return fallback
  }
}

/**
 * Get inbox items by evaluating a persisted system query node.
 * Loads the QueryDefinition from the node, evaluates it, and converts results to InboxItem[].
 */
async function queryInboxItemsBySystemQuery(
  querySystemId: string,
  fallback: QueryDefinition,
): Promise<InboxItem[]> {
  const { nodeFacade } = await import('@nxus/db/server')
  await nodeFacade.init()

  const definition = await loadSystemQueryDefinition(querySystemId, fallback)
  const result = await nodeFacade.evaluateQuery(definition)

  return result.nodes
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(nodeToInboxItem)
}

/**
 * Get pending inbox items via system query node.
 */
export const getInboxPendingQueryServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const data = await queryInboxItemsBySystemQuery(
      SYSTEM_QUERIES.INBOX_PENDING,
      INBOX_QUERIES.pendingItems,
    )
    return { success: true as const, data }
  } catch (err) {
    console.error('[getInboxPendingQueryServerFn] Failed:', err)
    return { success: false as const, data: [] as InboxItem[] }
  }
})

/**
 * Get processing inbox items via system query node.
 */
export const getInboxProcessingQueryServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const data = await queryInboxItemsBySystemQuery(
      SYSTEM_QUERIES.INBOX_PROCESSING,
      INBOX_QUERIES.processingItems,
    )
    return { success: true as const, data }
  } catch (err) {
    console.error('[getInboxProcessingQueryServerFn] Failed:', err)
    return { success: false as const, data: [] as InboxItem[] }
  }
})

/**
 * Get done inbox items via system query node.
 */
export const getInboxDoneQueryServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const data = await queryInboxItemsBySystemQuery(
      SYSTEM_QUERIES.INBOX_DONE,
      INBOX_QUERIES.doneItems,
    )
    return { success: true as const, data }
  } catch (err) {
    console.error('[getInboxDoneQueryServerFn] Failed:', err)
    return { success: false as const, data: [] as InboxItem[] }
  }
})

// ============================================================================
// Server Functions — Computed Fields & Metrics
// ============================================================================

const EMPTY_METRICS: InboxMetrics = {
  totalItems: 0,
  pendingCount: 0,
  processingCount: 0,
  doneCount: 0,
  updatedAt: new Date().toISOString(),
}

/**
 * Initialize reactive system and return computed field IDs + current metric values.
 */
export const initInboxReactiveServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { initDatabaseWithBootstrap, computedFieldService } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()

    const ids = await ensureInboxReactiveInit()

    const metrics: InboxMetrics = {
      totalItems: computedFieldService.getValue(db, ids[0]) ?? 0,
      pendingCount: computedFieldService.getValue(db, ids[1]) ?? 0,
      processingCount: computedFieldService.getValue(db, ids[2]) ?? 0,
      doneCount: computedFieldService.getValue(db, ids[3]) ?? 0,
      updatedAt: new Date().toISOString(),
    }

    return {
      success: true as const,
      computedFieldIds: {
        totalItems: ids[0],
        pendingCount: ids[1],
        processingCount: ids[2],
        doneCount: ids[3],
      },
      metrics,
    }
  } catch (err) {
    console.error('[initInboxReactiveServerFn] Failed to initialize reactive system:', err)
    return {
      success: false as const,
      computedFieldIds: null,
      metrics: EMPTY_METRICS,
    }
  }
})

/**
 * Get current inbox metrics (lightweight polling endpoint).
 */
export const getInboxMetricsServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { initDatabaseWithBootstrap, computedFieldService } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()

    const ids = await ensureInboxReactiveInit()

    const metrics: InboxMetrics = {
      totalItems: computedFieldService.getValue(db, ids[0]) ?? 0,
      pendingCount: computedFieldService.getValue(db, ids[1]) ?? 0,
      processingCount: computedFieldService.getValue(db, ids[2]) ?? 0,
      doneCount: computedFieldService.getValue(db, ids[3]) ?? 0,
      updatedAt: new Date().toISOString(),
    }

    return {
      success: true as const,
      metrics,
    }
  } catch (err) {
    console.error('[getInboxMetricsServerFn] Failed to fetch metrics:', err)
    return {
      success: false as const,
      metrics: EMPTY_METRICS,
    }
  }
})

/**
 * List inbox automations with definition and state.
 */
export const getInboxAutomationsServerFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  try {
    const { initDatabaseWithBootstrap, automationService } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()

    await ensureInboxReactiveInit()

    const allAutomations = automationService.getAll(db)

    // Filter to inbox-related automations by checking if trigger queries reference inbox supertag
    const inboxAutomations = allAutomations.filter((auto) => {
      const trigger = auto.definition.trigger
      if (trigger.type === 'query_membership') {
        return trigger.queryDefinition.filters?.some(
          (f: Record<string, unknown>) =>
            f.type === 'supertag' && f.supertagId === SYSTEM_SUPERTAGS.INBOX,
        )
      }
      if (trigger.type === 'threshold') {
        // Threshold automations linked to inbox computed fields
        return inboxComputedFieldIds?.includes(trigger.computedFieldId)
      }
      return false
    })

    return {
      success: true as const,
      automations: inboxAutomations.map((auto) => ({
        id: auto.id,
        name: auto.definition.name,
        enabled: auto.definition.enabled,
        trigger: auto.definition.trigger,
        action: auto.definition.action,
        lastTriggered: auto.state?.lastTriggeredAt ?? null,
      })),
    }
  } catch (err) {
    console.error('[getInboxAutomationsServerFn] Failed to fetch automations:', err)
    return {
      success: false as const,
      automations: [],
    }
  }
})

/**
 * Create an inbox automation from a template.
 */
export const createInboxAutomationServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      template: z.enum(['auto_archive', 'backlog_overflow', 'auto_tag']),
      config: z
        .object({
          threshold: z.number().optional(),
          webhookUrl: z.string().url().optional(),
          keyword: z.string().optional(),
          supertagId: z.string().optional(),
        })
        .optional()
        .default({}),
    }),
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, automationService } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()

    const ids = await ensureInboxReactiveInit()
    const { template, config } = ctx.data

    // ids[1] is the pending count computed field
    const definition = expandAutomationTemplate(template, config, ids[1])
    const automationId = automationService.create(db, definition)

    return {
      success: true as const,
      automationId,
    }
  })

/**
 * Enable or disable an inbox automation.
 */
export const toggleInboxAutomationServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      automationId: z.string(),
      enabled: z.boolean(),
    }),
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, automationService } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()

    await ensureInboxReactiveInit()

    const { automationId, enabled } = ctx.data
    automationService.setEnabled(db, automationId, enabled)

    return { success: true as const }
  })

/**
 * Delete an inbox automation.
 */
export const deleteInboxAutomationServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ automationId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, automationService } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()

    await ensureInboxReactiveInit()

    automationService.delete(db, ctx.data.automationId)

    return { success: true as const }
  })

/**
 * Manually trigger an inbox automation (for testing).
 */
export const triggerInboxAutomationServerFn = createServerFn({ method: 'POST' })
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
    const db = await initDatabaseWithBootstrap()

    await ensureInboxReactiveInit()

    const { automationId, nodeId, computedFieldValue } = ctx.data
    automationService.trigger(db, automationId, { nodeId, computedFieldValue })

    return { success: true as const }
  })
