/**
 * graph.service.ts - Graph database operations using SurrealDB
 *
 * Provides CRUD operations for nodes, supertags, and semantic relations.
 * Includes Tana-style recursive traversal operators.
 */

import type { Surreal, RecordId } from 'surrealdb'
import {
  getGraphDatabase,
  initGraphDatabase,
  toRecordId,
  eventBus,
} from '@nxus/db/server'

// ============================================================================
// Types
// ============================================================================

export interface GraphNode {
  id: RecordId
  content?: string
  content_plain?: string
  system_id?: string
  props?: Record<string, unknown>
  created_at: Date
  updated_at: Date
  deleted_at?: Date
}

export interface GraphSupertag {
  id: RecordId
  name: string
  system_id?: string
  color?: string
  icon?: string
  field_schema?: FieldDefinition[]
  created_at: Date
}

export interface FieldDefinition {
  name: string
  type: 'string' | 'number' | 'boolean' | 'date' | 'reference' | 'array'
  required?: boolean
  default?: unknown
}

export interface GraphRelation {
  id: RecordId
  in: RecordId
  out: RecordId
  order?: number
  context?: string
  created_at: Date
}

// Semantic relation types
export type RelationType =
  | 'part_of'
  | 'dependency_of'
  | 'references'
  | 'tagged_with'
  | 'has_supertag'
  | 'extends'

// ============================================================================
// Database Access
// ============================================================================

async function getDb(): Promise<Surreal> {
  await initGraphDatabase()
  return getGraphDatabase()
}

// ============================================================================
// Node CRUD
// ============================================================================

/**
 * Create a new node
 */
export async function createNode(data: {
  content?: string
  system_id?: string
  props?: Record<string, unknown>
  supertag?: string // supertag ID like 'supertag:item'
}): Promise<GraphNode> {
  const db = await getDb()

  // Build SET clauses dynamically — SurrealDB v2 SCHEMAFULL rejects NULL
  // for option<T> fields; we must omit the field entirely instead of passing null.
  const setClauses: string[] = []
  const params: Record<string, unknown> = {}

  if (data.content !== undefined) {
    setClauses.push('content = $content', 'content_plain = $content_plain')
    params.content = data.content
    params.content_plain = data.content.toLowerCase()
  }

  if (data.system_id !== undefined) {
    setClauses.push('system_id = $system_id')
    params.system_id = data.system_id
  }

  setClauses.push('props = $props')
  params.props = data.props ?? {}

  setClauses.push('created_at = time::now()', 'updated_at = time::now()')

  const [node] = await db.query<[GraphNode[]]>(
    `CREATE node SET ${setClauses.join(', ')}`,
    params,
  )

  const created = node[0]

  if (!created) {
    throw new Error('Failed to create node')
  }

  const now = new Date()

  // Emit node:created event
  eventBus.emit({
    type: 'node:created',
    timestamp: now,
    nodeId: String(created.id),
    afterValue: {
      id: String(created.id),
      content: data.content,
      system_id: data.system_id,
    },
  })

  // Assign supertag if provided
  if (data.supertag) {
    await addRelation('has_supertag', created.id, data.supertag)
  }

  return created
}

/**
 * Get a node by ID
 */
export async function getNode(
  id: string | RecordId,
): Promise<GraphNode | null> {
  const db = await getDb()
  const recordId = typeof id === 'string' ? toRecordId(id) : id
  const [result] = await db.query<[GraphNode[]]>(`SELECT * FROM $id`, {
    id: recordId,
  })
  return result[0] || null
}

/**
 * Get a node by system_id
 */
export async function getNodeBySystemId(
  systemId: string,
): Promise<GraphNode | null> {
  const db = await getDb()
  const [result] = await db.query<[GraphNode[]]>(
    `SELECT * FROM node WHERE system_id = $systemId AND deleted_at IS NONE`,
    { systemId },
  )
  return result[0] || null
}

/**
 * Update a node
 */
