/**
 * SurrealBackend - Graph-based NodeBackend implementation using SurrealDB
 *
 * Uses SurrealDB's graph features for node assembly:
 * - Nodes stored in the `node` table
 * - Properties stored as `has_field` edges (node -> has_field -> field) with values on the edge
 * - Supertags stored as `has_supertag` edges (node -> has_supertag -> supertag)
 * - Inheritance via `extends` edges (supertag -> extends -> supertag)
 *
 * This is the graph-native counterpart to SqliteBackend.
 *
 * SurQL notes:
 * - `value` and `order` are reserved words — always backtick-escape them
 * - RecordId objects from query results serialize via .toString() as "table:id"
 * - Use StringRecordId(str) to pass string IDs back as query params
 */

import type { Surreal } from 'surrealdb'
import { RecordId, StringRecordId } from 'surrealdb'
import type { FieldSystemId, FieldContentName } from '../../schemas/node-schema.js'
import { FIELD_NAMES, SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '../../schemas/node-schema.js'
import type { AssembledNode, CreateNodeOptions, PropertyValue } from '../../types/node.js'
import type { JsonValue } from '../../types/common.js'
import type { BaseType } from '../../types/base-type.js'
import type {
  QueryDefinition,
  SupertagFilter,
  PropertyFilter,
  PathFilter,
  ContentFilter,
  HasFieldFilter,
  TemporalFilter,
  RelationFilter,
  LogicalFilter,
  FilterOp,
} from '../../types/query.js'
import type { FieldUsageStats, NodeBackend, ReorderNodeUpdate } from './types.js'
import type { SupertagInfo } from '../node.service.js'
import type { QueryEvaluationResult } from '../query-evaluator.service.js'
import type { MutationEvent } from '../../reactive/types.js'
import { eventBus } from '../../reactive/event-bus.js'
import { formatOrderKey } from '../../types/order.js'
import { extractMentionedNodeIds } from '../mentions.js'
import { uuidv7 } from 'uuidv7'

// ---------------------------------------------------------------------------
// Internal SurrealDB record types (query results)
// ---------------------------------------------------------------------------

interface SurrealNode {
  id: RecordId
  content: string | null
  content_plain: string | null
  system_id: string | null
  owner_id?: string | null
  props: Record<string, unknown> | null
  created_at: string | Date
  updated_at: string | Date
  deleted_at: string | Date | null
}

interface FieldEdge {
  node_ref: RecordId // the `in` RecordId (owning node) — batch grouping key
  value: unknown
  order: number
  field_content: string
  field_system_id: string
  field_record: RecordId // the `out` RecordId of the field
}

interface SupertagEdge {
  node_ref: RecordId // the `in` RecordId (owning node) — batch grouping key
  name: string
  system_id: string | null
  supertag_record: RecordId // the `out` RecordId of the supertag
  order: number
}

interface MentionEdge {
  value: unknown
  order: number
}

// ---------------------------------------------------------------------------
// Helper: serialize RecordId to string
// ---------------------------------------------------------------------------

function rid(id: RecordId | string | unknown): string {
  if (typeof id === 'string') return id.replace(/^([^:]+):⟨(.+)⟩$/, '$1:$2')
  // RecordId has a toString() that produces "table:id"
  if (id && typeof id === 'object' && typeof (id as RecordId).toString === 'function') {
    return (id as RecordId).toString().replace(/^([^:]+):⟨(.+)⟩$/, '$1:$2')
  }
  return String(id)
}

export function normalizeSurrealRecordId(
  table: string,
  id: RecordId | string | unknown,
): string {
  const value = rid(id)
  return value.includes(':') ? value : `${table}:${value}`
}

function nodeRecordId(nodeId: string): RecordId | StringRecordId {
  const normalized = normalizeSurrealRecordId('node', nodeId)
  const key = normalized.slice('node:'.length)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)
    ? new RecordId('node', key)
    : new StringRecordId(normalized)
}

function toDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date()
  if (value instanceof Date) return value
  return new Date(value)
}

// ---------------------------------------------------------------------------
// Transactions & post-commit event buffering
//
// Mirrors node.service.ts's runMutationTransaction / emitMutation pattern,
// adapted to SurrealDB's driver:
//
// - DRIFT (driver limitation, see spec/tech/persistence.md §8): the embedded
//   `@surrealdb/node` engine does NOT support the driver-native
//   `db.beginTransaction()` API — calling it throws
//   `UnsupportedFeatureError: The configured engine does not support the
//   feature: transactions` (verified empirically against a `mem://` instance).
// - SurrealQL's string-based `BEGIN TRANSACTION; ...; COMMIT TRANSACTION;`
//   block DOES work on the embedded engine and gives real all-or-nothing
//   atomicity: any statement failure inside the block rolls back every write
//   in it (verified: a CREATE+RELATE followed by a unique-index-violating
//   CREATE, all in one block, leaves NEITHER the CREATE nor the RELATE
//   persisted). Multi-statement mutations are therefore batched into a
//   single query string — sent as one round trip — rather than issued as
//   separate `db.query()` calls.
// ---------------------------------------------------------------------------

interface SurrealStatement {
  query: string
  params?: Record<string, unknown>
}

function normalizeTransactionResult(result: unknown): unknown {
  if (Array.isArray(result) && result.length === 1) {
    return result[0]
  }
  return result
}

/**
 * Execute one or more write statements as a single atomic SurrealQL
 * transaction (`BEGIN TRANSACTION; ...; COMMIT TRANSACTION;`).
 *
 * All statements' bound params are merged into one shared params object for
 * the batched query — safe because within a single mutation, statements
 * that share a param name (e.g. `$nodeId`) always share the same value.
 */
async function runSurrealTransaction(
  db: Surreal,
  statements: SurrealStatement[],
): Promise<unknown[]> {
  if (statements.length === 0) return []

  const mergedParams: Record<string, unknown> = {}
  for (const statement of statements) {
    Object.assign(mergedParams, statement.params ?? {})
  }

  const body = statements
    .map((statement) => {
      const trimmed = statement.query.trim()
      return trimmed.endsWith(';') ? trimmed : `${trimmed};`
    })
    .join('\n    ')

  const fullQuery = `BEGIN TRANSACTION;\n    ${body}\n    COMMIT TRANSACTION;`
  const results = await db.query(fullQuery, mergedParams)
  return results
    .filter((result) => result !== undefined)
    .map(normalizeTransactionResult)
}

// Stack of in-flight event buffers. Non-empty while a mutation's batched
// transaction query is executing; emitMutation() pushes onto the innermost
// buffer instead of the live eventBus so nothing is observable on the bus
// until the transaction has actually committed.
const transactionEventStack: MutationEvent[][] = []

function emitMutation(event: MutationEvent): void {
  const currentEvents = transactionEventStack.at(-1)
  if (currentEvents) {
    currentEvents.push(event)
    return
  }
  eventBus.emit(event)
}

/**
 * Run a mutation with post-commit event emission: events raised via
 * `emitMutation()` while `mutate()` is in flight are buffered and only
 * dispatched to the shared `eventBus` after `mutate()` resolves — i.e. after
 * the batched `BEGIN/COMMIT TRANSACTION` query has actually committed. If
 * `mutate()` throws (the transaction failed and SurrealDB rolled it back
 * server-side), buffered events are discarded — never emitted for a
 * mutation that didn't commit.
 */
async function runMutationTransaction<T>(mutate: () => Promise<T>): Promise<T> {
  if (transactionEventStack.length > 0) {
    // Already nested inside an outer mutation's buffer (e.g. linkNodes
    // delegating to setProperty/addPropertyValue) — reuse it so the
    // outermost caller controls the flush.
    return mutate()
  }

  const events: MutationEvent[] = []
  transactionEventStack.push(events)
  try {
    const result = await mutate()
    for (const event of events) {
      eventBus.emit(event)
    }
    return result
  } finally {
    transactionEventStack.pop()
  }
}

// ---------------------------------------------------------------------------
// SurrealBackend
// ---------------------------------------------------------------------------

export class SurrealBackend implements NodeBackend {
  private db: Surreal | null = null
  private initialized = false

  // Cache: field system_id → field RecordId string
  private fieldIdCache = new Map<string, string>()
  // Cache: supertag system_id → supertag RecordId string
  private supertagIdCache = new Map<string, string | null>()

  async init(): Promise<void> {
    if (this.initialized) return

    const { initGraphDatabase } = await import('../../client/graph-client.js')
    this.db = await initGraphDatabase()
    this.initialized = true
  }

  /**
   * Initialize with an externally-provided SurrealDB instance.
   * Useful for testing with in-memory databases.
   */
  initWithDb(db: Surreal): void {
    this.db = db
    this.initialized = true
  }

  private ensureInitialized(): Surreal {
    if (!this.initialized || !this.db) {
      throw new Error(
        'SurrealBackend not initialized. Call init() or initWithDb() first.',
      )
    }
    return this.db
  }

  // ---------------------------------------------------------------------------
  // Field resolution (system_id → RecordId)
  // ---------------------------------------------------------------------------

  /**
   * Resolve a FieldSystemId (e.g., 'field:path') to its SurrealDB field record ID string.
   * Results are cached for performance.
   */
  private async resolveFieldId(fieldSystemId: string): Promise<string> {
    const cached = this.fieldIdCache.get(fieldSystemId)
    if (cached) return cached

    const db = this.ensureInitialized()
    const [results] = await db.query<[Array<{ id: RecordId }>]>(
      `SELECT id FROM field WHERE system_id = $systemId LIMIT 1`,
      { systemId: fieldSystemId },
    )

    if (!results || results.length === 0) {
      const [nodeResults] = await db.query<[Array<{ id: RecordId; content: string | null }>]>(
        'SELECT id, content FROM node WHERE system_id = $systemId AND deleted_at IS NONE LIMIT 1',
        { systemId: fieldSystemId },
      )
      const fieldNode = nodeResults[0]
      if (!fieldNode) {
        throw new Error(`Field not found: ${fieldSystemId}`)
      }

      const recordKey = rid(fieldNode.id).replace(/^node:/, '').replace(/[^A-Za-z0-9_]/g, '_')
      const fieldRecordId = `field:${recordKey}`
      await runSurrealTransaction(db, [
        {
          query: `UPSERT $fieldRecordId SET
            content = $content,
            system_id = $systemId,
            value_type = 'text',
            created_at = time::now()`,
          params: {
            fieldRecordId: new StringRecordId(fieldRecordId),
            content: fieldNode.content ?? fieldSystemId.replace(/^field:/, ''),
            systemId: fieldSystemId,
          },
        },
      ])
      this.fieldIdCache.set(fieldSystemId, fieldRecordId)
      return fieldRecordId
    }

    const fieldId = rid(results[0].id)
    this.fieldIdCache.set(fieldSystemId, fieldId)
    return fieldId
  }

