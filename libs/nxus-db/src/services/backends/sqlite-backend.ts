/**
 * SqliteBackend - Wraps existing synchronous node.service.ts functions
 * behind the async NodeBackend interface.
 *
 * Each method delegates to the corresponding function in node.service.ts,
 * passing the internal `this.db` reference and returning the result as
 * a resolved Promise.
 */

import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import type * as itemSchema from '../../schemas/item-schema.js'
import type { FieldSystemId } from '../../schemas/node-schema.js'
import type { AssembledNode, CreateNodeOptions } from '../../types/node.js'
import type { QueryDefinition } from '../../types/query.js'
import type { NodeBackend, QueryEvaluationResult } from './types.js'
import type { SupertagInfo } from '../node.service.js'

import * as nodeService from '../node.service.js'
import { evaluateQuery as evaluateQueryService } from '../query-evaluator.service.js'
import { initDatabase } from '../../client/master-client.js'
import { bootstrapSystemNodesSync } from '../bootstrap.js'

type DatabaseInstance = BetterSQLite3Database<typeof itemSchema>

export class SqliteBackend implements NodeBackend {
  private db: DatabaseInstance | null = null
  private initialized = false

  async init(): Promise<void> {
    if (this.initialized) return

    this.db = initDatabase()
    bootstrapSystemNodesSync(this.db, { verbose: false })
    this.initialized = true
  }

  /**
   * Initialize with an externally-provided database instance.
   * Useful for testing with in-memory databases.
   */
  initWithDb(db: DatabaseInstance): void {
    this.db = db
    this.initialized = true
  }

  private ensureInitialized(): DatabaseInstance {
    if (!this.initialized || !this.db) {
      throw new Error(
        'SqliteBackend not initialized. Call init() or initWithDb() first.',
      )
    }
    return this.db
  }

  // ---------------------------------------------------------------------------
  // Node CRUD
  // ---------------------------------------------------------------------------

  async findNodeById(nodeId: string): Promise<AssembledNode | null> {
    const db = this.ensureInitialized()
    return nodeService.findNodeById(db, nodeId)
  }

  async findNodeBySystemId(systemId: string): Promise<AssembledNode | null> {
    const db = this.ensureInitialized()
    return nodeService.findNodeBySystemId(db, systemId)
  }

  async createNode(options: CreateNodeOptions): Promise<string> {
    const db = this.ensureInitialized()
    return nodeService.createNode(db, options)
  }

  async updateNodeContent(nodeId: string, content: string): Promise<void> {
    const db = this.ensureInitialized()
    nodeService.updateNodeContent(db, nodeId, content)
  }

  async deleteNode(nodeId: string): Promise<void> {
    const db = this.ensureInitialized()
    nodeService.deleteNode(db, nodeId)
  }

  // ---------------------------------------------------------------------------
  // Node Assembly
  // ---------------------------------------------------------------------------

  async assembleNode(nodeId: string): Promise<AssembledNode | null> {
    const db = this.ensureInitialized()
    return nodeService.assembleNode(db, nodeId)
  }

  async assembleNodeWithInheritance(
    nodeId: string,
  ): Promise<AssembledNode | null> {
    const db = this.ensureInitialized()
    return nodeService.assembleNodeWithInheritance(db, nodeId)
  }

  // ---------------------------------------------------------------------------
  // Property Operations
  // ---------------------------------------------------------------------------

  async setProperty(
    nodeId: string,
    fieldId: FieldSystemId,
    value: unknown,
    order?: number,
  ): Promise<void> {
    const db = this.ensureInitialized()
    nodeService.setProperty(db, nodeId, fieldId, value, order)
  }

  async addPropertyValue(
    nodeId: string,
    fieldId: FieldSystemId,
    value: unknown,
  ): Promise<void> {
    const db = this.ensureInitialized()
    nodeService.addPropertyValue(db, nodeId, fieldId, value)
  }

  async clearProperty(
    nodeId: string,
    fieldId: FieldSystemId,
  ): Promise<void> {
    const db = this.ensureInitialized()
    nodeService.clearProperty(db, nodeId, fieldId)
  }

  async linkNodes(
    fromId: string,
    fieldId: FieldSystemId,
    toId: string,
    append?: boolean,
  ): Promise<void> {
    const db = this.ensureInitialized()
    nodeService.linkNodes(db, fromId, fieldId, toId, append)
  }

  // ---------------------------------------------------------------------------
  // Supertag Operations
  // ---------------------------------------------------------------------------

  async addNodeSupertag(
    nodeId: string,
    supertagSystemId: string,
  ): Promise<boolean> {
    const db = this.ensureInitialized()
    return nodeService.addNodeSupertag(db, nodeId, supertagSystemId)
  }

  async removeNodeSupertag(
    nodeId: string,
    supertagSystemId: string,
  ): Promise<boolean> {
    const db = this.ensureInitialized()
    return nodeService.removeNodeSupertag(db, nodeId, supertagSystemId)
  }

  async getNodeSupertags(nodeId: string): Promise<SupertagInfo[]> {
    const db = this.ensureInitialized()
    return nodeService.getNodeSupertags(db, nodeId)
  }

  async getNodesBySupertags(
    supertagSystemIds: string[],
    matchAll?: boolean,
  ): Promise<AssembledNode[]> {
    const db = this.ensureInitialized()
    return nodeService.getNodesBySupertags(db, supertagSystemIds, matchAll)
  }

  // ---------------------------------------------------------------------------
  // Inheritance & Field Definitions
  // ---------------------------------------------------------------------------

  async getNodesBySupertagWithInheritance(
    supertagId: string,
  ): Promise<AssembledNode[]> {
    const db = this.ensureInitialized()
    return nodeService.getNodesBySupertagWithInheritance(db, supertagId)
  }

  async getAncestorSupertags(
    supertagId: string,
    maxDepth?: number,
  ): Promise<string[]> {
    const db = this.ensureInitialized()
    return nodeService.getAncestorSupertags(db, supertagId, maxDepth)
  }

  async getSupertagFieldDefinitions(
    supertagId: string,
  ): Promise<
    Map<string, { fieldNodeId: string; fieldName: string; defaultValue?: unknown }>
  > {
    const db = this.ensureInitialized()
    return nodeService.getSupertagFieldDefinitions(db, supertagId)
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  async evaluateQuery(
    definition: QueryDefinition,
  ): Promise<QueryEvaluationResult> {
    const db = this.ensureInitialized()
    return evaluateQueryService(db, definition)
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  async save(): Promise<void> {
    // No-op: better-sqlite3 auto-persists
  }
}
