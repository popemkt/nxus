/**
 * dependency-tracker.ts - Query-to-field dependency mapping for smart invalidation
 *
 * This module analyzes QueryDefinitions to extract field dependencies,
 * enabling selective re-evaluation of subscriptions based on mutation events.
 *
 * Instead of re-evaluating ALL subscriptions on every mutation (brute force),
 * we track which fields/supertags each subscription depends on and only
 * re-evaluate when a mutation affects those specific dependencies.
 *
 * Dependency types:
 * - FIELD: Property filters depend on specific fieldIds (UUIDs)
 * - SUPERTAG: Supertag filters depend on specific supertagIds (UUIDs)
 * - CONTENT: Content filters depend on node content changes
 * - NODE_MEMBERSHIP: All queries implicitly depend on node creation/deletion
 * - RELATION: Relation filters depend on ownerId or specific link fields
 */

import type { MutationEvent, MutationType } from './types.js'
import type {
  QueryDefinition,
  QueryFilter,
  SupertagFilter,
  PropertyFilter,
  ContentFilter,
  RelationFilter,
  TemporalFilter,
  HasFieldFilter,
  LogicalFilter,
} from '../types/query.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Special dependency markers for non-field dependencies
 */
export const DEPENDENCY_MARKERS = {
  /** Any node content change */
  CONTENT: '__content__',
  /** Node creation/deletion (affects all queries) */
  NODE_MEMBERSHIP: '__node_membership__',
  /** Any supertag change (for queries that filter by supertag) */
  ANY_SUPERTAG: '__any_supertag__',
  /** Owner/parent relationship changes */
  OWNER: '__owner__',
  /** createdAt temporal filter */
  CREATED_AT: '__created_at__',
  /** updatedAt temporal filter */
  UPDATED_AT: '__updated_at__',
} as const

/**
 * Set of field/supertag IDs that a subscription depends on
 * Includes both actual UUIDs and special markers from DEPENDENCY_MARKERS
 */
export type DependencySet = Set<string>

/**
 * Mapping of subscription ID to its dependencies
 */
export type DependencyMap = Map<string, DependencySet>

/**
 * Result of checking if a mutation affects any subscriptions
 */
export interface AffectedSubscriptions {
  /** Subscription IDs that need re-evaluation */
  affectedIds: Set<string>
  /** Whether this mutation potentially affects all subscriptions */
  affectsAll: boolean
}

/**
 * Dependency tracker interface
 */
export interface DependencyTracker {
  /**
   * Extract and register dependencies for a subscription
   * @param subscriptionId - Unique subscription ID
   * @param definition - Query definition to analyze
   */
  register(subscriptionId: string, definition: QueryDefinition): void

  /**
   * Remove a subscription from tracking
   * @param subscriptionId - Subscription ID to remove
   */
  unregister(subscriptionId: string): void

  /**
   * Get the dependencies for a subscription
   * @param subscriptionId - Subscription ID to look up
   * @returns Set of field/marker dependencies, or undefined if not registered
   */
  getDependencies(subscriptionId: string): DependencySet | undefined

  /**
   * Check which subscriptions are affected by a mutation event
   * @param event - Mutation event to check
   * @returns Set of affected subscription IDs
   */
  getAffectedSubscriptions(event: MutationEvent): AffectedSubscriptions

  /**
   * Get all registered subscription IDs
   */
  getSubscriptionIds(): string[]

  /**
   * Get total number of tracked subscriptions
   */
  size(): number

  /**
   * Clear all tracked dependencies
   */
  clear(): void
}

// ============================================================================
// Dependency Extraction
// ============================================================================

/**
 * Extract all field/marker dependencies from a query filter
 * Recursively processes logical filters (and/or/not)
 *
 * @param filter - Query filter to analyze
 * @returns Set of dependencies (fieldIds, supertagIds, and special markers)
 */
