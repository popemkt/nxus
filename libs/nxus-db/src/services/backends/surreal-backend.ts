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

import type { Surreal, RecordId } from 'surrealdb'
import { StringRecordId } from 'surrealdb'
import type { FieldSystemId, FieldContentName } from '../../schemas/node-schema.js'
import { SYSTEM_FIELDS } from '../../schemas/node-schema.js'
import type { AssembledNode, CreateNodeOptions, PropertyValue } from '../../types/node.js'
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
import type { NodeBackend } from './types.js'
import type { SupertagInfo } from '../node.service.js'
import type { QueryEvaluationResult } from '../query-evaluator.service.js'
import { eventBus } from '../../reactive/event-bus.js'

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
  value: unknown
  order: number
  field_content: string
  field_system_id: string
  field_record: RecordId // the `out` RecordId of the field
}

interface SupertagEdge {
  name: string
  system_id: string | null
  supertag_record: RecordId // the `out` RecordId of the supertag
  order: number
}

// ---------------------------------------------------------------------------
// Helper: serialize RecordId to string
// ---------------------------------------------------------------------------

function rid(id: RecordId | string | unknown): string {
  if (typeof id === 'string') return id
  // RecordId has a toString() that produces "table:id"
  if (id && typeof id === 'object' && typeof (id as RecordId).toString === 'function') {
    return (id as RecordId).toString()
  }
  return String(id)
}

