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
export interface PropertyValue {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any
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
 * A saved query with its definition and metadata
 */
export interface SavedQuery {
  id: string
  content: string
  definition: import('./query.js').QueryDefinition
  resultCache?: string[]
  evaluatedAt?: Date
  createdAt: Date
  updatedAt: Date
}
