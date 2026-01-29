/**
 * dependency-tracker.test.ts - Unit tests for the dependency tracker
 *
 * Tests the smart invalidation dependency tracking system:
 * - Extracting dependencies from query filters
 * - Mapping mutations to affected subscriptions
 * - Reverse index lookups for efficient invalidation
 */

import { describe, it, expect, beforeEach } from 'vitest'
import {
  createDependencyTracker,
  extractFilterDependencies,
  extractQueryDependencies,
  getMutationAffectedDependencies,
  DEPENDENCY_MARKERS,
  type DependencyTracker,
} from '../dependency-tracker.js'
import type { QueryDefinition, QueryFilter } from '../../types/query.js'
import type { MutationEvent } from '../types.js'

// ============================================================================
// Test Setup
// ============================================================================

let tracker: DependencyTracker

beforeEach(() => {
  tracker = createDependencyTracker()
})

// ============================================================================
// extractFilterDependencies Tests
// ============================================================================

describe('extractFilterDependencies', () => {
  describe('supertag filter', () => {
    it('should extract supertag dependency', () => {
      const filter: QueryFilter = {
        type: 'supertag',
        supertagSystemId: 'supertag:task',
        includeInherited: true,
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has('supertag:supertag:task')).toBe(true)
    })

    it('should also depend on field:supertag', () => {
      const filter: QueryFilter = {
        type: 'supertag',
        supertagSystemId: 'supertag:task',
        includeInherited: true,
      }

      const deps = extractFilterDependencies(filter)

      // Supertag filters depend on field:supertag because createNode
      // sets supertags via setProperty which emits property:set
      expect(deps.has('field:supertag')).toBe(true)
    })

    it('should include ANY_SUPERTAG marker for inherited queries', () => {
      const filter: QueryFilter = {
        type: 'supertag',
        supertagSystemId: 'supertag:task',
        includeInherited: true,
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has(DEPENDENCY_MARKERS.ANY_SUPERTAG)).toBe(true)
    })

    it('should not include ANY_SUPERTAG when includeInherited is false', () => {
      const filter: QueryFilter = {
        type: 'supertag',
        supertagSystemId: 'supertag:task',
        includeInherited: false,
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has(DEPENDENCY_MARKERS.ANY_SUPERTAG)).toBe(false)
    })
  })

  describe('property filter', () => {
    it('should extract fieldSystemId dependency', () => {
      const filter: QueryFilter = {
        type: 'property',
        fieldSystemId: 'field:status',
        op: 'eq',
        value: 'done',
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has('field:status')).toBe(true)
    })

    it('should work with different operators', () => {
      const filter: QueryFilter = {
        type: 'property',
        fieldSystemId: 'field:priority',
        op: 'gt',
        value: 5,
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has('field:priority')).toBe(true)
    })
  })

  describe('content filter', () => {
    it('should extract CONTENT marker', () => {
      const filter: QueryFilter = {
        type: 'content',
        query: 'search term',
        caseSensitive: false,
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has(DEPENDENCY_MARKERS.CONTENT)).toBe(true)
    })
  })

  describe('relation filter', () => {
    it('should extract OWNER marker for childOf relation', () => {
      const filter: QueryFilter = {
        type: 'relation',
        relationType: 'childOf',
        targetNodeId: 'some-node-id',
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has(DEPENDENCY_MARKERS.OWNER)).toBe(true)
    })

    it('should extract OWNER marker for ownedBy relation', () => {
      const filter: QueryFilter = {
        type: 'relation',
        relationType: 'ownedBy',
        targetNodeId: 'some-node-id',
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has(DEPENDENCY_MARKERS.OWNER)).toBe(true)
    })

    it('should extract fieldSystemId for linksTo with specific field', () => {
      const filter: QueryFilter = {
        type: 'relation',
        relationType: 'linksTo',
        fieldSystemId: 'field:assignee',
        targetNodeId: 'user-node-id',
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has('field:assignee')).toBe(true)
    })

    it('should include NODE_MEMBERSHIP for linksTo without specific field', () => {
      const filter: QueryFilter = {
        type: 'relation',
        relationType: 'linksTo',
        targetNodeId: 'target-node-id',
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)).toBe(true)
    })
  })

  describe('temporal filter', () => {
    it('should extract CREATED_AT marker for createdAt field', () => {
      const filter: QueryFilter = {
        type: 'temporal',
        field: 'createdAt',
        op: 'within',
        days: 7,
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has(DEPENDENCY_MARKERS.CREATED_AT)).toBe(true)
    })

    it('should extract UPDATED_AT marker for updatedAt field', () => {
      const filter: QueryFilter = {
        type: 'temporal',
        field: 'updatedAt',
        op: 'after',
        date: '2024-01-01',
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has(DEPENDENCY_MARKERS.UPDATED_AT)).toBe(true)
    })
  })

  describe('hasField filter', () => {
    it('should extract fieldSystemId dependency', () => {
      const filter: QueryFilter = {
        type: 'hasField',
        fieldSystemId: 'field:description',
        negate: false,
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has('field:description')).toBe(true)
    })

    it('should work with negated filter', () => {
      const filter: QueryFilter = {
        type: 'hasField',
        fieldSystemId: 'field:archived',
        negate: true,
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has('field:archived')).toBe(true)
    })
  })

  describe('logical filters', () => {
    it('should extract dependencies from AND children', () => {
      const filter: QueryFilter = {
        type: 'and',
        filters: [
          { type: 'supertag', supertagSystemId: 'supertag:task', includeInherited: true },
          { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' },
        ],
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has('supertag:supertag:task')).toBe(true)
      expect(deps.has('field:status')).toBe(true)
    })

    it('should extract dependencies from OR children', () => {
      const filter: QueryFilter = {
        type: 'or',
        filters: [
          { type: 'property', fieldSystemId: 'field:priority', op: 'eq', value: 'high' },
          { type: 'property', fieldSystemId: 'field:urgent', op: 'eq', value: true },
        ],
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has('field:priority')).toBe(true)
      expect(deps.has('field:urgent')).toBe(true)
    })

    it('should extract dependencies from NOT children', () => {
      const filter: QueryFilter = {
        type: 'not',
        filters: [
          { type: 'property', fieldSystemId: 'field:archived', op: 'eq', value: true },
        ],
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has('field:archived')).toBe(true)
    })

    it('should handle nested logical filters', () => {
      const filter: QueryFilter = {
        type: 'and',
        filters: [
          { type: 'supertag', supertagSystemId: 'supertag:project', includeInherited: true },
          {
            type: 'or',
            filters: [
              { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'active' },
              { type: 'property', fieldSystemId: 'field:priority', op: 'gt', value: 5 },
            ],
          },
        ],
      }

      const deps = extractFilterDependencies(filter)

      expect(deps.has('supertag:supertag:project')).toBe(true)
      expect(deps.has('field:status')).toBe(true)
      expect(deps.has('field:priority')).toBe(true)
    })
  })
})