  private async normalizeFieldRecordId(fieldNodeId: string): Promise<string> {
    if (fieldNodeId.startsWith('field:')) return fieldNodeId

    const db = this.ensureInitialized()
    const [nodeRows] = await db.query<[Array<{ system_id: string | null }>]>(
      'SELECT system_id FROM $nodeId LIMIT 1',
      { nodeId: nodeRecordId(fieldNodeId) },
    )
    const systemId = nodeRows[0]?.system_id
    if (!systemId) return fieldNodeId
    return this.resolveFieldId(systemId)
  }

  private async readMentionEdges(
    nodeId: string,
    mentionsFieldId: string,
  ): Promise<MentionEdge[]> {
    const db = this.ensureInitialized()
    const [existing] = await db.query<[MentionEdge[]]>(
      'SELECT `value`, `order` FROM has_field WHERE in = $nodeId AND out = $fieldId',
      {
        nodeId: nodeRecordId(nodeId),
        fieldId: new StringRecordId(mentionsFieldId),
      },
    )
    return existing ?? []
  }

  private buildMentionReconciliationStatements(input: {
    nodeId?: string
    nodeExpression?: string
    mentionsFieldId: string
    content: string | null | undefined
    existingEdges: MentionEdge[]
  }): { statements: SurrealStatement[]; added: string[]; removed: string[] } {
    const desired = extractMentionedNodeIds(input.content).map((nodeId) =>
      normalizeSurrealRecordId('node', nodeId),
    )
    const desiredSet = new Set(desired)
    const existingByValue = new Map<string, MentionEdge>()
    for (const edge of input.existingEdges) {
      if (typeof edge.value === 'string') existingByValue.set(edge.value, edge)
    }

    const statements: SurrealStatement[] = []
    const removed: string[] = []
    const added: string[] = []

    let removeIndex = 0
    for (const value of existingByValue.keys()) {
      if (desiredSet.has(value)) continue
      removed.push(value)
      const params: Record<string, unknown> = {
        [`removedMentionValue${removeIndex}`]: value,
        mentionsFieldId: new StringRecordId(input.mentionsFieldId),
      }
      const nodePredicate = input.nodeExpression
        ? `in = ${input.nodeExpression}`
        : `in = $mentionNodeId${removeIndex}`
      if (!input.nodeExpression && input.nodeId) {
        params[`mentionNodeId${removeIndex}`] = nodeRecordId(input.nodeId)
      }
      statements.push({
        query: `DELETE has_field WHERE ${nodePredicate} AND out = $mentionsFieldId AND \`value\` = $removedMentionValue${removeIndex}`,
        params,
      })
      removeIndex += 1
    }

    let maxOrder = input.existingEdges.reduce(
      (max, edge) => Math.max(max, edge.order ?? 0),
      -1,
    )
    let addIndex = 0
    for (const value of desired) {
      if (existingByValue.has(value)) continue
      maxOrder += 1
      added.push(value)
      const params: Record<string, unknown> = {
        [`mentionTo${addIndex}`]: new StringRecordId(input.mentionsFieldId),
        [`mentionValue${addIndex}`]: value,
        [`mentionOrder${addIndex}`]: maxOrder,
      }
      const fromExpression = input.nodeExpression ?? `$mentionFrom${addIndex}`
      if (!input.nodeExpression && input.nodeId) {
        params[`mentionFrom${addIndex}`] = nodeRecordId(input.nodeId)
      }
      statements.push({
        query: `RELATE ${fromExpression}->has_field->$mentionTo${addIndex} SET \`value\` = $mentionValue${addIndex}, \`order\` = $mentionOrder${addIndex}, created_at = time::now(), updated_at = time::now()`,
        params,
      })
      addIndex += 1
    }

    return { statements, added, removed }
  }

  private emitMentionReconciliationEvents(input: {
    nodeId: string
    mentionsFieldId: string
    added: string[]
    removed: string[]
    timestamp: Date
  }): void {
    for (const value of input.removed) {
      emitMutation({
        type: 'property:removed',
        timestamp: input.timestamp,
        nodeId: input.nodeId,
        fieldId: input.mentionsFieldId,
        fieldSystemId: SYSTEM_FIELDS.MENTIONS as string,
        beforeValue: value,
      })
    }
    for (const value of input.added) {
      emitMutation({
        type: 'property:added',
        timestamp: input.timestamp,
        nodeId: input.nodeId,
        fieldId: input.mentionsFieldId,
        fieldSystemId: SYSTEM_FIELDS.MENTIONS as string,
        afterValue: value,
      })
    }
  }

  /**
   * Resolve a supertag system_id (e.g., 'supertag:item') to its SurrealDB record ID string.
   *
   * Self-heals from the `node` table on a catalog miss: a supertag
   * definition (e.g. #Task, #Event) is itself a node tagged #Supertag, so if
   * no `supertag` catalog row exists yet (bootstrap gap, or a user-created
   * supertag), we look it up by system_id on `node` and mirror a catalog row
   * into `supertag` — the same fallback shape `resolveFieldId` already uses
   * for fields.
   */
  private async resolveSupertagId(supertagSystemId: string): Promise<string | null> {
    if (this.supertagIdCache.has(supertagSystemId)) {
      return this.supertagIdCache.get(supertagSystemId)!
    }

    const db = this.ensureInitialized()
    const [results] = await db.query<[Array<{ id: RecordId }>]>(
      `SELECT id FROM supertag WHERE system_id = $systemId LIMIT 1`,
      { systemId: supertagSystemId },
    )

    if (results && results.length > 0) {
      const resolved = rid(results[0].id)
      this.supertagIdCache.set(supertagSystemId, resolved)
      return resolved
    }

    const [nodeResults] = await db.query<[Array<{ id: RecordId; content: string | null }>]>(
      'SELECT id, content FROM node WHERE system_id = $systemId AND deleted_at IS NONE LIMIT 1',
      { systemId: supertagSystemId },
    )
    const supertagNode = nodeResults[0]
    if (!supertagNode) {
      return null
    }

    const recordKey = rid(supertagNode.id).replace(/^node:/, '').replace(/[^A-Za-z0-9_]/g, '_')
    const supertagRecordId = `supertag:${recordKey}`
    await runSurrealTransaction(db, [
      {
        query: `UPSERT $supertagRecordId SET
          name = $name,
          system_id = $systemId,
          created_at = time::now()`,
        params: {
          supertagRecordId: new StringRecordId(supertagRecordId),
          name: supertagNode.content ?? supertagSystemId.replace(/^supertag:/, ''),
          systemId: supertagSystemId,
        },
      },
    ])
    this.supertagIdCache.set(supertagSystemId, supertagRecordId)
    return supertagRecordId
  }

  // ---------------------------------------------------------------------------
  // Node CRUD
  // ---------------------------------------------------------------------------

  async findNodeById(nodeId: string): Promise<AssembledNode | null> {
    const db = this.ensureInitialized()
    const [results] = await db.query<[SurrealNode[]]>(
      `SELECT * FROM $nodeId`,
      { nodeId: nodeRecordId(nodeId) },
    )

    if (!results || results.length === 0) return null
    return this.assembleFromRecord(results[0])
  }

  async findNodeBySystemId(systemId: string): Promise<AssembledNode | null> {
    const db = this.ensureInitialized()
    const [results] = await db.query<[SurrealNode[]]>(
      `SELECT * FROM node WHERE system_id = $systemId LIMIT 1`,
      { systemId },
    )

    if (!results || results.length === 0) return null
    return this.assembleFromRecord(results[0])
  }

  async createNode(options: CreateNodeOptions): Promise<string> {
    const db = this.ensureInitialized()
    const now = new Date()

    // Build SET clauses dynamically to avoid sending null for option<T> fields
    const setClauses: string[] = [
      'content = $content',
      'content_plain = $contentPlain',
      'props = $props',
      'created_at = time::now()',
      'updated_at = time::now()',
    ]
    const params: Record<string, unknown> = {
      nodeId: new RecordId('node', uuidv7()),
      content: options.content,
      contentPlain: options.content.toLowerCase(),
      props: {},
    }

    if (options.systemId) {
      setClauses.push('system_id = $systemId')
      params.systemId = options.systemId
    }

    if (options.ownerId) {
      setClauses.push('owner_id = $ownerId')
      params.ownerId = options.ownerId
    }

    // Resolve the supertag record BEFORE the transaction — this is a
    // read-only cache lookup, not part of the write set. A supertagId that
    // still fails to resolve (even after resolveSupertagId's self-heal) must
    // fail fast rather than silently create an untagged node — matching
    // addNodeSupertag's contract for the same condition.
    let supertagRecordId: string | null = null
    if (options.supertagId) {
      supertagRecordId = await this.resolveSupertagId(options.supertagId)
      if (!supertagRecordId) {
        throw new Error(`Supertag not found: ${options.supertagId}`)
      }
    }
    const mentionsFieldId = await this.resolveFieldId(SYSTEM_FIELDS.MENTIONS)
    const mentionReconciliation = this.buildMentionReconciliationStatements({
      nodeExpression: '($newNode[0].id)',
      mentionsFieldId,
      content: options.content,
      existingEdges: [],
    })

    return runMutationTransaction(async () => {
      // `LET $newNode = (CREATE ...)` binds the created record so the
      // supertag RELATE (if any) can reference its freshly-generated id
      // within the SAME atomic transaction, and the trailing RETURN
      // extracts that id as the query's sole result.
      const statements: SurrealStatement[] = [
        {
          query: `LET $newNode = (CREATE $nodeId SET ${setClauses.join(', ')})`,
          params,
        },
      ]

      if (supertagRecordId) {
        statements.push({
          query: 'RELATE ($newNode[0].id)->has_supertag->$stId SET `order` = 0, created_at = time::now()',
          params: { stId: new StringRecordId(supertagRecordId) },
        })
      }
      statements.push(...mentionReconciliation.statements)

      statements.push({ query: 'RETURN $newNode[0].id' })

      const transactionResults = await runSurrealTransaction(db, statements)
      const nodeIdResult = transactionResults.at(-1)
      const nodeId = normalizeSurrealRecordId('node', nodeIdResult)

      emitMutation({
        type: 'node:created',
        timestamp: now,
        nodeId,
        afterValue: {
          id: nodeId,
          content: options.content,
          ownerId: options.ownerId,
        },
      })

      if (supertagRecordId) {
        emitMutation({
          type: 'supertag:added',
          timestamp: now,
          nodeId,
          supertagId: supertagRecordId,
        })
      }
      this.emitMentionReconciliationEvents({
        nodeId,
        mentionsFieldId,
        added: mentionReconciliation.added,
        removed: mentionReconciliation.removed,
        timestamp: now,
      })

      return nodeId
    })
  }