export async function updateNode(
  id: string | RecordId,
  data: Partial<{
    content: string
    props: Record<string, unknown>
  }>,
): Promise<GraphNode | null> {
  const db = await getDb()

  const recordId = typeof id === 'string' ? toRecordId(id) : id

  // Fetch current state for beforeValue
  const [before] = await db.query<[GraphNode[]]>(`SELECT * FROM $id`, {
    id: recordId,
  })
  const beforeNode = before[0] || null

  const updates: string[] = ['updated_at = time::now()']
  const params: Record<string, unknown> = { id: recordId }

  if (data.content !== undefined) {
    updates.push('content = $content', 'content_plain = $content_plain')
    params.content = data.content
    params.content_plain = data.content.toLowerCase()
  }

  if (data.props !== undefined) {
    updates.push('props = $props')
    params.props = data.props
  }

  const [result] = await db.query<[GraphNode[]]>(
    `UPDATE $id SET ${updates.join(', ')} RETURN AFTER`,
    params,
  )

  const updated = result[0] || null

  if (updated) {
    const now = new Date()
    eventBus.emit({
      type: 'node:updated',
      timestamp: now,
      nodeId: String(updated.id),
      beforeValue: beforeNode
        ? { content: beforeNode.content, props: beforeNode.props }
        : undefined,
      afterValue: { content: updated.content, props: updated.props },
    })
  }

  return updated
}

/**
 * Soft delete a node
 */
export async function deleteNode(id: string | RecordId): Promise<boolean> {
  const db = await getDb()
  const recordId = typeof id === 'string' ? toRecordId(id) : id
  await db.query(`UPDATE $id SET deleted_at = time::now()`, { id: recordId })

  const now = new Date()
  eventBus.emit({
    type: 'node:deleted',
    timestamp: now,
    nodeId: String(recordId),
  })

  return true
}

/**
 * Hard delete a node and its relations
 */
export async function purgeNode(id: string | RecordId): Promise<boolean> {
  const db = await getDb()
  const recordId = typeof id === 'string' ? toRecordId(id) : id
  await db.query(
    `
    DELETE FROM part_of WHERE in = $id OR out = $id;
    DELETE FROM dependency_of WHERE in = $id OR out = $id;
    DELETE FROM references WHERE in = $id OR out = $id;
    DELETE FROM tagged_with WHERE in = $id OR out = $id;
    DELETE FROM has_supertag WHERE in = $id;
    DELETE $id;
    `,
    { id: recordId },
  )

  const now = new Date()
  eventBus.emit({
    type: 'node:deleted',
    timestamp: now,
    nodeId: String(recordId),
  })

  return true
}

// ============================================================================
// Supertag Operations
// ============================================================================

/**
 * Get all supertags
 */
export async function getAllSupertags(): Promise<GraphSupertag[]> {
  const db = await getDb()
  const [result] = await db.query<[GraphSupertag[]]>(`SELECT * FROM supertag`)
  return result
}

/**
 * Get a supertag by system_id
 */
export async function getSupertagBySystemId(
  systemId: string,
): Promise<GraphSupertag | null> {
  const db = await getDb()
  const [result] = await db.query<[GraphSupertag[]]>(
    `SELECT * FROM supertag WHERE system_id = $systemId`,
    { systemId },
  )
  return result[0] || null
}

/**
 * Get nodes by supertag
 */
export async function getNodesBySupertag(
  supertagId: string,
): Promise<GraphNode[]> {
  const db = await getDb()
  // Use a subquery to find nodes with the given supertag relation.
  // The graph traversal CONTAINS approach is unreliable with string record IDs.
  const [result] = await db.query<[GraphNode[]]>(
    `SELECT * FROM node WHERE id IN (
      SELECT VALUE in FROM has_supertag WHERE out = $supertagId
    ) AND deleted_at IS NONE`,
    { supertagId: toRecordId(supertagId) },
  )
  return result
}

// ============================================================================
// Relation Operations
// ============================================================================

/**
 * Add a relation between nodes
 */
