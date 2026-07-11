/**
 * NodeBackend interface - The async facade contract for all database backends.
 *
 * Every backend (SQLite, SurrealDB, etc.) must implement this interface.
 * All methods are async to support both sync and async backends uniformly.
 *
 * Pure helper functions like getProperty() and getPropertyValues() operate
 * on AssembledNode and are NOT part of this interface — they remain as
 * module-level functions in node.service.ts.
 */

import type { AssembledNode, CreateNodeOptions } from '../../types/node.js'
import type { FieldSystemId } from '../../schemas/node-schema.js'
import type { QueryDefinition } from '../../types/query.js'
import type { BaseType } from '../../types/base-type.js'
import type { SupertagInfo } from '../node.service.js'
import type { QueryEvaluationResult } from '../query-evaluator.service.js'

// Re-export from the canonical definition in query-evaluator.service
export type { QueryEvaluationResult } from '../query-evaluator.service.js'

export interface FieldUsageStats {
  nodeCount: number
  supertagCount: number
}

export interface ReorderNodeUpdate {
  nodeId: string
  order: number
}

/**
 * The async backend contract. All database backends must implement this.
 */
export interface NodeBackend {
  /**
   * Initialize the backend (create connections, bootstrap schema, etc.).
   * Must be idempotent — calling init() multiple times is safe.
   */
  init(): Promise<void>

  // ---------------------------------------------------------------------------
  // Node CRUD
  // ---------------------------------------------------------------------------

  /** Find a node by its UUID and return it fully assembled, or null if not found */
  findNodeById(nodeId: string): Promise<AssembledNode | null>

  /** Find a node by its systemId and return it fully assembled, or null if not found */
  findNodeBySystemId(systemId: string): Promise<AssembledNode | null>

  /** Create a new node and return its ID */
  createNode(options: CreateNodeOptions): Promise<string>

  /** Update the content (display text) of a node */
  updateNodeContent(nodeId: string, content: string): Promise<void>

  /** Soft-delete a node */
  deleteNode(nodeId: string): Promise<void>

  /** Restore a soft-deleted node */
  restoreNode(nodeId: string): Promise<void>

  /** Reparent a node and optionally update its sibling order */
  reparentNode(
    nodeId: string,
    newParentId: string | null,
    order?: number,
  ): Promise<void>

  /** Atomically update order properties for multiple nodes */
  reorderNodes(updates: ReorderNodeUpdate[]): Promise<void>

  /** Get live workspace roots, falling back to any live user node */
  getWorkspaceRoots(): Promise<string[]>

  // ---------------------------------------------------------------------------
  // Node Assembly
  // ---------------------------------------------------------------------------

  /** Assemble a node with all its current properties and supertags */
  assembleNode(nodeId: string): Promise<AssembledNode | null>

  /** Assemble a node with inherited field defaults from supertag chain */
  assembleNodeWithInheritance(nodeId: string): Promise<AssembledNode | null>

  /** Batch-assemble children of the given parents, one level. */
  getChildrenByParents(parentIds: string[]): Promise<Map<string, AssembledNode[]>>

  /** For each candidate parent, whether it has any non-deleted children. */
  hasChildren(parentIds: string[]): Promise<Map<string, boolean>>

  // ---------------------------------------------------------------------------
  // Property Operations
  // ---------------------------------------------------------------------------

  /** Set (create or replace) a property value on a node */
  setProperty(
    nodeId: string,
    fieldId: FieldSystemId,
    value: unknown,
    order?: number,
  ): Promise<void>

  /** Add a value to a multi-value property (appends with next order) */
  addPropertyValue(
    nodeId: string,
    fieldId: FieldSystemId,
    value: unknown,
  ): Promise<void>

  /** Remove all values for a field on a node */
  clearProperty(nodeId: string, fieldId: FieldSystemId): Promise<void>

  /** Remove the exact owner/field property row or edge */
  removePropertyRow(ownerNodeId: string, fieldNodeId: string): Promise<void>

  /** Get distinct property values used by live nodes for a field node */
  getDistinctPropertyValues(fieldNodeId: string): Promise<unknown[]>

  /** Count live nodes and supertags using a field node */
  getFieldUsageStats(fieldNodeId: string): Promise<FieldUsageStats>

  /** Link two nodes via a field (set or append depending on `append` flag) */
  linkNodes(
    fromId: string,
    fieldId: FieldSystemId,
    toId: string,
    append?: boolean,
  ): Promise<void>

  // ---------------------------------------------------------------------------
  // Supertag Operations
  // ---------------------------------------------------------------------------

  /** Add a supertag to a node. Returns true if added, false if already present. */
  addNodeSupertag(nodeId: string, supertagSystemId: string): Promise<boolean>

  /** Remove a supertag from a node. Returns true if removed, false if not found. */
  removeNodeSupertag(nodeId: string, supertagSystemId: string): Promise<boolean>

  /** Get all supertags assigned to a node */
  getNodeSupertags(nodeId: string): Promise<SupertagInfo[]>

  /** Get all assembled nodes that have any/all of the given supertags */
  getNodesBySupertags(
    supertagSystemIds: string[],
    matchAll?: boolean,
  ): Promise<AssembledNode[]>

  // ---------------------------------------------------------------------------
  // Inheritance & Field Definitions
  // ---------------------------------------------------------------------------

  /** Get all assembled nodes with a supertag, including inherited supertags */
  getNodesBySupertagWithInheritance(
    supertagId: string,
  ): Promise<AssembledNode[]>

  /** Get assembled live nodes whose assigned supertag has the requested base type */
  getNodesBySupertagBaseType(baseType: BaseType): Promise<AssembledNode[]>

  /** Walk the extends chain to find ancestor supertags */
  getAncestorSupertags(
    supertagId: string,
    maxDepth?: number,
  ): Promise<string[]>

  /** Get field definitions declared by a supertag */
  getSupertagFieldDefinitions(
    supertagId: string,
  ): Promise<
    Map<string, { fieldNodeId: string; fieldName: string; defaultValue?: unknown }>
  >

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /** Evaluate a query definition and return matching nodes */
  evaluateQuery(definition: QueryDefinition): Promise<QueryEvaluationResult>

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /** Persist any pending changes (no-op for auto-persisting backends) */
  save(): Promise<void>
}