  async updateNodeContent(nodeId: string, content: string): Promise<void> {
    const db = this.ensureInitialized()

    // Get current content for beforeValue (read-only, outside the transaction)
    const [current] = await db.query<[SurrealNode[]]>(
      `SELECT content FROM $nodeId`,
      { nodeId: nodeRecordId(nodeId) },
    )
    const beforeContent = current?.[0]?.content ?? null
    const now = new Date()
    const mentionsFieldId = await this.resolveFieldId(SYSTEM_FIELDS.MENTIONS)
    const mentionReconciliation = this.buildMentionReconciliationStatements({
      nodeId,
      mentionsFieldId,
      content,
      existingEdges: await this.readMentionEdges(nodeId, mentionsFieldId),
    })

    return runMutationTransaction(async () => {
      await runSurrealTransaction(db, [
        {
          query: `UPDATE $nodeId SET content = $content, content_plain = $contentPlain, updated_at = time::now()`,
          params: {
            nodeId: nodeRecordId(nodeId),
            content,
            contentPlain: content.toLowerCase(),
          },
        },
        ...mentionReconciliation.statements,
      ])

      emitMutation({
        type: 'node:updated',
        timestamp: now,
        nodeId,
        beforeValue: beforeContent,
        afterValue: content,
      })
      this.emitMentionReconciliationEvents({
        nodeId,
        mentionsFieldId,
        added: mentionReconciliation.added,
        removed: mentionReconciliation.removed,
        timestamp: now,
      })
    })
  }

  async deleteNode(nodeId: string): Promise<void> {
    const db = this.ensureInitialized()
    const now = new Date()

    return runMutationTransaction(async () => {
      await runSurrealTransaction(db, [
        {
          query: `UPDATE $nodeId SET deleted_at = time::now()`,
          params: { nodeId: nodeRecordId(nodeId) },
        },
      ])

      emitMutation({
        type: 'node:deleted',
        timestamp: now,
        nodeId,
      })
    })
  }

  async restoreNode(nodeId: string): Promise<void> {
    const db = this.ensureInitialized()
    const now = new Date()

    return runMutationTransaction(async () => {
      await runSurrealTransaction(db, [
        {
          query: 'UPDATE $nodeId SET deleted_at = NONE, updated_at = time::now()',
          params: { nodeId: nodeRecordId(nodeId) },
        },
      ])

      emitMutation({
        type: 'node:created',
        timestamp: now,
        nodeId,
      })
    })
  }

  async reparentNode(
    nodeId: string,
    newParentId: string | null,
    order?: number,
  ): Promise<void> {
    const db = this.ensureInitialized()
    const now = new Date()
    const statements: SurrealStatement[] = [
      newParentId === null
        ? {
            query: 'UPDATE $nodeId SET owner_id = NONE, updated_at = time::now()',
            params: { nodeId: nodeRecordId(nodeId) },
          }
        : {
            query: 'UPDATE $nodeId SET owner_id = $ownerId, updated_at = time::now()',
            params: {
              nodeId: nodeRecordId(nodeId),
              ownerId: newParentId,
            },
          },
    ]

    let orderFieldId: string | null = null
    if (order !== undefined) {
      orderFieldId = await this.resolveFieldId(SYSTEM_FIELDS.ORDER)
      statements.push(
        {
          query: 'DELETE has_field WHERE in = $orderNodeId AND out = $orderFieldId',
          params: {
            orderNodeId: nodeRecordId(nodeId),
            orderFieldId: new StringRecordId(orderFieldId),
          },
        },
        {
          query: 'RELATE $orderFrom->has_field->$orderTo SET `value` = $orderValue, `order` = 0, created_at = time::now(), updated_at = time::now()',
          params: {
            orderFrom: nodeRecordId(nodeId),
            orderTo: new StringRecordId(orderFieldId),
            orderValue: order,
          },
        },
      )
    }

    return runMutationTransaction(async () => {
      await runSurrealTransaction(db, statements)

      emitMutation({
        type: 'node:updated',
        timestamp: now,
        nodeId,
        afterValue: { ownerId: newParentId },
      })

      if (order !== undefined && orderFieldId) {
        emitMutation({
          type: 'property:set',
          timestamp: now,
          nodeId,
          fieldId: orderFieldId,
          fieldSystemId: SYSTEM_FIELDS.ORDER as string,
          afterValue: order,
        })
      }
    })
  }

  async reorderNodes(updates: ReorderNodeUpdate[]): Promise<void> {
    if (updates.length === 0) return

    const db = this.ensureInitialized()
    const orderFieldId = await this.resolveFieldId(SYSTEM_FIELDS.ORDER)
    const now = new Date()
    const statements: SurrealStatement[] = []

    updates.forEach((update, index) => {
      statements.push(
        {
          query: `DELETE has_field WHERE in = $nodeId${index} AND out = $orderFieldId`,
          params: {
            [`nodeId${index}`]: nodeRecordId(update.nodeId),
            orderFieldId: new StringRecordId(orderFieldId),
          },
        },
        {
          query: `RELATE $from${index}->has_field->$to${index} SET \`value\` = $order${index}, \`order\` = 0, created_at = time::now(), updated_at = time::now()`,
          params: {
            [`from${index}`]: nodeRecordId(update.nodeId),
            [`to${index}`]: new StringRecordId(orderFieldId),
            [`order${index}`]: update.order,
          },
        },
      )
    })

    return runMutationTransaction(async () => {
      await runSurrealTransaction(db, statements)

      for (const update of updates) {
        emitMutation({
          type: 'property:set',
          timestamp: now,
          nodeId: update.nodeId,
          fieldId: orderFieldId,
          fieldSystemId: SYSTEM_FIELDS.ORDER as string,
          afterValue: update.order,
        })
      }
    })
  }

  async getWorkspaceRoots(): Promise<string[]> {
    const db = this.ensureInitialized()
    const [liveRows] = await db.query<[Array<SurrealNode>]>(
      'SELECT * FROM node WHERE deleted_at IS NONE',
    )

    const rootRows = liveRows.filter(
      (row) => !row.owner_id && !row.system_id,
    )
    if (rootRows.length > 0) {
      return rootRows.map((row) => rid(row.id))
    }

    const fallbackRows = liveRows.filter(
      (row) => !row.system_id,
    )

    return fallbackRows[0] ? [rid(fallbackRows[0].id)] : []
  }

  // ---------------------------------------------------------------------------
  // Node Assembly (core graph-based assembly)
  // ---------------------------------------------------------------------------

  async assembleNode(nodeId: string): Promise<AssembledNode | null> {
    const db = this.ensureInitialized()

    // Fetch the node (non-deleted)
    const [nodeResults] = await db.query<[SurrealNode[]]>(
      `SELECT * FROM $nodeId WHERE deleted_at IS NONE`,
      { nodeId: nodeRecordId(nodeId) },
    )

    if (!nodeResults || nodeResults.length === 0) return null
    return this.assembleFromRecord(nodeResults[0])
  }

  async assembleNodeWithInheritance(nodeId: string): Promise<AssembledNode | null> {
    const node = await this.assembleNode(nodeId)
    if (!node) return null

    // Track which fields we already have
    const existingFieldSystemIds = new Set<string>()
    for (const values of Object.values(node.properties)) {
      for (const pv of values) {
        if (pv.fieldSystemId) {
          existingFieldSystemIds.add(pv.fieldSystemId)
        }
      }
    }

    // For each supertag, walk ancestors and collect inherited defaults
    for (const supertag of node.supertags) {
      const supertagRecordId = supertag.systemId
        ? await this.resolveSupertagId(supertag.systemId)
        : null
      if (!supertagRecordId) continue

      // Get the supertag's ancestor chain
      const ancestorIds = await this.getAncestorSupertagRecordIds(supertagRecordId)
      const supertagChain = [supertagRecordId, ...ancestorIds]

      // Process from root to leaf (so child overrides parent)
      const reversedChain = [...supertagChain].reverse()

      for (const stId of reversedChain) {
        const fieldDefs = await this.getSupertagFieldDefsInternal(stId)

        for (const [fieldSystemId, def] of fieldDefs) {
          if (existingFieldSystemIds.has(fieldSystemId)) continue

          if (def.defaultValue !== undefined && def.defaultValue !== null) {
            const inheritedPv: PropertyValue = {
              value: def.defaultValue as JsonValue,
              rawValue: JSON.stringify(def.defaultValue),
              fieldNodeId: def.fieldNodeId,
              fieldName: def.fieldName,
              fieldSystemId,
              order: 0,
            }

            const key = def.fieldName as FieldContentName
            if (!node.properties[key]) {
              node.properties[key] = []
            }
            node.properties[key].push(inheritedPv)
            existingFieldSystemIds.add(fieldSystemId)
          }
        }
      }
    }

    return node
  }

