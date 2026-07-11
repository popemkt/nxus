/**
 * membership-narrowing.test.ts — node:created/node:deleted invalidation
 * narrowing (spec/tech/reactivity.md).
 *
 * Enriched membership events (carrying ancestor-expanded supertagIds) must
 * invalidate ONLY subscriptions whose filters could match the node;
 * unenriched (legacy) events keep the conservative affects-all behavior.
 */

import { describe, expect, it, beforeEach } from 'vitest'
import {
  createDependencyTracker,
  extractQueryDependencies,
  DEPENDENCY_MARKERS,
} from '../dependency-tracker.js'
import type { MutationEvent } from '../types.js'
import type { QueryDefinition } from '../../types/query.js'

const TAG_X = '019f0000-0000-7000-8000-00000000000x'
const TAG_Y = '019f0000-0000-7000-8000-00000000000y'
const PARENT_TAG = '019f0000-0000-7000-8000-0000000000pa'

function supertagQuery(supertagId: string): QueryDefinition {
  return {
    filters: [{ type: 'supertag', supertagId, includeInherited: true }],
    limit: 100,
  } as QueryDefinition
}

function contentQuery(): QueryDefinition {
  return {
    filters: [{ type: 'content', query: 'hello', caseSensitive: false }],
    limit: 100,
  } as QueryDefinition
}

function createdEvent(supertagIds?: string[]): MutationEvent {
  return {
    type: 'node:created',
    timestamp: new Date(),
    nodeId: '019f0000-0000-7000-8000-0000000000no',
    ...(supertagIds !== undefined ? { supertagIds } : {}),
  }
}

describe('registration narrowing', () => {
  it('supertag-conjunct queries do NOT register the broad membership marker', () => {
    const deps = extractQueryDependencies(supertagQuery(TAG_X))
    expect(deps.has(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)).toBe(false)
    expect(deps.has(`supertag:${TAG_X}`)).toBe(true)
  })

  it('queries without a required supertag conjunct keep the membership marker', () => {
    const deps = extractQueryDependencies(contentQuery())
    expect(deps.has(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)).toBe(true)
  })

  it('OR-rooted supertag filters are not "required" — membership marker kept', () => {
    const deps = extractQueryDependencies({
      filters: [
        {
          type: 'or',
          filters: [
            { type: 'supertag', supertagId: TAG_X, includeInherited: true },
            { type: 'content', query: 'x', caseSensitive: false },
          ],
        },
      ],
      limit: 100,
    } as QueryDefinition)
    expect(deps.has(DEPENDENCY_MARKERS.NODE_MEMBERSHIP)).toBe(true)
  })
})

describe('enriched membership events', () => {
  let tracker: ReturnType<typeof createDependencyTracker>

  beforeEach(() => {
    tracker = createDependencyTracker()
    tracker.register('sub-x', supertagQuery(TAG_X))
    tracker.register('sub-y', supertagQuery(TAG_Y))
    tracker.register('sub-content', contentQuery())
  })

  it('creating a node tagged X invalidates the X subscription, not Y', () => {
    const { affectedIds, affectsAll } = tracker.getAffectedSubscriptions(
      createdEvent([TAG_X]),
    )
    expect(affectsAll).toBe(false)
    expect(affectedIds.has('sub-x')).toBe(true)
    expect(affectedIds.has('sub-y')).toBe(false)
    // content query has the membership dependency — creations can match it
    expect(affectedIds.has('sub-content')).toBe(true)
  })

  it('inheritance: node tagged CHILD invalidates a PARENT subscription via ancestor expansion', () => {
    tracker.register('sub-parent', supertagQuery(PARENT_TAG))
    // Emission-time expansion: the event carries child AND ancestor ids.
    const { affectedIds } = tracker.getAffectedSubscriptions(
      createdEvent([TAG_X, PARENT_TAG]),
    )
    expect(affectedIds.has('sub-parent')).toBe(true)
    expect(affectedIds.has('sub-y')).toBe(false)
  })

  it('untagged node creation (empty enrichment) skips all supertag subscriptions', () => {
    const { affectedIds, affectsAll } = tracker.getAffectedSubscriptions(
      createdEvent([]),
    )
    expect(affectsAll).toBe(false)
    expect(affectedIds.has('sub-x')).toBe(false)
    expect(affectedIds.has('sub-y')).toBe(false)
    expect(affectedIds.has('sub-content')).toBe(true)
  })

  it('node:deleted narrows identically', () => {
    const { affectedIds, affectsAll } = tracker.getAffectedSubscriptions({
      type: 'node:deleted',
      timestamp: new Date(),
      nodeId: 'n1',
      supertagIds: [TAG_Y],
    })
    expect(affectsAll).toBe(false)
    expect(affectedIds.has('sub-y')).toBe(true)
    expect(affectedIds.has('sub-x')).toBe(false)
  })
})

describe('legacy unenriched membership events', () => {
  it('fall back to affects-all (no supertagIds field at all)', () => {
    const tracker = createDependencyTracker()
    tracker.register('sub-x', supertagQuery(TAG_X))
    tracker.register('sub-content', contentQuery())

    const { affectedIds, affectsAll } = tracker.getAffectedSubscriptions(
      createdEvent(undefined),
    )
    expect(affectsAll).toBe(true)
    expect(affectedIds.has('sub-x')).toBe(true)
    expect(affectedIds.has('sub-content')).toBe(true)
  })
})