export async function addRelation(
  type: RelationType,
  fromId: string | RecordId,
  toId: string | RecordId,
  data?: { order?: number; context?: string },
): Promise<GraphRelation> {
  const db = await getDb()

  // Build SET clauses dynamically to avoid passing NULL for option<T> fields
  const setClauses: string[] = []
  const params: Record<string, unknown> = {
    from: typeof fromId === 'string' ? toRecordId(fromId) : fromId,
    to: typeof toId === 'string' ? toRecordId(toId) : toId,
  }

  if (data?.order !== undefined) {
    setClauses.push('order = $order')
    params.order = data.order
  }

  if (data?.context !== undefined) {
    setClauses.push('context = $context')
    params.context = data.context
  }

  setClauses.push('created_at = time::now()')

  const [result] = await db.query<[GraphRelation[]]>(
    `RELATE $from->${type}->$to SET ${setClauses.join(', ')}`,
    params,
  )

  const created = result[0]
  if (!created) {
    throw new Error(`Failed to create ${type} relation`)
  }

  // Emit supertag:added event when adding a has_supertag relation
  if (type === 'has_supertag') {
    const now = new Date()
    eventBus.emit({
      type: 'supertag:added',
      timestamp: now,
      nodeId: String(created.in),
      supertagId: String(created.out),
    })
  }

  return created
}

/**
 * Remove a relation
 */
export async function removeRelation(
  type: RelationType,
  fromId: string | RecordId,
  toId: string | RecordId,
): Promise<boolean> {
  const db = await getDb()
  const from = typeof fromId === 'string' ? toRecordId(fromId) : fromId
  const to = typeof toId === 'string' ? toRecordId(toId) : toId

  await db.query(`DELETE FROM ${type} WHERE in = $from AND out = $to`, {
    from,
    to,
  })

  // Emit supertag:removed event when removing a has_supertag relation
  if (type === 'has_supertag') {
    const now = new Date()
    eventBus.emit({
      type: 'supertag:removed',
      timestamp: now,
      nodeId: String(from),
      supertagId: String(to),
    })
  }

  return true
}

/**
 * Get outgoing relations from a node
 */
export async function getOutgoingRelations(
  nodeId: string | RecordId,
  type: RelationType,
): Promise<GraphNode[]> {
  const db = await getDb()
  // Use a subquery approach for reliability with parameterized record IDs
  const [result] = await db.query<[GraphNode[]]>(
    `SELECT * FROM node WHERE id IN (
      SELECT VALUE out FROM ${type} WHERE in = $nodeId
    ) AND deleted_at IS NONE`,
    { nodeId: typeof nodeId === 'string' ? toRecordId(nodeId) : nodeId },
  )
  return result
}

/**
 * Get incoming relations to a node (backlinks)
 */
export async function getIncomingRelations(
  nodeId: string | RecordId,
  type: RelationType,
): Promise<GraphNode[]> {
  const db = await getDb()
  // Use a subquery to find source nodes — SurrealDB v2 doesn't support
  // $param in reverse graph traversal paths (node<-rel<-$param).
  const [result] = await db.query<[GraphNode[]]>(
    `SELECT * FROM node WHERE id IN (
      SELECT VALUE in FROM ${type} WHERE out = $nodeId
    ) AND deleted_at IS NONE`,
    { nodeId: typeof nodeId === 'string' ? toRecordId(nodeId) : nodeId },
  )
  return result
}

// ============================================================================
// Semantic Traversal Operators (Tana-style)
// ============================================================================

/**
 * COMPONENTS REC: Get all descendants via part_of relation (recursive)
 *
 * Example: Get all tasks that are part of a project (at any depth)
 */