  async getChildrenByParents(
    parentIds: string[],
  ): Promise<Map<string, AssembledNode[]>> {
    const childrenByParent = new Map<string, AssembledNode[]>()
    const uniqueParentIds = [...new Set(parentIds)]
    for (const parentId of uniqueParentIds) childrenByParent.set(parentId, [])
    if (uniqueParentIds.length === 0) return childrenByParent

    const db = this.ensureInitialized()
    const [childRows] = await db.query<[SurrealNode[]]>(
      'SELECT * FROM node WHERE owner_id IN $parentIds AND deleted_at IS NONE',
      { parentIds: uniqueParentIds },
    )

    const assembledChildren = await this.assembleFromRecords(childRows ?? [])
    for (const child of assembledChildren) {
      if (child.deletedAt || !child.ownerId) continue
      const siblings = childrenByParent.get(child.ownerId)
      if (siblings) siblings.push(child)
    }

    for (const siblings of childrenByParent.values()) {
      siblings.sort((a, b) => this.compareOutlineSiblings(a, b))
    }

    return childrenByParent
  }

  async hasChildren(parentIds: string[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>()
    const uniqueParentIds = [...new Set(parentIds)]
    for (const parentId of uniqueParentIds) result.set(parentId, false)
    if (uniqueParentIds.length === 0) return result

    const db = this.ensureInitialized()
    const [childRows] = await db.query<[Array<{ owner_id: string | null }>]>(
      'SELECT owner_id FROM node WHERE owner_id IN $parentIds AND deleted_at IS NONE GROUP BY owner_id',
      { parentIds: uniqueParentIds },
    )

    for (const row of childRows ?? []) {
      if (row.owner_id) result.set(row.owner_id, true)
    }

    return result
  }

  private compareOutlineSiblings(a: AssembledNode, b: AssembledNode): number {
    const aOrder = formatOrderKey(this.getSortableOrderValue(a))
    const bOrder = formatOrderKey(this.getSortableOrderValue(b))
    const orderCmp = aOrder.localeCompare(bOrder)
    if (orderCmp !== 0) return orderCmp
    return (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0)
  }

  private getSortableOrderValue(node: AssembledNode): string | number | null {
    const value = node.properties[FIELD_NAMES.ORDER]?.[0]?.value
    return typeof value === 'string' || typeof value === 'number' ? value : null
  }

  /**
   * Internal assembly from a fetched SurrealDB node record.
   * Queries has_field edges and has_supertag edges to build the full AssembledNode.
   */
  private async assembleFromRecord(record: SurrealNode): Promise<AssembledNode> {
    const [assembled] = await this.assembleFromRecords([record])
    return assembled!
  }

  /**
   * Batched assembly: TWO edge queries for the whole record set instead of
   * two per node. getChildrenByParents, the getNodesBySupertag family, and
   * evaluateQuery assemble result sets this way — the per-node form was the
   * dominant cost in the backend-parity benchmark (children-batch 16.3×
   * SQLite @1k nodes, growing with N).
   */
  private async assembleFromRecords(records: SurrealNode[]): Promise<AssembledNode[]> {
    if (records.length === 0) return []
    const db = this.ensureInitialized()
    const nodeIds = records.map((record) => nodeRecordId(rid(record.id)))

    // Fetch all has_field edges with field metadata, for all nodes at once.
    // Note: `value` and `order` are reserved words — backtick-escape them.
    const [fieldEdges] = await db.query<[FieldEdge[]]>(
      'SELECT in AS node_ref, `value`, `order`, out.content AS field_content, out.system_id AS field_system_id, out AS field_record FROM has_field WHERE in IN $nodeIds ORDER BY out.content, `order`',
      { nodeIds },
    )

    // Fetch all has_supertag edges with supertag metadata, for all nodes at once
    const [supertagEdges] = await db.query<[SupertagEdge[]]>(
      'SELECT in AS node_ref, out.name AS name, out.system_id AS system_id, out AS supertag_record, `order` FROM has_supertag WHERE in IN $nodeIds ORDER BY `order`',
      { nodeIds },
    )

    const fieldEdgesByNode = new Map<string, FieldEdge[]>()
    for (const edge of fieldEdges || []) {
      const key = rid(edge.node_ref)
      const list = fieldEdgesByNode.get(key)
      if (list) list.push(edge)
      else fieldEdgesByNode.set(key, [edge])
    }
    const supertagEdgesByNode = new Map<string, SupertagEdge[]>()
    for (const edge of supertagEdges || []) {
      const key = rid(edge.node_ref)
      const list = supertagEdgesByNode.get(key)
      if (list) list.push(edge)
      else supertagEdgesByNode.set(key, [edge])
    }

    return records.map((record) =>
      this.buildAssembledNode(
        record,
        fieldEdgesByNode.get(rid(record.id)) ?? [],
        supertagEdgesByNode.get(rid(record.id)) ?? [],
      ),
    )
  }

  /** Bulk fetch + batched assembly for a set of node ids (order preserved, missing ids dropped). */
  private async assembleByIds(nodeIds: string[]): Promise<AssembledNode[]> {
    if (nodeIds.length === 0) return []
    const db = this.ensureInitialized()
    const [rows] = await db.query<[SurrealNode[]]>(
      'SELECT * FROM node WHERE id IN $nodeIds AND deleted_at IS NONE',
      { nodeIds: nodeIds.map((id) => nodeRecordId(id)) },
    )
    const byId = new Map<string, SurrealNode>()
    for (const row of rows ?? []) byId.set(rid(row.id), row)
    const ordered = nodeIds
      .map((id) => byId.get(normalizeSurrealRecordId('node', id)))
      .filter((row): row is SurrealNode => row !== undefined)
    return this.assembleFromRecords(ordered)
  }

  private buildAssembledNode(
    record: SurrealNode,
    fieldEdges: FieldEdge[],
    supertagEdges: SupertagEdge[],
  ): AssembledNode {
    const nodeId = rid(record.id)

    // Build properties map
    const properties: Record<FieldContentName, PropertyValue[]> = {} as Record<FieldContentName, PropertyValue[]>

    for (const edge of fieldEdges) {
      const fieldName = (edge.field_content || '') as FieldContentName
      const fieldId = rid(edge.field_record)

      // In SurrealDB, values are stored natively (not JSON-encoded).
      // For compatibility with the SQLite backend, produce rawValue as JSON string.
      const value = edge.value
      let rawValue: string
      try {
        rawValue = JSON.stringify(value)
      } catch {
        rawValue = String(value)
      }

      const pv: PropertyValue = {
        value: value as JsonValue, // parsed from Surreal edge payload
        rawValue,
        fieldNodeId: fieldId,
        fieldName,
        fieldSystemId: edge.field_system_id || null,
        order: edge.order ?? 0,
      }

      if (!properties[fieldName]) {
        properties[fieldName] = []
      }
      properties[fieldName].push(pv)
    }

    // Build supertags array
    const supertags: AssembledNode['supertags'] = (supertagEdges || []).map((st) => ({
      id: rid(st.supertag_record),
      content: st.name || '',
      systemId: st.system_id || null,
    }))

    return {
      id: nodeId,
      content: record.content ?? null,
      systemId: record.system_id ?? null,
      ownerId: record.owner_id ?? null,
      createdAt: toDate(record.created_at),
      updatedAt: toDate(record.updated_at),
      deletedAt: record.deleted_at ? toDate(record.deleted_at) : null,
      properties,
      supertags,
    }
  }

  // ---------------------------------------------------------------------------
  // Property Operations
  // ---------------------------------------------------------------------------

  async setProperty(
    nodeId: string,
    fieldId: FieldSystemId,
    value: unknown,
    order: number = 0,
  ): Promise<void> {
    const db = this.ensureInitialized()
    const fieldRecordId = await this.resolveFieldId(fieldId)
    const now = new Date()

    // Get existing value for beforeValue event (read-only, outside the transaction)
    const [existing] = await db.query<[Array<{ value: unknown }>]>(
      'SELECT `value` FROM has_field WHERE in = $nodeId AND out = $fieldId',
      {
        nodeId: nodeRecordId(nodeId),
        fieldId: new StringRecordId(fieldRecordId),
      },
    )
    const beforeValue = existing?.[0]?.value

    return runMutationTransaction(async () => {
      // DELETE + RELATE + UPDATE must all commit together, or none of them —
      // otherwise a mid-mutation failure could leave a field with no value
      // (stale DELETE) or a stale node.updated_at.
      await runSurrealTransaction(db, [
        {
          query: 'DELETE has_field WHERE in = $nodeId AND out = $fieldId',
          params: {
            nodeId: nodeRecordId(nodeId),
            fieldId: new StringRecordId(fieldRecordId),
          },
        },
        {
          query: 'RELATE $from->has_field->$to SET `value` = $value, `order` = $order, created_at = time::now(), updated_at = time::now()',
          params: {
            from: nodeRecordId(nodeId),
            to: new StringRecordId(fieldRecordId),
            value,
            order,
          },
        },
        {
          query: 'UPDATE $nodeId SET updated_at = time::now()',
          params: { nodeId: nodeRecordId(nodeId) },
        },
      ])

      emitMutation({
        type: 'property:set',
        timestamp: now,
        nodeId,
        fieldId: fieldRecordId,
        fieldSystemId: fieldId as string,
        beforeValue,
        afterValue: value,
      })
    })
  }

  async addPropertyValue(
    nodeId: string,
    fieldId: FieldSystemId,
    value: unknown,
  ): Promise<void> {
    const db = this.ensureInitialized()
    const fieldRecordId = await this.resolveFieldId(fieldId)
    const now = new Date()

    // Find max order for existing edges of this field (read-only, outside the transaction)
    const [existingEdges] = await db.query<[Array<{ order: number }>]>(
      'SELECT `order` FROM has_field WHERE in = $nodeId AND out = $fieldId ORDER BY `order` DESC LIMIT 1',
      {
        nodeId: nodeRecordId(nodeId),
        fieldId: new StringRecordId(fieldRecordId),
      },
    )
    const maxOrder = existingEdges?.[0]?.order ?? -1

    return runMutationTransaction(async () => {
      await runSurrealTransaction(db, [
        {
          query: 'RELATE $from->has_field->$to SET `value` = $value, `order` = $order, created_at = time::now(), updated_at = time::now()',
          params: {
            from: nodeRecordId(nodeId),
            to: new StringRecordId(fieldRecordId),
            value,
            order: maxOrder + 1,
          },
        },
      ])

      emitMutation({
        type: 'property:added',
        timestamp: now,
        nodeId,
        fieldId: fieldRecordId,
        fieldSystemId: fieldId as string,
        afterValue: value,
      })
    })
  }

  async clearProperty(
    nodeId: string,
    fieldId: FieldSystemId,
  ): Promise<void> {
    const db = this.ensureInitialized()
    let fieldRecordId: string
    try {
      fieldRecordId = await this.resolveFieldId(fieldId)
    } catch {
      return // Field not found, nothing to clear
    }

    const now = new Date()

    // Get existing values for event emission (read-only, outside the transaction)
    const [existing] = await db.query<[Array<{ value: unknown }>]>(
      'SELECT `value` FROM has_field WHERE in = $nodeId AND out = $fieldId',
      {
        nodeId: nodeRecordId(nodeId),
        fieldId: new StringRecordId(fieldRecordId),
      },
    )

    return runMutationTransaction(async () => {
      await runSurrealTransaction(db, [
        {
          query: 'DELETE has_field WHERE in = $nodeId AND out = $fieldId',
          params: {
            nodeId: nodeRecordId(nodeId),
            fieldId: new StringRecordId(fieldRecordId),
          },
        },
      ])

      // Emit events for each removed value
      for (const edge of (existing || [])) {
        emitMutation({
          type: 'property:removed',
          timestamp: now,
          nodeId,
          fieldId: fieldRecordId,
          fieldSystemId: fieldId as string,
          beforeValue: edge.value,
        })
      }
    })
  }

  async removePropertyRow(
    ownerNodeId: string,
    fieldNodeId: string,
  ): Promise<void> {
    const db = this.ensureInitialized()
    const now = new Date()
    const fieldRecordId = await this.normalizeFieldRecordId(fieldNodeId)

    const [existing] = await db.query<[Array<{ value: unknown }>]>(
      'SELECT `value` FROM has_field WHERE in = $nodeId AND out = $fieldId',
      {
        nodeId: nodeRecordId(ownerNodeId),
        fieldId: new StringRecordId(fieldRecordId),
      },
    )

    if (existing.length === 0) return

    return runMutationTransaction(async () => {
      await runSurrealTransaction(db, [
        {
          query: 'DELETE has_field WHERE in = $nodeId AND out = $fieldId',
          params: {
            nodeId: nodeRecordId(ownerNodeId),
            fieldId: new StringRecordId(fieldRecordId),
          },
        },
      ])

      for (const edge of existing) {
        emitMutation({
          type: 'property:removed',
          timestamp: now,
          nodeId: ownerNodeId,
          fieldId: fieldRecordId,
          beforeValue: edge.value,
        })
      }
    })
  }

  async getDistinctPropertyValues(fieldNodeId: string): Promise<unknown[]> {
    const db = this.ensureInitialized()
    const fieldRecordId = await this.normalizeFieldRecordId(fieldNodeId)
    const [edges] = await db.query<[Array<{ node_ref: RecordId; value: unknown }>]>(
      'SELECT in AS node_ref, `value` FROM has_field WHERE out = $fieldId',
      { fieldId: new StringRecordId(fieldRecordId) },
    )

    if (edges.length === 0) return []

    const liveNodeIds = await this.getExistingNodeIds(
      new Set(edges.map((edge) => rid(edge.node_ref))),
    )
    const values = new Map<string, unknown>()

    for (const edge of edges) {
      if (!liveNodeIds.has(rid(edge.node_ref))) continue
      const key = edge.value === undefined ? '__nxus_undefined__' : JSON.stringify(edge.value)
      values.set(key, edge.value)
    }

    return [...values.values()]
  }

  async getFieldUsageStats(fieldNodeId: string): Promise<FieldUsageStats> {
    const db = this.ensureInitialized()
    const fieldRecordId = await this.normalizeFieldRecordId(fieldNodeId)
    const [edges] = await db.query<[Array<{ node_ref: RecordId }>]>(
      'SELECT in AS node_ref FROM has_field WHERE out = $fieldId',
      { fieldId: new StringRecordId(fieldRecordId) },
    )

    if (edges.length === 0) return { nodeCount: 0, supertagCount: 0 }

    const liveNodeIds = await this.getExistingNodeIds(
      new Set(edges.map((edge) => rid(edge.node_ref))),
    )
    const supertagNodeIds = await this.getNodeIdsBySupertagWithInheritance(
      SYSTEM_SUPERTAGS.SUPERTAG,
    )

    let supertagCount = 0
    for (const nodeId of liveNodeIds) {
      if (supertagNodeIds.has(nodeId)) {
        supertagCount++
      }
    }

    return {
      nodeCount: liveNodeIds.size,
      supertagCount,
    }
  }

  async linkNodes(
    fromId: string,
    fieldId: FieldSystemId,
    toId: string,
    append: boolean = false,
  ): Promise<void> {
    if (append) {
      await this.addPropertyValue(fromId, fieldId, toId)
    } else {
      await this.setProperty(fromId, fieldId, toId)
    }
  }

  // ---------------------------------------------------------------------------
  // Supertag Operations
  // ---------------------------------------------------------------------------

  async addNodeSupertag(
    nodeId: string,
    supertagSystemId: string,
  ): Promise<boolean> {
    const db = this.ensureInitialized()

    const supertagRecordId = await this.resolveSupertagId(supertagSystemId)
    if (!supertagRecordId) {
      throw new Error(`Supertag not found: ${supertagSystemId}`)
    }

    // Check if already has this supertag (read-only, outside the transaction)
    const [existing] = await db.query<[Array<{ id: RecordId }>]>(
      'SELECT id FROM has_supertag WHERE in = $nodeId AND out = $stId',
      {
        nodeId: nodeRecordId(nodeId),
        stId: new StringRecordId(supertagRecordId),
      },
    )

    if (existing && existing.length > 0) return false

    // Get current max order (read-only, outside the transaction)
    const [orderResults] = await db.query<[Array<{ order: number }>]>(
      'SELECT `order` FROM has_supertag WHERE in = $nodeId ORDER BY `order` DESC LIMIT 1',
      { nodeId: nodeRecordId(nodeId) },
    )
    const maxOrder = orderResults?.[0]?.order ?? -1
    const now = new Date()

    return runMutationTransaction(async () => {
      await runSurrealTransaction(db, [
        {
          query: 'RELATE $from->has_supertag->$to SET `order` = $order, created_at = time::now()',
          params: {
            from: nodeRecordId(nodeId),
            to: new StringRecordId(supertagRecordId),
            order: maxOrder + 1,
          },
        },
        {
          query: 'UPDATE $nodeId SET updated_at = time::now()',
          params: { nodeId: nodeRecordId(nodeId) },
        },
      ])

      emitMutation({
        type: 'supertag:added',
        timestamp: now,
        nodeId,
        supertagId: supertagRecordId,
      })

      return true
    })
  }

  async removeNodeSupertag(
    nodeId: string,
    supertagSystemId: string,
  ): Promise<boolean> {
    const db = this.ensureInitialized()

    const supertagRecordId = await this.resolveSupertagId(supertagSystemId)
    if (!supertagRecordId) return false

    // Check if the edge exists (read-only, outside the transaction)
    const [existing] = await db.query<[Array<{ id: RecordId }>]>(
      'SELECT id FROM has_supertag WHERE in = $nodeId AND out = $stId',
      {
        nodeId: nodeRecordId(nodeId),
        stId: new StringRecordId(supertagRecordId),
      },
    )

    if (!existing || existing.length === 0) return false

    const now = new Date()

    return runMutationTransaction(async () => {
      await runSurrealTransaction(db, [
        {
          query: 'DELETE has_supertag WHERE in = $nodeId AND out = $stId',
          params: {
            nodeId: nodeRecordId(nodeId),
            stId: new StringRecordId(supertagRecordId),
          },
        },
        {
          query: 'UPDATE $nodeId SET updated_at = time::now()',
          params: { nodeId: nodeRecordId(nodeId) },
        },
      ])

      emitMutation({
        type: 'supertag:removed',
        timestamp: now,
        nodeId,
        supertagId: supertagRecordId,
      })

      return true
    })
  }

  async getNodeSupertags(nodeId: string): Promise<SupertagInfo[]> {
    const db = this.ensureInitialized()

    const [results] = await db.query<[SupertagEdge[]]>(
      'SELECT out.name AS name, out.system_id AS system_id, out AS supertag_record, `order` FROM has_supertag WHERE in = $nodeId ORDER BY `order`',
      { nodeId: nodeRecordId(nodeId) },
    )

    return (results || []).map((st) => ({
      id: rid(st.supertag_record),
      systemId: st.system_id || null,
      content: st.name || '',
      order: st.order ?? 0,
    }))
  }

  async getNodesBySupertags(
    supertagSystemIds: string[],
    matchAll: boolean = false,
  ): Promise<AssembledNode[]> {
    if (supertagSystemIds.length === 0) return []

    const db = this.ensureInitialized()

    // Resolve all supertag system IDs in parallel
    const resolveResults = await Promise.all(
      supertagSystemIds.map((sysId) => this.resolveSupertagId(sysId)),
    )
    // If matchAll and any supertag is missing, no node can match all — return early
    if (matchAll && resolveResults.some((id) => id === null)) {
      return []
    }
    const supertagRecordIds = resolveResults.filter((id): id is string => id !== null)
    if (supertagRecordIds.length === 0) return []

    // Query all supertag edges in parallel
    const edgeResults = await Promise.all(
      supertagRecordIds.map((stId) =>
        db.query<[Array<{ node_ref: RecordId }>]>(
          'SELECT in AS node_ref FROM has_supertag WHERE out = $stId',
          { stId: new StringRecordId(stId) },
        ),
      ),
    )

    // Build nodeId → set of matching supertag IDs
    const nodeIdSet = new Map<string, Set<string>>()
    for (let i = 0; i < supertagRecordIds.length; i++) {
      const [edges] = edgeResults[i]
      for (const edge of (edges || [])) {
        const nodeRefId = rid(edge.node_ref)
        if (!nodeIdSet.has(nodeRefId)) {
          nodeIdSet.set(nodeRefId, new Set())
        }
        nodeIdSet.get(nodeRefId)!.add(supertagRecordIds[i])
      }
    }

    // Filter based on matchAll
    const matchingNodeIds: string[] = []
    for (const [nid, matchedSts] of nodeIdSet) {
      if (matchAll) {
        if (supertagRecordIds.every((stId) => matchedSts.has(stId))) {
          matchingNodeIds.push(nid)
        }
      } else {
        matchingNodeIds.push(nid)
      }
    }

    // Batched assembly (missing/deleted ids drop out)
    return this.assembleByIds(matchingNodeIds)
  }

  // ---------------------------------------------------------------------------
  // Inheritance & Field Definitions
  // ---------------------------------------------------------------------------

  async getNodesBySupertagWithInheritance(
    supertagId: string,
  ): Promise<AssembledNode[]> {
    // Reuse the ID-only method, then batch-assemble
    const nodeIdSet = await this.getNodeIdsBySupertagWithInheritance(supertagId)
    if (nodeIdSet.size === 0) return []

    return this.assembleByIds([...nodeIdSet])
  }

  async getNodesBySupertagBaseType(baseType: BaseType): Promise<AssembledNode[]> {
    const db = this.ensureInitialized()
    const supertagIds = await this.getSupertagRecordIdsByBaseType(baseType)
    if (supertagIds.size === 0) return []

    const edgeResults = await Promise.all(
      [...supertagIds].map((supertagId) =>
        db.query<[Array<{ node_ref: RecordId }>]>(
          'SELECT in AS node_ref FROM has_supertag WHERE out = $stId',
          { stId: new StringRecordId(supertagId) },
        ),
      ),
    )

    const nodeIds = new Set<string>()
    for (const [edges] of edgeResults) {
      for (const edge of edges) {
        nodeIds.add(rid(edge.node_ref))
      }
    }

    return this.assembleByIds([...nodeIds])
  }

  private async getSupertagRecordIdsByBaseType(
    baseType: BaseType,
  ): Promise<Set<string>> {
    const db = this.ensureInitialized()
    const baseTypeFieldId = await this.resolveFieldId(SYSTEM_FIELDS.BASE_TYPE)
    const [baseTypeEdges] = await db.query<[Array<{ node_ref: RecordId }>]>(
      'SELECT in AS node_ref FROM has_field WHERE out = $fieldId AND `value` = $baseType',
      {
        fieldId: new StringRecordId(baseTypeFieldId),
        baseType,
      },
    )

    if (baseTypeEdges.length === 0) return new Set()

    const directSupertagIds = new Set<string>()
    for (const edge of baseTypeEdges) {
      const nodeId = rid(edge.node_ref)
      const [nodeRows] = await db.query<[Array<{ system_id: string | null }>]>(
        'SELECT system_id FROM $nodeId WHERE deleted_at IS NONE LIMIT 1',
        { nodeId: nodeRecordId(nodeId) },
      )
      const systemId = nodeRows[0]?.system_id
      if (!systemId) continue

      const supertagRecordId = await this.resolveSupertagId(systemId)
      if (supertagRecordId) {
        directSupertagIds.add(supertagRecordId)
      }
    }

    const resolved = new Set(directSupertagIds)
    const queue = [...directSupertagIds]
    while (queue.length > 0) {
      const currentId = queue.shift()
      if (!currentId) continue
      const [children] = await db.query<[Array<{ child_ref: RecordId }>]>(
        'SELECT in AS child_ref FROM extends WHERE out = $stId',
        { stId: new StringRecordId(currentId) },
      )
      for (const child of children) {
        const childId = rid(child.child_ref)
        if (!resolved.has(childId)) {
          resolved.add(childId)
          queue.push(childId)
        }
      }
    }

    return resolved
  }

  async getAncestorSupertags(
    supertagId: string,
    maxDepth: number = 10,
  ): Promise<string[]> {
    // First resolve the supertagId (which is a system_id like 'supertag:tool')
    const recordId = await this.resolveSupertagId(supertagId)
    if (!recordId) return []

    return this.getAncestorSupertagRecordIds(recordId, maxDepth)
  }

  /**
   * Internal: walk extends chain for a supertag RecordId string
   */
  private async getAncestorSupertagRecordIds(
    supertagRecordId: string,
    maxDepth: number = 10,
  ): Promise<string[]> {
    const db = this.ensureInitialized()
    const ancestors: string[] = []
    const visited = new Set<string>()
    let currentId = supertagRecordId

    for (let depth = 0; depth < maxDepth; depth++) {
      if (visited.has(currentId)) break
      visited.add(currentId)

      // Find extends edge from current supertag → parent
      const [results] = await db.query<[Array<{ parent_ref: RecordId }>]>(
        'SELECT out AS parent_ref FROM extends WHERE in = $stId LIMIT 1',
        { stId: new StringRecordId(currentId) },
      )

      if (!results || results.length === 0) break

      const parentId = rid(results[0].parent_ref)
      ancestors.push(parentId)
      currentId = parentId
    }

    return ancestors
  }

  async getSupertagFieldDefinitions(
    supertagId: string,
  ): Promise<Map<string, { fieldNodeId: string; fieldName: string; defaultValue?: unknown }>> {
    const recordId = await this.resolveSupertagId(supertagId)
    if (!recordId) return new Map()

    return this.getSupertagFieldDefsInternal(recordId)
  }

  /**
   * Internal: get field definitions from a supertag's has_field edges.
   *
   * In the graph model, a supertag node can have has_field edges to field records,
   * where the edge's value represents the default value for that field.
   *
   * Since has_field is TYPE RELATION IN node OUT field, the supertag table can't
   * directly have has_field edges. Instead, we look for a corresponding node record
   * with the same system_id as the supertag.
   */
  private async getSupertagFieldDefsInternal(
    supertagRecordId: string,
  ): Promise<Map<string, { fieldNodeId: string; fieldName: string; defaultValue?: unknown }>> {
    const db = this.ensureInitialized()
    const fieldDefs = new Map<string, { fieldNodeId: string; fieldName: string; defaultValue?: unknown }>()

    // System fields to skip (these describe the supertag itself)
    const skipSystemIds = new Set([
      SYSTEM_FIELDS.SUPERTAG as string,
      SYSTEM_FIELDS.EXTENDS as string,
      SYSTEM_FIELDS.FIELD_TYPE as string,
    ])

    // Get the supertag's system_id
    const [stResults] = await db.query<[Array<{ system_id: string | null }>]>(
      'SELECT system_id FROM $stId',
      { stId: new StringRecordId(supertagRecordId) },
    )

    if (!stResults || stResults.length === 0) return fieldDefs

    const stSystemId = stResults[0].system_id
    if (!stSystemId) return fieldDefs

    // Find the node with the same system_id
    const [nodeResults] = await db.query<[Array<{ id: RecordId }>]>(
      'SELECT id FROM node WHERE system_id = $systemId LIMIT 1',
      { systemId: stSystemId },
    )

    if (!nodeResults || nodeResults.length === 0) return fieldDefs

    const nodeId = rid(nodeResults[0].id)

    // Query has_field edges from this node
    const [edges] = await db.query<[FieldEdge[]]>(
      'SELECT `value`, `order`, out.content AS field_content, out.system_id AS field_system_id, out AS field_record FROM has_field WHERE in = $nodeId',
      { nodeId: nodeRecordId(nodeId) },
    )

    for (const edge of (edges || [])) {
      const fieldSystemId = edge.field_system_id
      if (!fieldSystemId) continue
      if (skipSystemIds.has(fieldSystemId)) continue

      fieldDefs.set(fieldSystemId, {
        fieldNodeId: rid(edge.field_record),
        fieldName: edge.field_content || fieldSystemId,
        defaultValue: edge.value,
      })
    }

    return fieldDefs
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  async evaluateQuery(
    definition: QueryDefinition,
  ): Promise<QueryEvaluationResult> {
    const db = this.ensureInitialized()
    const evaluatedAt = new Date()

    // Start with all non-deleted node IDs
    const [allNodes] = await db.query<[Array<{ id: RecordId }>]>(
      'SELECT id FROM node WHERE deleted_at IS NONE',
    )

    let candidateIds = new Set<string>((allNodes || []).map((n) => rid(n.id)))

    // Apply each filter
    for (const filter of definition.filters) {
      candidateIds = await this.evaluateFilter(filter, candidateIds)
      if (candidateIds.size === 0) {
        return { nodes: [], totalCount: 0, evaluatedAt }
      }
    }

    const totalCount = candidateIds.size

    // Apply limit before assembly to avoid assembling thousands of nodes
    const limit = definition.limit ?? 500
    const idsToAssemble = [...candidateIds].slice(0, limit)

    // Batched assembly (capped by limit)
    let assembledNodes = await this.assembleByIds(idsToAssemble)

    // Apply sorting
    if (definition.sort) {
      assembledNodes = this.sortNodes(assembledNodes, definition.sort)
    }

    return {
      nodes: assembledNodes,
      totalCount,
      evaluatedAt,
    }
  }

  // ---------------------------------------------------------------------------
  // Filter evaluation
  // ---------------------------------------------------------------------------

  private async evaluateFilter(
    filter: QueryDefinition['filters'][number],
    candidateIds: Set<string>,
  ): Promise<Set<string>> {
    switch (filter.type) {
      case 'supertag':
        return this.evaluateSupertagFilter(filter, candidateIds)
      case 'property':
        return this.evaluatePropertyFilter(filter, candidateIds)
      case 'path':
        return this.evaluatePathFilter(filter, candidateIds)
      case 'content':
        return this.evaluateContentFilter(filter, candidateIds)
      case 'hasField':
        return this.evaluateHasFieldFilter(filter, candidateIds)
      case 'temporal':
        return this.evaluateTemporalFilter(filter, candidateIds)
      case 'relation':
        return this.evaluateRelationFilter(filter, candidateIds)
      case 'and':
      case 'or':
      case 'not':
        return this.evaluateLogicalFilter(filter, candidateIds)
      default:
        return candidateIds
    }
  }

  /**
   * Get node IDs (not assembled) with a supertag, including inherited.
   * Avoids full assembly when only IDs are needed (e.g., for filter intersection).
   */
  private async getNodeIdsBySupertagWithInheritance(
    supertagId: string,
  ): Promise<Set<string>> {
    const db = this.ensureInitialized()

    const targetRecordId = await this.resolveSupertagId(supertagId)
    if (!targetRecordId) return new Set()

    const allSupertagIds = new Set<string>([targetRecordId])

    // BFS walk to collect all transitive children (grandchildren, etc.)
    const queue = [targetRecordId]
    while (queue.length > 0) {
      const currentId = queue.shift()!
      const [children] = await db.query<[Array<{ child_ref: RecordId }>]>(
        'SELECT in AS child_ref FROM extends WHERE out = $stId',
        { stId: new StringRecordId(currentId) },
      )
      for (const child of (children || [])) {
        const childId = rid(child.child_ref)
        if (!allSupertagIds.has(childId)) {
          allSupertagIds.add(childId)
          queue.push(childId)
        }
      }
    }

    // Parallel edge queries for all supertag variants
    const edgePromises = [...allSupertagIds].map((stId) =>
      db.query<[Array<{ node_ref: RecordId }>]>(
        'SELECT in AS node_ref FROM has_supertag WHERE out = $stId',
        { stId: new StringRecordId(stId) },
      ),
    )
    const edgeResults = await Promise.all(edgePromises)

    const nodeIdSet = new Set<string>()
    for (const [edges] of edgeResults) {
      for (const edge of (edges || [])) {
        nodeIdSet.add(rid(edge.node_ref))
      }
    }

    return nodeIdSet
  }

  private async evaluateSupertagFilter(
    filter: SupertagFilter,
    candidateIds: Set<string>,
  ): Promise<Set<string>> {
    const { supertagId, includeInherited = true } = filter

    if (includeInherited) {
      // Get just IDs — avoids assembling every matching node
      const matchedIds = await this.getNodeIdsBySupertagWithInheritance(supertagId)
      const result = new Set<string>()
      for (const id of matchedIds) {
        if (candidateIds.has(id)) result.add(id)
      }
      return result
    } else {
      const stRecordId = await this.resolveSupertagId(supertagId)
      if (!stRecordId) return new Set()

      const db = this.ensureInitialized()
      const [edges] = await db.query<[Array<{ node_ref: RecordId }>]>(
        'SELECT in AS node_ref FROM has_supertag WHERE out = $stId',
        { stId: new StringRecordId(stRecordId) },
      )

      const result = new Set<string>()
      for (const edge of (edges || [])) {
        const nodeRefId = rid(edge.node_ref)
        if (candidateIds.has(nodeRefId)) result.add(nodeRefId)
      }
      return result
    }
  }

  private async evaluatePropertyFilter(
    filter: PropertyFilter,
    candidateIds: Set<string>,
  ): Promise<Set<string>> {
    const db = this.ensureInitialized()
    let fieldRecordId: string
    try {
      fieldRecordId = await this.resolveFieldId(filter.fieldId)
    } catch {
      return new Set()
    }

    // Get all has_field edges for this field
    const [edges] = await db.query<[Array<{ node_ref: RecordId; value: unknown }>]>(
      'SELECT in AS node_ref, `value` FROM has_field WHERE out = $fieldId',
      { fieldId: new StringRecordId(fieldRecordId) },
    )

    // Build nodeId → values map
    const nodePropsMap = new Map<string, unknown[]>()
    for (const edge of (edges || [])) {
      const nodeRefId = rid(edge.node_ref)
      if (!candidateIds.has(nodeRefId)) continue
      const existing = nodePropsMap.get(nodeRefId)
      if (existing) {
        existing.push(edge.value)
      } else {
        nodePropsMap.set(nodeRefId, [edge.value])
      }
    }

    const { op, value: target } = filter

    if (op === 'isEmpty') {
      const result = new Set<string>()
      for (const id of candidateIds) {
        const values = nodePropsMap.get(id)
        if (!values || values.length === 0 || values.every(isEmptyValue)) {
          result.add(id)
        }
      }
      return result
    }

    if (op === 'isNotEmpty') {
      const result = new Set<string>()
      for (const id of candidateIds) {
        const values = nodePropsMap.get(id)
        if (values && values.length > 0 && values.some((v) => !isEmptyValue(v))) {
          result.add(id)
        }
      }
      return result
    }

    const result = new Set<string>()
    for (const [nodeRefId, values] of nodePropsMap) {
      if (values.some((v) => compareValues(v, op, target))) {
        result.add(nodeRefId)
      }
    }

    return result
  }

  private async evaluatePathFilter(
    filter: PathFilter,
    candidateIds: Set<string>,
  ): Promise<Set<string>> {
    const resolvedPath: string[] = []
    for (const segment of filter.path) {
      try {
        resolvedPath.push(await this.resolveFieldId(segment.fieldId))
      } catch {
        return new Set()
      }
    }

    let frontier = new Map<string, Set<string>>()
    for (const candidateId of candidateIds) {
      frontier.set(candidateId, new Set([candidateId]))
    }

    for (const fieldRecordId of resolvedPath.slice(0, -1)) {
      if (frontier.size === 0) {
        return new Set()
      }

      const stepValues = await this.getFieldValuesForNodes(
        fieldRecordId,
        new Set(frontier.keys()),
      )

      const nextRaw = new Map<string, Set<string>>()
      for (const [sourceNodeId, values] of stepValues) {
        const roots = frontier.get(sourceNodeId)
        if (!roots) continue

        for (const refId of this.extractReferenceIds(values)) {
          const existingRoots = nextRaw.get(refId)
          if (existingRoots) {
            for (const rootId of roots) {
              existingRoots.add(rootId)
            }
          } else {
            nextRaw.set(refId, new Set(roots))
          }
        }
      }

      if (nextRaw.size === 0) {
        return new Set()
      }

      const existingIds = await this.getExistingNodeIds(new Set(nextRaw.keys()))
      frontier = new Map()
      for (const nodeId of existingIds) {
        const roots = nextRaw.get(nodeId)
        if (roots) {
          frontier.set(nodeId, roots)
        }
      }
    }

    const terminalFieldId = resolvedPath[resolvedPath.length - 1]
    if (!terminalFieldId || frontier.size === 0) {
      return new Set()
    }

    const terminalValues = await this.getFieldValuesForNodes(
      terminalFieldId,
      new Set(frontier.keys()),
    )

    const result = new Set<string>()
    for (const [nodeId, roots] of frontier) {
      const values = terminalValues.get(nodeId)

      if (filter.op === 'isEmpty') {
        if (!values || values.every(isEmptyValue)) {
          for (const rootId of roots) {
            result.add(rootId)
          }
        }
        continue
      }

      if (filter.op === 'isNotEmpty') {
        if (values?.some((value) => !isEmptyValue(value))) {
          for (const rootId of roots) {
            result.add(rootId)
          }
        }
        continue
      }

      // At this point filter must be a PathValueFilter (isEmpty/isNotEmpty
      // were handled above). TS can't narrow this via `filter.op` alone
      // because each union member's `op` is itself a union of literals, so
      // we narrow via the `value` property instead.
      if (!('value' in filter)) {
        continue
      }
      const { op, value: filterValue } = filter

      if (values?.some((value) => compareValues(value, op, filterValue))) {
        for (const rootId of roots) {
          result.add(rootId)
        }
      }
    }

    return result
  }

  private async evaluateContentFilter(
    filter: ContentFilter,
    candidateIds: Set<string>,
  ): Promise<Set<string>> {
    const { query, caseSensitive = false } = filter
    if (!query || query.trim() === '') return candidateIds

    const db = this.ensureInitialized()
    const searchTerm = caseSensitive ? query : query.toLowerCase()

    // Batch fetch: use SurQL string::contains for server-side filtering
    const field = caseSensitive ? 'content' : 'content_plain'
    const [matchingNodes] = await db.query<[Array<{ id: RecordId }>]>(
      `SELECT id FROM node WHERE deleted_at IS NONE AND string::contains(${field} ?? '', $searchTerm)`,
      { searchTerm },
    )

    const result = new Set<string>()
    for (const node of (matchingNodes || [])) {
      const nodeId = rid(node.id)
      if (candidateIds.has(nodeId)) result.add(nodeId)
    }

    return result
  }

  private async evaluateHasFieldFilter(
    filter: HasFieldFilter,
    candidateIds: Set<string>,
  ): Promise<Set<string>> {
    const { fieldId, negate = false } = filter
    const db = this.ensureInitialized()

    let fieldRecordId: string
    try {
      fieldRecordId = await this.resolveFieldId(fieldId)
    } catch {
      return negate ? candidateIds : new Set()
    }

    const [edges] = await db.query<[Array<{ node_ref: RecordId }>]>(
      'SELECT in AS node_ref FROM has_field WHERE out = $fieldId',
      { fieldId: new StringRecordId(fieldRecordId) },
    )

    const nodesWithField = new Set<string>((edges || []).map((e) => rid(e.node_ref)))

    const result = new Set<string>()
    for (const id of candidateIds) {
      const hasField = nodesWithField.has(id)
      if (negate ? !hasField : hasField) {
        result.add(id)
      }
    }

    return result
  }

  private async evaluateTemporalFilter(
    filter: TemporalFilter,
    candidateIds: Set<string>,
  ): Promise<Set<string>> {
    const db = this.ensureInitialized()
    const { field, op, days, date } = filter

    const now = new Date()
    let targetDate: Date

    switch (op) {
      case 'within':
        if (days === undefined) return candidateIds
        targetDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
        break
      case 'before':
      case 'after':
        if (!date) return candidateIds
        targetDate = new Date(date)
        break
      default:
        return candidateIds
    }

    // Build SurQL temporal filter to push filtering to the server
    const surrealField = field === 'createdAt' ? 'created_at' : 'updated_at'
    const surrealOp = op === 'within' ? '>=' : op === 'after' ? '>' : '<'
    const [matchingNodes] = await db.query<[Array<{ id: RecordId }>]>(
      `SELECT id FROM node WHERE deleted_at IS NONE AND ${surrealField} ${surrealOp} <datetime>$targetDate`,
      { targetDate: targetDate.toISOString() },
    )

    const result = new Set<string>()
    for (const node of (matchingNodes || [])) {
      const nodeId = rid(node.id)
      if (candidateIds.has(nodeId)) result.add(nodeId)
    }

    return result
  }

  private async evaluateRelationFilter(
    filter: RelationFilter,
    candidateIds: Set<string>,
  ): Promise<Set<string>> {
    const db = this.ensureInitialized()
    const { relationType, targetNodeId, fieldId } = filter

    switch (relationType) {
      case 'childOf':
      case 'ownedBy': {
        // Batch fetch: push owner_id filter to the server
        let query: string
        const params: Record<string, unknown> = {}

        if (targetNodeId) {
          query = 'SELECT id FROM node WHERE deleted_at IS NONE AND owner_id = $targetNodeId'
          params.targetNodeId = targetNodeId
        } else {
          query = 'SELECT id FROM node WHERE deleted_at IS NONE AND owner_id IS NOT NONE'
        }

        const [matchingNodes] = await db.query<[Array<{ id: RecordId }>]>(query, params)

        const result = new Set<string>()
        for (const node of (matchingNodes || [])) {
          const nodeId = rid(node.id)
          if (candidateIds.has(nodeId)) result.add(nodeId)
        }
        return result
      }

      case 'linksTo': {
        let fieldRecordId: string | undefined
        if (fieldId) {
          try {
            fieldRecordId = await this.resolveFieldId(fieldId)
          } catch {
            return new Set()
          }
        }

        let query = 'SELECT in AS node_ref, `value` FROM has_field'
        const params: Record<string, unknown> = {}

        if (fieldRecordId) {
          query += ' WHERE out = $fieldId'
          params.fieldId = new StringRecordId(fieldRecordId)
        }

        const [edges] = await db.query<[Array<{ node_ref: RecordId; value: unknown }>]>(query, params)

        const result = new Set<string>()
        for (const edge of (edges || [])) {
          const nodeRefId = rid(edge.node_ref)
          if (!candidateIds.has(nodeRefId)) continue

          if (targetNodeId) {
            if (edge.value === targetNodeId ||
                (Array.isArray(edge.value) && edge.value.includes(targetNodeId))) {
              result.add(nodeRefId)
            }
          } else {
            if (typeof edge.value === 'string' && /^[0-9a-f]{8}-/.test(edge.value)) {
              result.add(nodeRefId)
            }
          }
        }
        return result
      }

      case 'linkedFrom': {
        if (!targetNodeId) return new Set()

        let fieldRecordId: string | undefined
        if (fieldId) {
          try {
            fieldRecordId = await this.resolveFieldId(fieldId)
          } catch {
            return new Set()
          }
        }

        let query = 'SELECT `value` FROM has_field WHERE in = $targetNodeId'
        const params: Record<string, unknown> = {
          targetNodeId: nodeRecordId(targetNodeId),
        }

        if (fieldRecordId) {
          query += ' AND out = $fieldId'
          params.fieldId = new StringRecordId(fieldRecordId)
        }

        const [edges] = await db.query<[Array<{ value: unknown }>]>(
          query,
          params,
        )

        const result = new Set<string>()
        for (const edge of (edges || [])) {
          if (typeof edge.value === 'string' && candidateIds.has(edge.value)) {
            result.add(edge.value)
          } else if (Array.isArray(edge.value)) {
            for (const v of edge.value) {
              if (typeof v === 'string' && candidateIds.has(v)) {
                result.add(v)
              }
            }
          }
        }
        return result
      }

      default:
        return candidateIds
    }
  }

  private async evaluateLogicalFilter(
    filter: LogicalFilter,
    candidateIds: Set<string>,
  ): Promise<Set<string>> {
    const { type, filters } = filter

    if (filters.length === 0) {
      return type === 'not' ? new Set() : candidateIds
    }

    switch (type) {
      case 'and': {
        let result = candidateIds
        for (const subFilter of filters) {
          result = await this.evaluateFilter(subFilter, result)
          if (result.size === 0) break
        }
        return result
      }

      case 'or': {
        const result = new Set<string>()
        for (const subFilter of filters) {
          const matches = await this.evaluateFilter(subFilter, candidateIds)
          for (const id of matches) result.add(id)
        }
        return result
      }

      case 'not': {
        const excludeSet = new Set<string>()
        for (const subFilter of filters) {
          const matches = await this.evaluateFilter(subFilter, candidateIds)
          for (const id of matches) excludeSet.add(id)
        }

        const result = new Set<string>()
        for (const id of candidateIds) {
          if (!excludeSet.has(id)) result.add(id)
        }
        return result
      }

      default:
        return candidateIds
    }
  }

  private async getFieldValuesForNodes(
    fieldRecordId: string,
    nodeIds: Set<string>,
  ): Promise<Map<string, unknown[]>> {
    if (nodeIds.size === 0) {
      return new Map()
    }

    const db = this.ensureInitialized()
    const nodeRefs = [...nodeIds].map((nodeId) => nodeRecordId(nodeId))
    const [edges] = await db.query<[Array<{ node_ref: RecordId; value: unknown }>]>(
      'SELECT in AS node_ref, `value` FROM has_field WHERE out = $fieldId AND in IN $nodeRefs',
      {
        fieldId: new StringRecordId(fieldRecordId),
        nodeRefs,
      },
    )

    const result = new Map<string, unknown[]>()
    for (const edge of (edges || [])) {
      const nodeId = rid(edge.node_ref)
      const existing = result.get(nodeId)
      if (existing) {
        existing.push(edge.value)
      } else {
        result.set(nodeId, [edge.value])
      }
    }

    return result
  }

  private extractReferenceIds(values: unknown[]): string[] {
    const refs: string[] = []
    for (const value of values) {
      if (typeof value === 'string') {
        refs.push(value)
        continue
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') {
            refs.push(item)
          }
        }
      }
    }
    return refs
  }