// ============================================================================
// extractQueryDependencies Tests
// ============================================================================

describe('extractQueryDependencies', () => {
  it('should always include NODE_MEMBERSHIP', () => {
    const query: QueryDefinition = {
      filters: [],
    }

    const deps = extractQueryDependencies(query)

    expect(deps.has(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)).toBe(true)
  })

  it('should combine dependencies from all filters', () => {
    const query: QueryDefinition = {
      filters: [
        { type: 'supertag', supertagSystemId: 'supertag:task', includeInherited: true },
        { type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'pending' },
        { type: 'content', query: 'urgent', caseSensitive: false },
      ],
    }

    const deps = extractQueryDependencies(query)

    expect(deps.has(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)).toBe(true)
    expect(deps.has('supertag:supertag:task')).toBe(true)
    expect(deps.has('field:status')).toBe(true)
    expect(deps.has(DEPENDENCY_MARKERS.CONTENT)).toBe(true)
  })

  it('should include sort field as dependency', () => {
    const query: QueryDefinition = {
      filters: [{ type: 'supertag', supertagSystemId: 'supertag:task', includeInherited: true }],
      sort: { field: 'field:dueDate', direction: 'asc' },
    }

    const deps = extractQueryDependencies(query)

    expect(deps.has('field:dueDate')).toBe(true)
  })

  it('should handle content sort field', () => {
    const query: QueryDefinition = {
      filters: [],
      sort: { field: 'content', direction: 'asc' },
    }

    const deps = extractQueryDependencies(query)

    expect(deps.has(DEPENDENCY_MARKERS.CONTENT)).toBe(true)
  })

  it('should handle createdAt sort field', () => {
    const query: QueryDefinition = {
      filters: [],
      sort: { field: 'createdAt', direction: 'desc' },
    }

    const deps = extractQueryDependencies(query)

    expect(deps.has(DEPENDENCY_MARKERS.CREATED_AT)).toBe(true)
  })

  it('should handle updatedAt sort field', () => {
    const query: QueryDefinition = {
      filters: [],
      sort: { field: 'updatedAt', direction: 'desc' },
    }

    const deps = extractQueryDependencies(query)

    expect(deps.has(DEPENDENCY_MARKERS.UPDATED_AT)).toBe(true)
  })
})