function toDate(value: string | Date | null | undefined): Date {
  if (!value) return new Date()
  if (value instanceof Date) return value
  return new Date(value)
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
      throw new Error(`Field not found: ${fieldSystemId}`)
    }

    const fieldId = rid(results[0].id)
    this.fieldIdCache.set(fieldSystemId, fieldId)
    return fieldId
  }

  /**
   * Resolve a supertag system_id (e.g., 'supertag:item') to its SurrealDB record ID string.
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

    if (!results || results.length === 0) {
      return null
    }
    const resolved = rid(results[0].id)
    this.supertagIdCache.set(supertagSystemId, resolved)
    return resolved
  }

  // ---------------------------------------------------------------------------
  // Node CRUD
  // ---------------------------------------------------------------------------

  async findNodeById(nodeId: string): Promise<AssembledNode | null> {
    const db = this.ensureInitialized()
    const [results] = await db.query<[SurrealNode[]]>(
      `SELECT * FROM $nodeId`,
      { nodeId: new StringRecordId(nodeId) },
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

    const [result] = await db.query<[Array<{ id: RecordId }>]>(
      `CREATE node SET ${setClauses.join(', ')}`,
      params,
    )

    const nodeId = rid(result[0].id)

    // Emit node:created event
    eventBus.emit({
      type: 'node:created',
      timestamp: now,
      nodeId,
      afterValue: {
        id: nodeId,
        content: options.content,
        ownerId: options.ownerId,
      },
    })

    // Assign supertag if provided
    if (options.supertagId) {
      const supertagRecordId = await this.resolveSupertagId(options.supertagId)
      if (supertagRecordId) {
        await db.query(
          'RELATE $from->has_supertag->$to SET `order` = 0, created_at = time::now()',
          {
            from: new StringRecordId(nodeId),
            to: new StringRecordId(supertagRecordId),
          },
        )

        eventBus.emit({
          type: 'supertag:added',
          timestamp: now,
          nodeId,
          supertagId: supertagRecordId,
        })
      }
    }

    return nodeId
  }

  async updateNodeContent(nodeId: string, content: string): Promise<void> {
    const db = this.ensureInitialized()

    // Get current content for beforeValue
    const [current] = await db.query<[SurrealNode[]]>(
      `SELECT content FROM $nodeId`,
      { nodeId: new StringRecordId(nodeId) },
    )
    const beforeContent = current?.[0]?.content ?? null

    const now = new Date()
    await db.query(
      `UPDATE $nodeId SET content = $content, content_plain = $contentPlain, updated_at = time::now()`,
      {
        nodeId: new StringRecordId(nodeId),
        content,
        contentPlain: content.toLowerCase(),
      },
    )

    eventBus.emit({
      type: 'node:updated',
      timestamp: now,
      nodeId,
      beforeValue: beforeContent,
      afterValue: content,
    })
  }

  async deleteNode(nodeId: string): Promise<void> {
    const db = this.ensureInitialized()
    const now = new Date()

    await db.query(
      `UPDATE $nodeId SET deleted_at = time::now()`,
      { nodeId: new StringRecordId(nodeId) },
    )

    eventBus.emit({
      type: 'node:deleted',
      timestamp: now,
      nodeId,
    })
  }

  // ---------------------------------------------------------------------------
  // Node Assembly (core graph-based assembly)
  // ---------------------------------------------------------------------------

  async assembleNode(nodeId: string): Promise<AssembledNode | null> {
    const db = this.ensureInitialized()

    // Fetch the node (non-deleted)
    const [nodeResults] = await db.query<[SurrealNode[]]>(
      `SELECT * FROM $nodeId WHERE deleted_at IS NONE`,
      { nodeId: new StringRecordId(nodeId) },
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
              value: def.defaultValue,
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

  /**
   * Internal assembly from a fetched SurrealDB node record.
   * Queries has_field edges and has_supertag edges to build the full AssembledNode.
   */
  private async assembleFromRecord(record: SurrealNode): Promise<AssembledNode> {
    const db = this.ensureInitialized()
    const nodeId = rid(record.id)

    // Fetch all has_field edges with field metadata
    // Note: `value` and `order` are reserved words — backtick-escape them
    const [fieldEdges] = await db.query<[FieldEdge[]]>(
      'SELECT `value`, `order`, out.content AS field_content, out.system_id AS field_system_id, out AS field_record FROM has_field WHERE in = $nodeId ORDER BY out.content, `order`',
      { nodeId: new StringRecordId(nodeId) },
    )

    // Fetch all has_supertag edges with supertag metadata
    const [supertagEdges] = await db.query<[SupertagEdge[]]>(
      'SELECT out.name AS name, out.system_id AS system_id, out AS supertag_record, `order` FROM has_supertag WHERE in = $nodeId ORDER BY `order`',
      { nodeId: new StringRecordId(nodeId) },
    )

    // Build properties map
    const properties: Record<FieldContentName, PropertyValue[]> = {} as Record<FieldContentName, PropertyValue[]>

    for (const edge of (fieldEdges || [])) {
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
        value,
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

    // Get existing value for beforeValue event
    const [existing] = await db.query<[Array<{ value: unknown }>]>(
      'SELECT `value` FROM has_field WHERE in = $nodeId AND out = $fieldId',
      {
        nodeId: new StringRecordId(nodeId),
        fieldId: new StringRecordId(fieldRecordId),
      },
    )
    const beforeValue = existing?.[0]?.value

    // Delete existing edges for this field
    await db.query(
      'DELETE has_field WHERE in = $nodeId AND out = $fieldId',
      {
        nodeId: new StringRecordId(nodeId),
        fieldId: new StringRecordId(fieldRecordId),
      },
    )

    // Create new edge with value
    await db.query(
      'RELATE $from->has_field->$to SET `value` = $value, `order` = $order, created_at = time::now(), updated_at = time::now()',
      {
        from: new StringRecordId(nodeId),
        to: new StringRecordId(fieldRecordId),
        value,
        order,
      },
    )

    // Update node's updated_at timestamp
    await db.query(
      'UPDATE $nodeId SET updated_at = time::now()',
      { nodeId: new StringRecordId(nodeId) },
    )

    eventBus.emit({
      type: 'property:set',
      timestamp: now,
      nodeId,
      fieldId: fieldRecordId,
      fieldSystemId: fieldId as string,
      beforeValue,
      afterValue: value,
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

    // Find max order for existing edges of this field
    const [existingEdges] = await db.query<[Array<{ order: number }>]>(
      'SELECT `order` FROM has_field WHERE in = $nodeId AND out = $fieldId ORDER BY `order` DESC LIMIT 1',
      {
        nodeId: new StringRecordId(nodeId),
        fieldId: new StringRecordId(fieldRecordId),
      },
    )
    const maxOrder = existingEdges?.[0]?.order ?? -1

    // Create new edge
    await db.query(
      'RELATE $from->has_field->$to SET `value` = $value, `order` = $order, created_at = time::now(), updated_at = time::now()',
      {
        from: new StringRecordId(nodeId),
        to: new StringRecordId(fieldRecordId),
        value,
        order: maxOrder + 1,
      },
    )

    eventBus.emit({
      type: 'property:added',
      timestamp: now,
      nodeId,
      fieldId: fieldRecordId,
      fieldSystemId: fieldId as string,
      afterValue: value,
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

    // Get existing values for event emission
    const [existing] = await db.query<[Array<{ value: unknown }>]>(
      'SELECT `value` FROM has_field WHERE in = $nodeId AND out = $fieldId',
      {
        nodeId: new StringRecordId(nodeId),
        fieldId: new StringRecordId(fieldRecordId),
      },
    )

    // Delete all edges for this field
    await db.query(
      'DELETE has_field WHERE in = $nodeId AND out = $fieldId',
      {
        nodeId: new StringRecordId(nodeId),
        fieldId: new StringRecordId(fieldRecordId),
      },
    )

    // Emit events for each removed value
    for (const edge of (existing || [])) {
      eventBus.emit({
        type: 'property:removed',
        timestamp: now,
        nodeId,
        fieldId: fieldRecordId,
        fieldSystemId: fieldId as string,
        beforeValue: edge.value,
      })
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

    // Check if already has this supertag
    const [existing] = await db.query<[Array<{ id: RecordId }>]>(
      'SELECT id FROM has_supertag WHERE in = $nodeId AND out = $stId',
      {
        nodeId: new StringRecordId(nodeId),
        stId: new StringRecordId(supertagRecordId),
      },
    )

    if (existing && existing.length > 0) return false

    // Get current max order
    const [orderResults] = await db.query<[Array<{ order: number }>]>(
      'SELECT `order` FROM has_supertag WHERE in = $nodeId ORDER BY `order` DESC LIMIT 1',
      { nodeId: new StringRecordId(nodeId) },
    )
    const maxOrder = orderResults?.[0]?.order ?? -1

    await db.query(
      'RELATE $from->has_supertag->$to SET `order` = $order, created_at = time::now()',
      {
        from: new StringRecordId(nodeId),
        to: new StringRecordId(supertagRecordId),
        order: maxOrder + 1,
      },
    )

    // Update node timestamp
    await db.query(
      'UPDATE $nodeId SET updated_at = time::now()',
      { nodeId: new StringRecordId(nodeId) },
    )

    const now = new Date()
    eventBus.emit({
      type: 'supertag:added',
      timestamp: now,
      nodeId,
      supertagId: supertagRecordId,
    })

    return true
  }

  async removeNodeSupertag(
    nodeId: string,
    supertagSystemId: string,
  ): Promise<boolean> {
    const db = this.ensureInitialized()

    const supertagRecordId = await this.resolveSupertagId(supertagSystemId)
    if (!supertagRecordId) return false

    // Check if the edge exists
    const [existing] = await db.query<[Array<{ id: RecordId }>]>(
      'SELECT id FROM has_supertag WHERE in = $nodeId AND out = $stId',
      {
        nodeId: new StringRecordId(nodeId),
        stId: new StringRecordId(supertagRecordId),
      },
    )

    if (!existing || existing.length === 0) return false

    // Delete the supertag edge
    await db.query(
      'DELETE has_supertag WHERE in = $nodeId AND out = $stId',
      {
        nodeId: new StringRecordId(nodeId),
        stId: new StringRecordId(supertagRecordId),
      },
    )

    // Update node timestamp
    await db.query(
      'UPDATE $nodeId SET updated_at = time::now()',
      { nodeId: new StringRecordId(nodeId) },
    )

    const now = new Date()
    eventBus.emit({
      type: 'supertag:removed',
      timestamp: now,
      nodeId,
      supertagId: supertagRecordId,
    })

    return true
  }

  async getNodeSupertags(nodeId: string): Promise<SupertagInfo[]> {
    const db = this.ensureInitialized()

    const [results] = await db.query<[SupertagEdge[]]>(
      'SELECT out.name AS name, out.system_id AS system_id, out AS supertag_record, `order` FROM has_supertag WHERE in = $nodeId ORDER BY `order`',
      { nodeId: new StringRecordId(nodeId) },
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

    // Assemble nodes in parallel (filter out deleted)
    const assembleResults = await Promise.all(
      matchingNodeIds.map((nid) => this.assembleNode(nid)),
    )
    return assembleResults.filter((n): n is AssembledNode => n !== null)
  }

  // ---------------------------------------------------------------------------
  // Inheritance & Field Definitions
  // ---------------------------------------------------------------------------

  async getNodesBySupertagWithInheritance(
    supertagId: string,
  ): Promise<AssembledNode[]> {
    // Reuse the ID-only method, then assemble in parallel
    const nodeIdSet = await this.getNodeIdsBySupertagWithInheritance(supertagId)
    if (nodeIdSet.size === 0) return []

    const assembleResults = await Promise.all(
      [...nodeIdSet].map((nid) => this.assembleNode(nid)),
    )
    return assembleResults.filter((n): n is AssembledNode => n !== null)
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

    const nodeRecordId = rid(nodeResults[0].id)

    // Query has_field edges from this node
    const [edges] = await db.query<[FieldEdge[]]>(
      'SELECT `value`, `order`, out.content AS field_content, out.system_id AS field_system_id, out AS field_record FROM has_field WHERE in = $nodeId',
      { nodeId: new StringRecordId(nodeRecordId) },
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

    // Assemble nodes in parallel (capped by limit)
    const assembleResults = await Promise.all(
      idsToAssemble.map((nid) => this.assembleNode(nid)),
    )
    let assembledNodes = assembleResults.filter((n): n is AssembledNode => n !== null)

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

      if (values?.some((value) => compareValues(value, filter.op, filter.value))) {
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
          targetNodeId: new StringRecordId(targetNodeId),
        }

        if (fieldRecordId) {
          query += ' AND out = $fieldId'
          params.fieldId = new StringRecordId(fieldRecordId)
        }

        const [edges] = await db.query<[Array<{ value: unknown }>]>(query, params)

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
    const [edges] = await db.query<[Array<{ node_ref: RecordId; value: unknown }>]>(
      'SELECT in AS node_ref, `value` FROM has_field WHERE out = $fieldId',
      { fieldId: new StringRecordId(fieldRecordId) },
    )

    const result = new Map<string, unknown[]>()
    for (const edge of (edges || [])) {
      const nodeId = rid(edge.node_ref)
      if (!nodeIds.has(nodeId)) continue

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
    const [rows] = await db.query<[Array<{ id: RecordId }>]>(
      'SELECT id FROM node WHERE deleted_at IS NONE',
    )

    const result = new Set<string>()
    for (const row of (rows || [])) {
      const nodeId = rid(row.id)
      if (nodeIds.has(nodeId)) {
        result.add(nodeId)
      }
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