export function extractFilterDependencies(filter: QueryFilter): DependencySet {
  const deps = new Set<string>()

  switch (filter.type) {
    case 'supertag': {
      // Supertag filters depend on specific supertag changes
      const supertagFilter = filter as SupertagFilter
      // We use the supertagId (UUID) directly as dependency with supertag: prefix
      deps.add(`supertag:${supertagFilter.supertagId}`)
      // Also add the general supertag marker for any supertag changes
      // (since inheritance might mean other supertags matter too)
      if (supertagFilter.includeInherited !== false) {
        deps.add(DEPENDENCY_MARKERS.ANY_SUPERTAG)
      }
      break
    }

    case 'property': {
      // Property filters depend on specific field changes
      const propFilter = filter as PropertyFilter
      deps.add(propFilter.fieldId)
      break
    }

    case 'content': {
      // Content filters depend on content changes
      deps.add(DEPENDENCY_MARKERS.CONTENT)
      break
    }

    case 'relation': {
      // Relation filters depend on ownership or link fields
      const relFilter = filter as RelationFilter
      if (
        relFilter.relationType === 'childOf' ||
        relFilter.relationType === 'ownedBy'
      ) {
        deps.add(DEPENDENCY_MARKERS.OWNER)
      }
      if (relFilter.fieldId) {
        deps.add(relFilter.fieldId)
      }
      // For linksTo/linkedFrom without specific field, any property change matters
      if (
        (relFilter.relationType === 'linksTo' ||
          relFilter.relationType === 'linkedFrom') &&
        !relFilter.fieldId
      ) {
        // This is a broad dependency - any property could be a link
        // For now, we'll need to re-evaluate on any property change
        // A more sophisticated approach would track reference-type fields
        deps.add(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)
      }
      break
    }

    case 'temporal': {
      // Temporal filters depend on timestamp changes
      const tempFilter = filter as TemporalFilter
      if (tempFilter.field === 'createdAt') {
        deps.add(DEPENDENCY_MARKERS.CREATED_AT)
      } else if (tempFilter.field === 'updatedAt') {
        deps.add(DEPENDENCY_MARKERS.UPDATED_AT)
      }
      break
    }

    case 'hasField': {
      // HasField filters depend on specific field presence
      const hasFilter = filter as HasFieldFilter
      deps.add(hasFilter.fieldId)
      break
    }

    case 'and':
    case 'or':
    case 'not': {
      // Logical filters: union of all child dependencies
      const logicalFilter = filter as LogicalFilter
      for (const childFilter of logicalFilter.filters) {
        const childDeps = extractFilterDependencies(childFilter)
        for (const dep of childDeps) {
          deps.add(dep)
        }
      }
      break
    }

    default:
      // Unknown filter type - conservative approach: depend on everything
      deps.add(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)
  }

  return deps
}

/**
 * Extract all dependencies from a query definition
 *
 * @param definition - Query definition to analyze
 * @returns Set of all dependencies for this query
 */
export function extractQueryDependencies(definition: QueryDefinition): DependencySet {
  const deps = new Set<string>()

  // All queries implicitly depend on node membership (creation/deletion)
  deps.add(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)

  // Extract dependencies from each filter
  for (const filter of definition.filters ?? []) {
    const filterDeps = extractFilterDependencies(filter)
    for (const dep of filterDeps) {
      deps.add(dep)
    }
  }

  // Sort field also creates a dependency
  if (definition.sort) {
    const sortField = definition.sort.field
    if (sortField === 'content') {
      deps.add(DEPENDENCY_MARKERS.CONTENT)
    } else if (sortField === 'createdAt') {
      deps.add(DEPENDENCY_MARKERS.CREATED_AT)
    } else if (sortField === 'updatedAt') {
      deps.add(DEPENDENCY_MARKERS.UPDATED_AT)
    } else {
      // Assume it's a fieldId (UUID)
      deps.add(sortField)
    }
  }

  return deps
}

// ============================================================================
// Mutation Matching
// ============================================================================

/**
 * Mutation types that always affect all queries (node membership changes)
 */
const MEMBERSHIP_MUTATION_TYPES: Set<MutationType> = new Set([
  'node:created',
  'node:deleted',
])

/**
 * Determine which dependencies a mutation event affects
 *
 * @param event - Mutation event to analyze
 * @returns Set of affected dependency keys
 */
