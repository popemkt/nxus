/**
 * node.ts - Node-related types
 *
 * These types are shared between client and server code.
 * NO runtime imports here - types only!
 */

import type { FieldContentName } from '../schemas/node-schema.js'

/**
 * A fully assembled node with all its properties and supertags resolved.
 *
 * Properties are keyed by FieldContentName (the field node's `content` value,
 * e.g., 'parent', 'status'). Use FIELD_NAMES constants for type-safe access.
 * Do NOT use SYSTEM_FIELDS here — those are for write operations only.
 */
export interface AssembledNode {
  id: string
  content: string | null
  systemId: string | null
  ownerId: string | null
  createdAt: Date
  updatedAt: Date
  deletedAt: Date | null
  properties: Record<FieldContentName, PropertyValue[]>
  supertags: { id: string; content: string; systemId: string | null }[]
}

/**
 * A single property value attached to a node
 */
// PropertyValue.value is parsed JSON (node_properties.value TEXT column).
// Precise typing matters: server functions serialize AssembledNode over the
// wire, and TanStack Start's serialization types reject `unknown`.
import type { JsonValue } from './common.js'

export interface PropertyValue {
  value: JsonValue
  rawValue: string
  fieldNodeId: string
  fieldName: string
  fieldSystemId: string | null
  order: number
}

/**
 * Options for creating a new node
 */
export interface CreateNodeOptions {
  content: string
  systemId?: string
  ownerId?: string
  supertagId?: string // Supertag id (UUID) or systemId (e.g., 'supertag:note', 'supertag:task')
}

/**
 * One property entry in a BulkNodeSpec. Repeating the same fieldSystemId
 * with distinct `order` values produces a multi-value property.
 */
export interface BulkPropertySpec {
  fieldSystemId: string
  value: unknown
  order?: number
}

/**
 * Declarative node spec for NodeBackend.createNodesBulk().
 *
 * The caller allocates `id` up front (generateNodeId()), so specs can
 * reference each other freely before any write happens: `ownerId` may name
 * another spec's id, and `content` may carry `[[node:<id>]]` mention tokens
 * pointing at nodes created in the same batch.
 *
 * Ordering contract: a spec that DEFINES a supertag or field (systemId +
 * the #Supertag/#Field meta tag) must appear before any spec that consumes
 * that systemId in `supertagSystemIds`/`properties`.
 */
export interface BulkNodeSpec {
  /** Caller-allocated node UUID (generateNodeId()). */
  id: string
  content: string
  systemId?: string
  /** Parent node id — an existing node or another spec's id in this batch. */
  ownerId?: string
  /** Supertags to attach, by systemId. */
  supertagSystemIds?: string[]
  properties?: BulkPropertySpec[]
  /** Original timestamps (imports). Defaults to write time. */
  createdAt?: Date
  updatedAt?: Date
}

// SavedQuery is defined in query.ts — re-exported through the barrel