// ============================================================================
// getMutationAffectedDependencies Tests
// ============================================================================

describe('getMutationAffectedDependencies', () => {
  describe('node membership events', () => {
    it('should include NODE_MEMBERSHIP for node:created', () => {
      const event: MutationEvent = {
        type: 'node:created',
        timestamp: new Date(),
        nodeId: 'new-node-id',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)).toBe(true)
    })

    it('should include NODE_MEMBERSHIP for node:deleted', () => {
      const event: MutationEvent = {
        type: 'node:deleted',
        timestamp: new Date(),
        nodeId: 'deleted-node-id',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)).toBe(true)
    })

    it('should include ANY_SUPERTAG for node creation', () => {
      const event: MutationEvent = {
        type: 'node:created',
        timestamp: new Date(),
        nodeId: 'new-node-id',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has(DEPENDENCY_MARKERS.ANY_SUPERTAG)).toBe(true)
    })
  })

  describe('content update events', () => {
    it('should include CONTENT for node:updated', () => {
      const event: MutationEvent = {
        type: 'node:updated',
        timestamp: new Date(),
        nodeId: 'updated-node-id',
        beforeValue: 'old content',
        afterValue: 'new content',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has(DEPENDENCY_MARKERS.CONTENT)).toBe(true)
    })

    it('should include UPDATED_AT for node:updated', () => {
      const event: MutationEvent = {
        type: 'node:updated',
        timestamp: new Date(),
        nodeId: 'updated-node-id',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has(DEPENDENCY_MARKERS.UPDATED_AT)).toBe(true)
    })
  })

  describe('property events', () => {
    it('should include fieldSystemId for property:set', () => {
      const event: MutationEvent = {
        type: 'property:set',
        timestamp: new Date(),
        nodeId: 'node-id',
        fieldSystemId: 'field:status',
        afterValue: 'done',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has('field:status')).toBe(true)
    })

    it('should include fieldSystemId for property:added', () => {
      const event: MutationEvent = {
        type: 'property:added',
        timestamp: new Date(),
        nodeId: 'node-id',
        fieldSystemId: 'field:tags',
        afterValue: 'important',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has('field:tags')).toBe(true)
    })

    it('should include fieldSystemId for property:removed', () => {
      const event: MutationEvent = {
        type: 'property:removed',
        timestamp: new Date(),
        nodeId: 'node-id',
        fieldSystemId: 'field:assignee',
        beforeValue: 'user-123',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has('field:assignee')).toBe(true)
    })

    it('should include UPDATED_AT for property events', () => {
      const event: MutationEvent = {
        type: 'property:set',
        timestamp: new Date(),
        nodeId: 'node-id',
        fieldSystemId: 'field:status',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has(DEPENDENCY_MARKERS.UPDATED_AT)).toBe(true)
    })
  })

  describe('supertag events', () => {
    it('should include supertag:systemId for supertag:added', () => {
      const event: MutationEvent = {
        type: 'supertag:added',
        timestamp: new Date(),
        nodeId: 'node-id',
        supertagSystemId: 'supertag:task',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has('supertag:supertag:task')).toBe(true)
    })

    it('should include supertag:systemId for supertag:removed', () => {
      const event: MutationEvent = {
        type: 'supertag:removed',
        timestamp: new Date(),
        nodeId: 'node-id',
        supertagSystemId: 'supertag:project',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has('supertag:supertag:project')).toBe(true)
    })

    it('should include ANY_SUPERTAG for supertag events', () => {
      const event: MutationEvent = {
        type: 'supertag:added',
        timestamp: new Date(),
        nodeId: 'node-id',
        supertagSystemId: 'supertag:task',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has(DEPENDENCY_MARKERS.ANY_SUPERTAG)).toBe(true)
    })

    it('should include UPDATED_AT for supertag events', () => {
      const event: MutationEvent = {
        type: 'supertag:added',
        timestamp: new Date(),
        nodeId: 'node-id',
        supertagSystemId: 'supertag:task',
      }

      const affected = getMutationAffectedDependencies(event)

      expect(affected.has(DEPENDENCY_MARKERS.UPDATED_AT)).toBe(true)
    })
  })
})

