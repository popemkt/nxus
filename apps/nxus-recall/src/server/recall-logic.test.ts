import { describe, it, expect, vi } from 'vitest'
import type { FieldContentName } from '@nxus/db'
import type { AssembledNode, PropertyValue } from '@nxus/db'

// Mock @nxus/db/server — re-implement getProperty/getPropertyValues as pure lookups
// (the real implementations are the same logic, but we can't import them due to sqlite deps)
vi.mock('@nxus/db/server', async () => {
  const actual = await vi.importActual<typeof import('@nxus/db')>('@nxus/db')

  function getProperty<T = unknown>(
    node: AssembledNode,
    fieldName: FieldContentName,
  ): T | undefined {
    const props = node.properties[fieldName]
    if (!props || props.length === 0) return undefined
    return props[0]!.value as T
  }

  function getPropertyValues<T = unknown>(
    node: AssembledNode,
    fieldName: FieldContentName,
  ): T[] {
    const props = node.properties[fieldName]
    if (!props) return []
    return props
      .sort((a: PropertyValue, b: PropertyValue) => a.order - b.order)
      .map((p: PropertyValue) => p.value as T)
  }

  return {
    ...actual,
    getProperty,
    getPropertyValues,
  }
})

import {
  nodeToRecallTopic,
  nodeToRecallConcept,
  nodeToReviewLog,
  recallCardToFsrsCard,
  fsrsCardToProperties,
  createEmptyRecallCard,
} from './recall-logic.js'
import { FIELD_NAMES, SYSTEM_FIELDS } from '@nxus/db'

// ============================================================================
// Test Helpers
// ============================================================================

function makeProp(fieldName: string, value: unknown): PropertyValue {
  return {
    value,
    rawValue: String(value),
    fieldNodeId: `field-node-${fieldName}`,
    fieldName,
    fieldSystemId: null,
    order: 0,
  }
}

function makeNode(overrides: Partial<AssembledNode> = {}): AssembledNode {
  return {
    id: 'node-1',
    content: null,
    systemId: null,
    ownerId: null,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-01T00:00:00Z'),
    deletedAt: null,
    properties: {} as AssembledNode['properties'],
    supertags: [],
    ...overrides,
  }
}

function withProperties(
  node: AssembledNode,
  props: Record<string, unknown>,
): AssembledNode {
  const properties = { ...node.properties } as Record<FieldContentName, PropertyValue[]>
  for (const [key, value] of Object.entries(props)) {
    properties[key as FieldContentName] = [makeProp(key, value)]
  }
  return { ...node, properties }
}

// ============================================================================
// nodeToRecallTopic
// ============================================================================

describe('nodeToRecallTopic', () => {
  it('converts a topic node with counts', () => {
    const node = makeNode({
      id: 'topic-1',
      content: 'Distributed Systems',
    })

    const topic = nodeToRecallTopic(node, 5, 2)

    expect(topic).toEqual({
      id: 'topic-1',
      name: 'Distributed Systems',
      description: undefined,
      conceptCount: 5,
      dueCount: 2,
    })
  })

  it('defaults name to "Untitled Topic" when content is null', () => {
    const node = makeNode({ content: null })
    const topic = nodeToRecallTopic(node, 0, 0)
    expect(topic.name).toBe('Untitled Topic')
  })

  it('includes description when present', () => {
    const node = withProperties(
      makeNode({ content: 'ML' }),
      { [FIELD_NAMES.DESCRIPTION as string]: 'Machine Learning fundamentals' },
    )
    const topic = nodeToRecallTopic(node, 3, 1)
    expect(topic.description).toBe('Machine Learning fundamentals')
  })
})

// ============================================================================
// nodeToRecallConcept
// ============================================================================

