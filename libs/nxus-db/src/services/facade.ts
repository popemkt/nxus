/**
 * NodeFacade - Unified async API for all node operations.
 *
 * Selects the appropriate backend (SQLite or SurrealDB) based on
 * the ARCHITECTURE_TYPE environment variable and delegates all
 * operations through the NodeBackend interface.
 *
 * Usage:
 *   import { nodeFacade } from '@nxus/db/server'
 *   await nodeFacade.init()
 *   const node = await nodeFacade.assembleNode(nodeId)
 */

import type { AssembledNode, CreateNodeOptions } from '../types/node.js'
import type { FieldSystemId } from '../schemas/node-schema.js'
import type { QueryDefinition } from '../types/query.js'
import type { SupertagInfo } from './node.service.js'
import type { NodeBackend, QueryEvaluationResult } from './backends/types.js'

type ArchitectureType = 'node' | 'graph'

export class NodeFacade implements NodeBackend {
  private backend: NodeBackend | null = null
  private initialized = false

  /**
   * Initialize the facade by selecting and initializing the appropriate backend.
   *
   * Reads `process.env.ARCHITECTURE_TYPE` to determine which backend to use:
   * - 'node' (default): SQLite backend via node.service.ts
   * - 'graph': SurrealDB backend (graph-based assembly via has_field edges)
   *
   * Idempotent: calling init() multiple times is safe.
   */
  async init(): Promise<void> {
    if (this.initialized) return

    const archType: ArchitectureType =
      process.env.ARCHITECTURE_TYPE === 'graph' ? 'graph' : 'node'

    if (archType === 'graph') {
      const { SurrealBackend } = await import('./backends/surreal-backend.js')
      this.backend = new SurrealBackend()
    } else {
      const { SqliteBackend } = await import('./backends/sqlite-backend.js')
      this.backend = new SqliteBackend()
    }

    await this.backend.init()

    this.initialized = true
  }

  /**
   * Initialize the facade with an externally-provided backend instance.
   * Useful for testing.
   */
  initWithBackend(backend: NodeBackend): void {
    this.backend = backend
    this.initialized = true
  }

  private ensureInitialized(): NodeBackend {
    if (!this.initialized || !this.backend) {
      throw new Error(
        'NodeFacade not initialized. Call init() or initWithBackend() first.',
      )
    }
    return this.backend
  }

  // ---------------------------------------------------------------------------
  // Node CRUD
  // ---------------------------------------------------------------------------

  async findNodeById(nodeId: string): Promise<AssembledNode | null> {
    return this.ensureInitialized().findNodeById(nodeId)
  }

  async findNodeBySystemId(systemId: string): Promise<AssembledNode | null> {
    return this.ensureInitialized().findNodeBySystemId(systemId)
  }

  async createNode(options: CreateNodeOptions): Promise<string> {
    return this.ensureInitialized().createNode(options)
  }

  async updateNodeContent(nodeId: string, content: string): Promise<void> {
    return this.ensureInitialized().updateNodeContent(nodeId, content)
  }

  async deleteNode(nodeId: string): Promise<void> {
    return this.ensureInitialized().deleteNode(nodeId)
  }

  // ---------------------------------------------------------------------------
  // Node Assembly
  // ---------------------------------------------------------------------------

  async assembleNode(nodeId: string): Promise<AssembledNode | null> {
    return this.ensureInitialized().assembleNode(nodeId)
  }

  async assembleNodeWithInheritance(
    nodeId: string,
  ): Promise<AssembledNode | null> {
    return this.ensureInitialized().assembleNodeWithInheritance(nodeId)
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
    return this.ensureInitialized().setProperty(nodeId, fieldId, value, order)
  }

  async addPropertyValue(
    nodeId: string,
    fieldId: FieldSystemId,
    value: unknown,
  ): Promise<void> {
    return this.ensureInitialized().addPropertyValue(nodeId, fieldId, value)
  }

  async clearProperty(
    nodeId: string,
    fieldId: FieldSystemId,
  ): Promise<void> {
    return this.ensureInitialized().clearProperty(nodeId, fieldId)
  }

  async linkNodes(
    fromId: string,
    fieldId: FieldSystemId,
    toId: string,
    append?: boolean,
  ): Promise<void> {
    return this.ensureInitialized().linkNodes(fromId, fieldId, toId, append)
  }

  // ---------------------------------------------------------------------------
  // Supertag Operations
  // ---------------------------------------------------------------------------

  async addNodeSupertag(
    nodeId: string,
    supertagSystemId: string,
  ): Promise<boolean> {
    return this.ensureInitialized().addNodeSupertag(nodeId, supertagSystemId)
  }

  async removeNodeSupertag(
    nodeId: string,
    supertagSystemId: string,
  ): Promise<boolean> {
    return this.ensureInitialized().removeNodeSupertag(
      nodeId,
      supertagSystemId,
    )
  }

  async getNodeSupertags(nodeId: string): Promise<SupertagInfo[]> {
    return this.ensureInitialized().getNodeSupertags(nodeId)
  }

  async getNodesBySupertags(
    supertagSystemIds: string[],
    matchAll?: boolean,
  ): Promise<AssembledNode[]> {
    return this.ensureInitialized().getNodesBySupertags(
      supertagSystemIds,
      matchAll,
    )
  }

  // ---------------------------------------------------------------------------
  // Inheritance & Field Definitions
  // ---------------------------------------------------------------------------

  async getNodesBySupertagWithInheritance(
    supertagId: string,
  ): Promise<AssembledNode[]> {
    return this.ensureInitialized().getNodesBySupertagWithInheritance(
      supertagId,
    )
  }

  async getAncestorSupertags(
    supertagId: string,
    maxDepth?: number,
  ): Promise<string[]> {
    return this.ensureInitialized().getAncestorSupertags(supertagId, maxDepth)
  }

  async getSupertagFieldDefinitions(
    supertagId: string,
  ): Promise<
    Map<string, { fieldNodeId: string; fieldName: string; defaultValue?: unknown }>
  > {
    return this.ensureInitialized().getSupertagFieldDefinitions(supertagId)
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  async evaluateQuery(
    definition: QueryDefinition,
  ): Promise<QueryEvaluationResult> {
    return this.ensureInitialized().evaluateQuery(definition)
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  async save(): Promise<void> {
    return this.ensureInitialized().save()
  }
}

/** Singleton facade instance for use throughout the application */
export const nodeFacade = new NodeFacade()