// ============================================================================
// DependencyTracker Tests
// ============================================================================

describe('DependencyTracker', () => {
  describe('register()', () => {
    it('should register a subscription and track its dependencies', () => {
      const query: QueryDefinition = {
        filters: [
          { type: 'supertag', supertagSystemId: 'supertag:task', includeInherited: true },
        ],
      }

      tracker.register('sub-1', query)

      const deps = tracker.getDependencies('sub-1')
      expect(deps).toBeDefined()
      expect(deps!.has('supertag:supertag:task')).toBe(true)
    })

    it('should update dependencies when re-registering', () => {
      const query1: QueryDefinition = {
        filters: [{ type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'a' }],
      }
      const query2: QueryDefinition = {
        filters: [{ type: 'property', fieldSystemId: 'field:priority', op: 'eq', value: 'b' }],
      }

      tracker.register('sub-1', query1)
      tracker.register('sub-1', query2)

      const deps = tracker.getDependencies('sub-1')
      expect(deps!.has('field:priority')).toBe(true)
      // Old dependency should be removed
      expect(deps!.has('field:status')).toBe(false)
    })

    it('should track subscription count', () => {
      const query: QueryDefinition = { filters: [] }

      expect(tracker.size()).toBe(0)
      tracker.register('sub-1', query)
      expect(tracker.size()).toBe(1)
      tracker.register('sub-2', query)
      expect(tracker.size()).toBe(2)
    })
  })

  describe('unregister()', () => {
    it('should remove subscription from tracking', () => {
      const query: QueryDefinition = {
        filters: [{ type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'a' }],
      }

      tracker.register('sub-1', query)
      tracker.unregister('sub-1')

      expect(tracker.getDependencies('sub-1')).toBeUndefined()
      expect(tracker.size()).toBe(0)
    })

    it('should handle unregistering non-existent subscription', () => {
      expect(() => tracker.unregister('non-existent')).not.toThrow()
    })
  })

  describe('getAffectedSubscriptions()', () => {
    beforeEach(() => {
      // Register several subscriptions with different dependencies
      tracker.register('task-query', {
        filters: [{ type: 'supertag', supertagSystemId: 'supertag:task', includeInherited: true }],
      })
      tracker.register('status-query', {
        filters: [{ type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'done' }],
      })
      tracker.register('content-query', {
        filters: [{ type: 'content', query: 'urgent', caseSensitive: false }],
      })
    })

    it('should return all subscriptions for node:created', () => {
      const event: MutationEvent = {
        type: 'node:created',
        timestamp: new Date(),
        nodeId: 'new-node',
      }

      const result = tracker.getAffectedSubscriptions(event)

      expect(result.affectsAll).toBe(true)
      expect(result.affectedIds.has('task-query')).toBe(true)
      expect(result.affectedIds.has('status-query')).toBe(true)
      expect(result.affectedIds.has('content-query')).toBe(true)
    })

    it('should return all subscriptions for node:deleted', () => {
      const event: MutationEvent = {
        type: 'node:deleted',
        timestamp: new Date(),
        nodeId: 'deleted-node',
      }

      const result = tracker.getAffectedSubscriptions(event)

      expect(result.affectsAll).toBe(true)
      expect(result.affectedIds.size).toBe(3)
    })

    it('should return only status-query for field:status property change', () => {
      const event: MutationEvent = {
        type: 'property:set',
        timestamp: new Date(),
        nodeId: 'some-node',
        fieldSystemId: 'field:status',
        afterValue: 'pending',
      }

      const result = tracker.getAffectedSubscriptions(event)

      expect(result.affectsAll).toBe(false)
      expect(result.affectedIds.has('status-query')).toBe(true)
      expect(result.affectedIds.has('task-query')).toBe(false)
      expect(result.affectedIds.has('content-query')).toBe(false)
    })

    it('should return only content-query for node:updated', () => {
      const event: MutationEvent = {
        type: 'node:updated',
        timestamp: new Date(),
        nodeId: 'some-node',
        beforeValue: 'old',
        afterValue: 'new',
      }

      const result = tracker.getAffectedSubscriptions(event)

      expect(result.affectsAll).toBe(false)
      expect(result.affectedIds.has('content-query')).toBe(true)
      expect(result.affectedIds.has('task-query')).toBe(false)
      expect(result.affectedIds.has('status-query')).toBe(false)
    })

    it('should return task-query for supertag:added with matching supertag', () => {
      const event: MutationEvent = {
        type: 'supertag:added',
        timestamp: new Date(),
        nodeId: 'some-node',
        supertagSystemId: 'supertag:task',
      }

      const result = tracker.getAffectedSubscriptions(event)

      expect(result.affectsAll).toBe(false)
      expect(result.affectedIds.has('task-query')).toBe(true)
    })

    it('should return empty set for unrelated property change', () => {
      const event: MutationEvent = {
        type: 'property:set',
        timestamp: new Date(),
        nodeId: 'some-node',
        fieldSystemId: 'field:unrelated',
        afterValue: 'value',
      }

      const result = tracker.getAffectedSubscriptions(event)

      expect(result.affectsAll).toBe(false)
      expect(result.affectedIds.size).toBe(0)
    })

    it('should return task-query for field:supertag property change', () => {
      // When a supertag is set via setProperty (as createNode does),
      // the task-query should be affected because it depends on field:supertag
      const event: MutationEvent = {
        type: 'property:set',
        timestamp: new Date(),
        nodeId: 'some-node',
        fieldSystemId: 'field:supertag',
        afterValue: 'supertag-node-id',
      }

      const result = tracker.getAffectedSubscriptions(event)

      expect(result.affectedIds.has('task-query')).toBe(true)
    })
  })

  describe('getSubscriptionIds()', () => {
    it('should return all registered subscription IDs', () => {
      tracker.register('sub-1', { filters: [] })
      tracker.register('sub-2', { filters: [] })
      tracker.register('sub-3', { filters: [] })

      const ids = tracker.getSubscriptionIds()

      expect(ids).toContain('sub-1')
      expect(ids).toContain('sub-2')
      expect(ids).toContain('sub-3')
      expect(ids.length).toBe(3)
    })
  })

  describe('clear()', () => {
    it('should remove all subscriptions', () => {
      tracker.register('sub-1', { filters: [] })
      tracker.register('sub-2', { filters: [] })

      tracker.clear()

      expect(tracker.size()).toBe(0)
      expect(tracker.getSubscriptionIds()).toEqual([])
    })

    it('should clear reverse index as well', () => {
      tracker.register('sub-1', {
        filters: [{ type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'a' }],
      })

      tracker.clear()

      // Register new subscription and verify it's tracked properly
      tracker.register('sub-2', {
        filters: [{ type: 'property', fieldSystemId: 'field:status', op: 'eq', value: 'b' }],
      })

      const event: MutationEvent = {
        type: 'property:set',
        timestamp: new Date(),
        nodeId: 'node',
        fieldSystemId: 'field:status',
      }

      const result = tracker.getAffectedSubscriptions(event)
      expect(result.affectedIds.has('sub-2')).toBe(true)
      expect(result.affectedIds.has('sub-1')).toBe(false)
    })
  })
})