export function getMutationAffectedDependencies(event: MutationEvent): Set<string> {
  const affected = new Set<string>()

  // Node creation/deletion affects all queries
  if (MEMBERSHIP_MUTATION_TYPES.has(event.type)) {
    affected.add(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)
    // Also potentially affects any supertag queries (new node might have supertags)
    affected.add(DEPENDENCY_MARKERS.ANY_SUPERTAG)
    return affected
  }

  switch (event.type) {
    case 'node:updated':
      // Content update
      affected.add(DEPENDENCY_MARKERS.CONTENT)
      affected.add(DEPENDENCY_MARKERS.UPDATED_AT)
      break

    case 'property:set':
    case 'property:added':
    case 'property:removed':
      // Property change affects the specific field
      // Add both UUID and systemId (if present) for dependency matching
      if (event.fieldId) {
        affected.add(event.fieldId)
      }
      if (event.fieldSystemId) {
        affected.add(event.fieldSystemId)
      }
      affected.add(DEPENDENCY_MARKERS.UPDATED_AT)
      break

    case 'supertag:added':
    case 'supertag:removed':
      // Supertag change affects supertag queries
      if (event.supertagId) {
        affected.add(`supertag:${event.supertagId}`)
      }
      affected.add(DEPENDENCY_MARKERS.ANY_SUPERTAG)
      affected.add(DEPENDENCY_MARKERS.UPDATED_AT)
      break
  }

  return affected
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new dependency tracker instance
 *
 * @returns DependencyTracker instance
 */
export function createDependencyTracker(): DependencyTracker {
  // Map: subscriptionId → Set of dependencies
  const subscriptionDeps: DependencyMap = new Map()

  // Reverse index: dependency → Set of subscriptionIds
  // This allows O(1) lookup of affected subscriptions per dependency
  const dependencyToSubscriptions = new Map<string, Set<string>>()

  /**
   * Add a subscription to the reverse index for a dependency
   */
  function addToReverseIndex(subscriptionId: string, dependency: string): void {
    let subs = dependencyToSubscriptions.get(dependency)
    if (!subs) {
      subs = new Set()
      dependencyToSubscriptions.set(dependency, subs)
    }
    subs.add(subscriptionId)
  }

  /**
   * Remove a subscription from the reverse index
   */
  function removeFromReverseIndex(subscriptionId: string): void {
    const deps = subscriptionDeps.get(subscriptionId)
    if (!deps) return

    for (const dep of deps) {
      const subs = dependencyToSubscriptions.get(dep)
      if (subs) {
        subs.delete(subscriptionId)
        if (subs.size === 0) {
          dependencyToSubscriptions.delete(dep)
        }
      }
    }
  }

  return {
    register(subscriptionId: string, definition: QueryDefinition): void {
      // Remove existing registration if any
      if (subscriptionDeps.has(subscriptionId)) {
        removeFromReverseIndex(subscriptionId)
      }

      // Extract dependencies
      const deps = extractQueryDependencies(definition)
      subscriptionDeps.set(subscriptionId, deps)

      // Build reverse index
      for (const dep of deps) {
        addToReverseIndex(subscriptionId, dep)
      }
    },

    unregister(subscriptionId: string): void {
      removeFromReverseIndex(subscriptionId)
      subscriptionDeps.delete(subscriptionId)
    },

    getDependencies(subscriptionId: string): DependencySet | undefined {
      return subscriptionDeps.get(subscriptionId)
    },

    getAffectedSubscriptions(event: MutationEvent): AffectedSubscriptions {
      const affectedDeps = getMutationAffectedDependencies(event)
      const affectedIds = new Set<string>()
      let affectsAll = false

      // Check if this is a node membership change (affects all)
      if (affectedDeps.has(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)) {
        affectsAll = true
        // Return all subscriptions
        for (const id of subscriptionDeps.keys()) {
          affectedIds.add(id)
        }
        return { affectedIds, affectsAll }
      }

      // Look up affected subscriptions via reverse index
      for (const dep of affectedDeps) {
        const subs = dependencyToSubscriptions.get(dep)
        if (subs) {
          for (const id of subs) {
            affectedIds.add(id)
          }
        }
      }

      return { affectedIds, affectsAll }
    },

    getSubscriptionIds(): string[] {
      return Array.from(subscriptionDeps.keys())
    },

    size(): number {
      return subscriptionDeps.size
    },

    clear(): void {
      subscriptionDeps.clear()
      dependencyToSubscriptions.clear()
    },
  }
}

/**
 * Default singleton instance
 */
export const dependencyTracker = createDependencyTracker()