  private async getExistingNodeIds(nodeIds: Set<string>): Promise<Set<string>> {
    if (nodeIds.size === 0) {
      return new Set()
    }

    const db = this.ensureInitialized()
    const nodeRefs = [...nodeIds].map((nodeId) => nodeRecordId(nodeId))
    const [rows] = await db.query<[Array<{ id: RecordId }>]>(
      'SELECT id FROM node WHERE deleted_at IS NONE AND id IN $nodeRefs',
      { nodeRefs },
    )

    const result = new Set<string>()
    for (const row of (rows || [])) {
      result.add(rid(row.id))
    }
    return result
  }

  // ---------------------------------------------------------------------------
  // Sorting
  // ---------------------------------------------------------------------------

  private sortNodes(
    nodes: AssembledNode[],
    sort: { field: string; direction: 'asc' | 'desc' },
  ): AssembledNode[] {
    const { field, direction } = sort
    const multiplier = direction === 'asc' ? 1 : -1

    return [...nodes].sort((a, b) => {
      const aValue = getSortValue(a, field)
      const bValue = getSortValue(b, field)

      if (aValue === null || aValue === undefined) {
        return bValue === null || bValue === undefined ? 0 : 1
      }
      if (bValue === null || bValue === undefined) return -1

      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return multiplier * aValue.localeCompare(bValue)
      }
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return multiplier * (aValue - bValue)
      }
      if (aValue instanceof Date && bValue instanceof Date) {
        return multiplier * (aValue.getTime() - bValue.getTime())
      }

      return multiplier * String(aValue).localeCompare(String(bValue))
    })
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  async save(): Promise<void> {
    // No-op: SurrealDB auto-persists
  }
}