describe('nodeToRecallConcept', () => {
  it('converts a concept node with full properties', () => {
    const now = new Date('2026-03-01T10:00:00Z')
    const node = withProperties(
      makeNode({
        id: 'concept-1',
        content: 'CAP Theorem',
        ownerId: 'topic-1',
      }),
      {
        [FIELD_NAMES.RECALL_SUMMARY as string]: 'Consistency, Availability, Partition tolerance',
        [FIELD_NAMES.RECALL_WHY_IT_MATTERS as string]: 'Fundamental trade-off in distributed systems',
        [FIELD_NAMES.RECALL_BLOOMS_LEVEL as string]: 'apply',
        [FIELD_NAMES.RECALL_SOURCE as string]: 'DDIA Chapter 5',
        [FIELD_NAMES.RECALL_DUE as string]: now.toISOString(),
        [FIELD_NAMES.RECALL_STATE as string]: 2,
        [FIELD_NAMES.RECALL_REPS as string]: 3,
        [FIELD_NAMES.RECALL_LAPSES as string]: 1,
        [FIELD_NAMES.RECALL_STABILITY as string]: 4.5,
        [FIELD_NAMES.RECALL_DIFFICULTY as string]: 5.8,
        [FIELD_NAMES.RECALL_ELAPSED_DAYS as string]: 3,
        [FIELD_NAMES.RECALL_SCHEDULED_DAYS as string]: 4,
        [FIELD_NAMES.RECALL_LAST_REVIEW as string]: '2026-02-28T10:00:00Z',
      },
    )

    const concept = nodeToRecallConcept(node, 'Distributed Systems')

    expect(concept.id).toBe('concept-1')
    expect(concept.topicId).toBe('topic-1')
    expect(concept.topicName).toBe('Distributed Systems')
    expect(concept.title).toBe('CAP Theorem')
    expect(concept.summary).toBe('Consistency, Availability, Partition tolerance')
    expect(concept.whyItMatters).toBe('Fundamental trade-off in distributed systems')
    expect(concept.bloomsLevel).toBe('apply')
    expect(concept.source).toBe('DDIA Chapter 5')
    expect(concept.card.due).toBe(now.toISOString())
    expect(concept.card.state).toBe(2)
    expect(concept.card.reps).toBe(3)
    expect(concept.card.lapses).toBe(1)
    expect(concept.card.stability).toBe(4.5)
    expect(concept.card.difficulty).toBe(5.8)
    expect(concept.card.elapsedDays).toBe(3)
    expect(concept.card.scheduledDays).toBe(4)
    expect(concept.card.lastReview).toBe('2026-02-28T10:00:00Z')
  })

  it('defaults missing FSRS properties to zero/initial values', () => {
    const node = makeNode({
      id: 'concept-2',
      content: 'New Concept',
      ownerId: 'topic-1',
    })

    const concept = nodeToRecallConcept(node, 'Topic')

    expect(concept.card.state).toBe(0) // New
    expect(concept.card.reps).toBe(0)
    expect(concept.card.lapses).toBe(0)
    expect(concept.card.stability).toBe(0)
    expect(concept.card.difficulty).toBe(0)
    expect(concept.card.lastReview).toBeUndefined()
  })
})

// ============================================================================
// nodeToReviewLog
// ============================================================================

describe('nodeToReviewLog', () => {
  it('converts a review log node', () => {
    const node = withProperties(
      makeNode({
        id: 'log-1',
        ownerId: 'concept-1',
        createdAt: new Date('2026-03-01T10:00:00Z'),
      }),
      {
        [FIELD_NAMES.RECALL_QUESTION_TEXT as string]: 'Explain the CAP theorem',
        [FIELD_NAMES.RECALL_QUESTION_TYPE as string]: 'apply',
        [FIELD_NAMES.RECALL_USER_ANSWER as string]: 'It says you can only have 2 of 3...',
        [FIELD_NAMES.RECALL_AI_FEEDBACK as string]: 'Good start, but...',
        [FIELD_NAMES.RECALL_RATING as string]: 3,
      },
    )

    const log = nodeToReviewLog(node)

    expect(log.id).toBe('log-1')
    expect(log.conceptId).toBe('concept-1')
    expect(log.questionText).toBe('Explain the CAP theorem')
    expect(log.questionType).toBe('apply')
    expect(log.userAnswer).toBe('It says you can only have 2 of 3...')
    expect(log.aiFeedback).toBe('Good start, but...')
    expect(log.rating).toBe(3)
    expect(log.reviewedAt).toBe('2026-03-01T10:00:00.000Z')
  })
})

// ============================================================================
// recallCardToFsrsCard and fsrsCardToProperties (round-trip)
// ============================================================================