export async function componentsRec(
  nodeId: string | RecordId,
  maxDepth = 10,
): Promise<GraphNode[]> {
  const db = await getDb()
  const recordId = typeof nodeId === 'string' ? toRecordId(nodeId) : nodeId

  // SurrealDB v2 recursive traversal with +collect to gather all intermediate nodes
  const result = await db.query<[null, GraphNode[]]>(
    `
    LET $ids = $nodeId.{..${maxDepth}+collect}(<-part_of<-node);
    SELECT * FROM node WHERE id IN $ids AND deleted_at IS NONE;
    `,
    { nodeId: recordId },
  )

  const nodes = result[1] ?? []

  // Deduplicate results
  const seen = new Set<string>()
  return nodes.filter((node) => {
    const id = String(node.id)
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

/**
 * Alternative COMPONENTS REC using explicit iterative subquery approach.
 * Falls back to manual depth expansion (useful if +collect is unavailable).
 */
export async function componentsRecExplicit(
  nodeId: string | RecordId,
  maxDepth = 10,
): Promise<GraphNode[]> {
  const db = await getDb()
  const recordId = typeof nodeId === 'string' ? toRecordId(nodeId) : nodeId

  // Build iterative LET expansion up to maxDepth
  const lets: string[] = []
  const depthVars: string[] = []
  const clampedDepth = Math.min(maxDepth, 10)
  for (let i = 1; i <= clampedDepth; i++) {
    const prev = i === 1 ? '$nodeId' : `$d${i - 1}`
    lets.push(`LET $d${i} = (SELECT VALUE in FROM part_of WHERE out IN ${prev === '$nodeId' ? '[$nodeId]' : prev});`)
    depthVars.push(`$d${i}`)
  }

  const query = `
    ${lets.join('\n')}
    LET $all = array::distinct(array::flatten([${depthVars.join(', ')}]));
    SELECT * FROM node WHERE id IN $all AND deleted_at IS NONE;
  `

  const results = await db.query<unknown[]>(query, { nodeId: recordId })
  // The SELECT result is the last element
  return (results[results.length - 1] as GraphNode[]) ?? []
}

/**
 * DEPENDENCIES REC: Get all dependencies recursively (prerequisite chain)
 *
 * Example: What must be done before this task?
 */
export async function dependenciesRec(
  nodeId: string | RecordId,
  maxDepth = 10,
): Promise<GraphNode[]> {
  const db = await getDb()
  const recordId = typeof nodeId === 'string' ? toRecordId(nodeId) : nodeId

  const result = await db.query<[null, GraphNode[]]>(
    `
    LET $ids = $nodeId.{..${maxDepth}+collect}(->dependency_of->node);
    SELECT * FROM node WHERE id IN $ids AND deleted_at IS NONE;
    `,
    { nodeId: recordId },
  )

  return result[1] ?? []
}

/**
 * DEPENDENTS REC: Get all nodes that depend on this (reverse dependency chain)
 *
 * Example: What will be blocked if this is delayed?
 */
export async function dependentsRec(
  nodeId: string | RecordId,
  maxDepth = 10,
): Promise<GraphNode[]> {
  const db = await getDb()
  const recordId = typeof nodeId === 'string' ? toRecordId(nodeId) : nodeId

  const result = await db.query<[null, GraphNode[]]>(
    `
    LET $ids = $nodeId.{..${maxDepth}+collect}(<-dependency_of<-node);
    SELECT * FROM node WHERE id IN $ids AND deleted_at IS NONE;
    `,
    { nodeId: recordId },
  )

  return result[1] ?? []
}

/**
 * BACKLINKS: Get all nodes that reference this node
 */
export async function backlinks(
  nodeId: string | RecordId,
): Promise<GraphNode[]> {
  const db = await getDb()
  const recordId = typeof nodeId === 'string' ? toRecordId(nodeId) : nodeId

  // Use subquery approach — reliable with parameterized record IDs
  const [result] = await db.query<[GraphNode[]]>(
    `
    SELECT * FROM node WHERE id IN (
      SELECT VALUE in FROM references WHERE out = $nodeId
    ) AND deleted_at IS NONE
    `,
    { nodeId: recordId },
  )

  return result
}

/**
 * ANCESTORS: Get all ancestors via part_of (what is this part of?)
 */
export async function ancestorsRec(
  nodeId: string | RecordId,
  maxDepth = 10,
): Promise<GraphNode[]> {
  const db = await getDb()
  const recordId = typeof nodeId === 'string' ? toRecordId(nodeId) : nodeId

  const result = await db.query<[null, GraphNode[]]>(
    `
    LET $ids = $nodeId.{..${maxDepth}+collect}(->part_of->node);
    SELECT * FROM node WHERE id IN $ids AND deleted_at IS NONE;
    `,
    { nodeId: recordId },
  )

  return result[1] ?? []
}

// ============================================================================
// Query Helpers
// ============================================================================

/**
 * Find nodes by content search
 */
export async function searchNodes(query: string): Promise<GraphNode[]> {
  const db = await getDb()

  const [result] = await db.query<[GraphNode[]]>(
    `
    SELECT * FROM node 
    WHERE content_plain CONTAINS $query
      AND deleted_at IS NONE
    ORDER BY updated_at DESC
    `,
    { query: query.toLowerCase() },
  )

  return result
}

/**
 * Get nodes with a specific property value
 */
export async function getNodesByProperty(
  key: string,
  value: unknown,
): Promise<GraphNode[]> {
  const db = await getDb()

  const [result] = await db.query<[GraphNode[]]>(
    `
    SELECT * FROM node 
    WHERE props[$key] = $value
      AND deleted_at IS NONE
    `,
    { key, value },
  )

  return result
}

// ============================================================================
// Live Queries (Reactive Subscriptions)
// ============================================================================

type LiveAction = 'CREATE' | 'UPDATE' | 'DELETE'

// Note: SurrealDB live queries have specific API requirements.
// These functions provide a simplified interface with polling fallback.

/**
 * Subscribe to changes on nodes with a specific supertag
 *
 * Uses polling-based reactivity for reliability across SurrealDB versions.
 * Returns an unsubscribe function.
 */
export function subscribeToSupertag(
  _supertagId: string,
  callback: (action: LiveAction, node: GraphNode) => void,
): () => void {
  let active = true
  let lastNodes: Map<string, GraphNode> = new Map()

  const poll = async () => {
    if (!active) return

    try {
      const nodes = await getNodesBySupertag(_supertagId)
      const currentNodes = new Map(nodes.map((n) => [String(n.id), n]))

      // Detect changes
      for (const [id, node] of currentNodes) {
        const prev = lastNodes.get(id)
        if (!prev) {
          callback('CREATE', node)
        } else if (
          JSON.stringify(prev.props) !== JSON.stringify(node.props) ||
          prev.content !== node.content
        ) {
          callback('UPDATE', node)
        }
      }

      // Detect deletions
      for (const [id, node] of lastNodes) {
        if (!currentNodes.has(id)) {
          callback('DELETE', node)
        }
      }

      lastNodes = currentNodes
    } catch (error) {
      console.error('[subscribeToSupertag] Poll error:', error)
    }

    if (active) {
      setTimeout(poll, 1000) // Poll every second
    }
  }

  poll()

  return () => {
    active = false
  }
}

/**
 * Subscribe to changes on a specific node
 */
export function subscribeToNode(
  nodeId: string | RecordId,
  callback: (action: LiveAction, node: GraphNode) => void,
): () => void {
  let active = true
  let lastNode: GraphNode | null = null

  const poll = async () => {
    if (!active) return

    try {
      const node = await getNode(nodeId)

      if (!lastNode && node) {
        callback('CREATE', node)
      } else if (lastNode && !node) {
        callback('DELETE', lastNode)
      } else if (
        lastNode &&
        node &&
        (JSON.stringify(lastNode.props) !== JSON.stringify(node.props) ||
          lastNode.content !== node.content)
      ) {
        callback('UPDATE', node)
      }

      lastNode = node
    } catch (error) {
      console.error('[subscribeToNode] Poll error:', error)
    }

    if (active) {
      setTimeout(poll, 1000)
    }
  }

  poll()

  return () => {
    active = false
  }
}

/**
 * Subscribe to components of a node (live COMPONENTS REC)
 */
export function subscribeToComponents(
  nodeId: string | RecordId,
  callback: (nodes: GraphNode[]) => void,
): () => void {
  let active = true
  let lastHash = ''

  const poll = async () => {
    if (!active) return

    try {
      const components = await componentsRec(nodeId)
      const hash = JSON.stringify(components.map((n) => n.id))

      if (hash !== lastHash) {
        callback(components)
        lastHash = hash
      }
    } catch (error) {
      console.error('[subscribeToComponents] Poll error:', error)
    }

    if (active) {
      setTimeout(poll, 1000)
    }
  }

  poll()

  return () => {
    active = false
  }
}