// ---------------------------------------------------------------------------
// Standalone helpers (shared with filter evaluation)
// ---------------------------------------------------------------------------

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (value === '') return true
  if (Array.isArray(value) && value.length === 0) return true
  return false
}

function compareValues(actual: unknown, op: FilterOp, target: unknown): boolean {
  switch (op) {
    case 'eq':
      return actual === target
    case 'neq':
      return actual !== target
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (typeof actual === 'number' && typeof target === 'number') {
        return op === 'gt' ? actual > target
          : op === 'gte' ? actual >= target
          : op === 'lt' ? actual < target
          : actual <= target
      }
      if (typeof actual === 'string' && typeof target === 'string') {
        const aTime = Date.parse(actual)
        const tTime = Date.parse(target)
        if (!isNaN(aTime) && !isNaN(tTime)) {
          return op === 'gt' ? aTime > tTime
            : op === 'gte' ? aTime >= tTime
            : op === 'lt' ? aTime < tTime
            : aTime <= tTime
        }
        return op === 'gt' ? actual > target
          : op === 'gte' ? actual >= target
          : op === 'lt' ? actual < target
          : actual <= target
      }
      return false
    }
    case 'contains':
      return (
        typeof actual === 'string' &&
        typeof target === 'string' &&
        actual.toLowerCase().includes(target.toLowerCase())
      )
    case 'startsWith':
      return (
        typeof actual === 'string' &&
        typeof target === 'string' &&
        actual.toLowerCase().startsWith(target.toLowerCase())
      )
    case 'endsWith':
      return (
        typeof actual === 'string' &&
        typeof target === 'string' &&
        actual.toLowerCase().endsWith(target.toLowerCase())
      )
    default:
      return false
  }
}

function getSortValue(
  node: AssembledNode,
  field: string,
): string | number | Date | null {
  switch (field) {
    case 'content':
      return node.content
    case 'createdAt':
      return node.createdAt
    case 'updatedAt':
      return node.updatedAt
    case 'systemId':
      return node.systemId
  }

  for (const values of Object.values(node.properties)) {
    for (const pv of values) {
      if (pv.fieldSystemId === field || pv.fieldName === field) {
        return pv.value as string | number | Date | null
      }
    }
  }

  return null
}