describe('recallCardToFsrsCard', () => {
  it('converts RecallCard to ts-fsrs Card', () => {
    const recallCard = {
      due: '2026-03-05T00:00:00.000Z',
      state: 2 as const,
      reps: 3,
      lapses: 1,
      stability: 4.5,
      difficulty: 5.8,
      elapsedDays: 3,
      scheduledDays: 4,
      lastReview: '2026-03-01T10:00:00.000Z',
    }

    const fsrsCard = recallCardToFsrsCard(recallCard)

    expect(fsrsCard.due).toEqual(new Date('2026-03-05T00:00:00.000Z'))
    expect(fsrsCard.state).toBe(2)
    expect(fsrsCard.reps).toBe(3)
    expect(fsrsCard.lapses).toBe(1)
    expect(fsrsCard.stability).toBe(4.5)
    expect(fsrsCard.difficulty).toBe(5.8)
    expect(fsrsCard.elapsed_days).toBe(3)
    expect(fsrsCard.scheduled_days).toBe(4)
    expect(fsrsCard.last_review).toEqual(new Date('2026-03-01T10:00:00.000Z'))
  })

  it('handles undefined lastReview', () => {
    const recallCard = {
      due: '2026-03-05T00:00:00.000Z',
      state: 0 as const,
      reps: 0,
      lapses: 0,
      stability: 0,
      difficulty: 0,
      elapsedDays: 0,
      scheduledDays: 0,
    }

    const fsrsCard = recallCardToFsrsCard(recallCard)
    expect(fsrsCard.last_review).toBeUndefined()
  })
})

describe('fsrsCardToProperties', () => {
  it('converts ts-fsrs Card to property entries', () => {
    const card = {
      due: new Date('2026-03-05T00:00:00.000Z'),
      state: 2,
      reps: 3,
      lapses: 1,
      stability: 4.5,
      difficulty: 5.8,
      elapsed_days: 3,
      scheduled_days: 4,
      last_review: new Date('2026-03-01T10:00:00.000Z'),
    }

    const props = fsrsCardToProperties(card as import('ts-fsrs').Card)

    // Convert to a map for easier assertion
    const propMap = new Map(props)

    expect(propMap.get(SYSTEM_FIELDS.RECALL_DUE)).toBe('2026-03-05T00:00:00.000Z')
    expect(propMap.get(SYSTEM_FIELDS.RECALL_STABILITY)).toBe(4.5)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_DIFFICULTY)).toBe(5.8)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_ELAPSED_DAYS)).toBe(3)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_SCHEDULED_DAYS)).toBe(4)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_REPS)).toBe(3)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_LAPSES)).toBe(1)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_STATE)).toBe(2)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_LAST_REVIEW)).toBe('2026-03-01T10:00:00.000Z')
  })
})

// ============================================================================
// Round-trip: RecallCard -> ts-fsrs Card -> properties -> conceptNode -> RecallCard
// ============================================================================

describe('round-trip conversion', () => {
  it('preserves data through RecallCard -> ts-fsrs Card -> properties', () => {
    const original = {
      due: '2026-03-05T00:00:00.000Z',
      state: 2 as const,
      reps: 3,
      lapses: 1,
      stability: 4.5,
      difficulty: 5.8,
      elapsedDays: 3,
      scheduledDays: 4,
      lastReview: '2026-03-01T10:00:00.000Z',
    }

    // RecallCard -> ts-fsrs Card
    const fsrsCard = recallCardToFsrsCard(original)

    // ts-fsrs Card -> properties
    const props = fsrsCardToProperties(fsrsCard)
    const propMap = new Map(props)

    // Verify key values survived the round-trip
    expect(propMap.get(SYSTEM_FIELDS.RECALL_DUE)).toBe(original.due)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_STATE)).toBe(original.state)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_REPS)).toBe(original.reps)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_LAPSES)).toBe(original.lapses)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_STABILITY)).toBe(original.stability)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_DIFFICULTY)).toBe(original.difficulty)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_ELAPSED_DAYS)).toBe(original.elapsedDays)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_SCHEDULED_DAYS)).toBe(original.scheduledDays)
    expect(propMap.get(SYSTEM_FIELDS.RECALL_LAST_REVIEW)).toBe(original.lastReview)
  })
})

// ============================================================================
// createEmptyRecallCard
// ============================================================================

describe('createEmptyRecallCard', () => {
  it('creates a valid default card with state=New and due=now', () => {
    const now = new Date('2026-03-01T00:00:00Z')
    const card = createEmptyRecallCard(now)

    expect(card.state).toBe(0) // New
    expect(card.due).toBe(now.toISOString())
    expect(card.reps).toBe(0)
    expect(card.lapses).toBe(0)
    expect(card.stability).toBe(0)
    expect(card.difficulty).toBe(0)
    expect(card.elapsedDays).toBe(0)
    expect(card.scheduledDays).toBe(0)
  })

  it('uses current time when no argument provided', () => {
    const before = new Date()
    const card = createEmptyRecallCard()
    const after = new Date()

    const dueDate = new Date(card.due)
    expect(dueDate.getTime()).toBeGreaterThanOrEqual(before.getTime())
    expect(dueDate.getTime()).toBeLessThanOrEqual(after.getTime())
  })
})
