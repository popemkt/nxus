/**
 * Pure conversion functions between node-based DB representation
 * and Recall domain types.
 *
 * This module is server-only (imports from @nxus/db/server).
 * No side effects — all functions are pure transformations.
 */

import {
  FIELD_NAMES,
  SYSTEM_FIELDS,
  getProperty,
  getPropertyValues,
  type AssembledNode,
  type FieldSystemId,
} from '@nxus/db/server'
import { createEmptyCard, type Card } from 'ts-fsrs'

import type {
  BloomsLevel,
  FsrsRating,
  FsrsState,
  RecallCard,
  RecallConcept,
  RecallTopic,
  ReviewLog,
} from '../types/recall.js'

// ============================================================================
// Node -> Domain Type Conversions
// ============================================================================

/**
 * Convert a topic node to a RecallTopic.
 * Counts are provided externally since they require additional queries.
 */
export function nodeToRecallTopic(
  node: AssembledNode,
  conceptCount: number,
  dueCount: number,
): RecallTopic {
  return {
    id: node.id,
    name: node.content ?? 'Untitled Topic',
    description: getProperty<string>(node, FIELD_NAMES.DESCRIPTION),
    conceptCount,
    dueCount,
  }
}

/**
 * Convert a concept node to a RecallConcept with its FSRS card state.
 */
export function nodeToRecallConcept(
  node: AssembledNode,
  topicName: string,
): RecallConcept {
  return {
    id: node.id,
    topicId: node.ownerId ?? '',
    topicName,
    title: node.content ?? 'Untitled Concept',
    summary: getProperty<string>(node, FIELD_NAMES.RECALL_SUMMARY) ?? '',
    whyItMatters: getProperty<string>(node, FIELD_NAMES.RECALL_WHY_IT_MATTERS) ?? '',
    bloomsLevel: (getProperty<string>(node, FIELD_NAMES.RECALL_BLOOMS_LEVEL) as BloomsLevel) ?? 'remember',
    source: getProperty<string>(node, FIELD_NAMES.RECALL_SOURCE),
    relatedConceptIds: getPropertyValues<string>(node, FIELD_NAMES.RECALL_RELATED_CONCEPTS),
    card: nodeToRecallCard(node),
  }
}

/**
 * Extract FSRS card state from a concept node's properties.
 */
function nodeToRecallCard(node: AssembledNode): RecallCard {
  const dueStr = getProperty<string>(node, FIELD_NAMES.RECALL_DUE)
  const stateRaw = getProperty<number>(node, FIELD_NAMES.RECALL_STATE)

  return {
    due: dueStr ?? new Date().toISOString(),
    state: (typeof stateRaw === 'number' ? stateRaw : 0) as FsrsState,
    reps: getProperty<number>(node, FIELD_NAMES.RECALL_REPS) ?? 0,
    lapses: getProperty<number>(node, FIELD_NAMES.RECALL_LAPSES) ?? 0,
    stability: getProperty<number>(node, FIELD_NAMES.RECALL_STABILITY) ?? 0,
    difficulty: getProperty<number>(node, FIELD_NAMES.RECALL_DIFFICULTY) ?? 0,
    elapsedDays: getProperty<number>(node, FIELD_NAMES.RECALL_ELAPSED_DAYS) ?? 0,
    scheduledDays: getProperty<number>(node, FIELD_NAMES.RECALL_SCHEDULED_DAYS) ?? 0,
    lastReview: getProperty<string>(node, FIELD_NAMES.RECALL_LAST_REVIEW),
  }
}

/**
 * Convert a review log node to a ReviewLog.
 */
export function nodeToReviewLog(node: AssembledNode): ReviewLog {
  return {
    id: node.id,
    conceptId: node.ownerId ?? '',
    questionText: getProperty<string>(node, FIELD_NAMES.RECALL_QUESTION_TEXT) ?? '',
    questionType: getProperty<string>(node, FIELD_NAMES.RECALL_QUESTION_TYPE) ?? '',
    userAnswer: getProperty<string>(node, FIELD_NAMES.RECALL_USER_ANSWER) ?? '',
    aiFeedback: getProperty<string>(node, FIELD_NAMES.RECALL_AI_FEEDBACK) ?? '',
    rating: (getProperty<number>(node, FIELD_NAMES.RECALL_RATING) ?? 3) as FsrsRating,
    reviewedAt: node.createdAt.toISOString(),
  }
}

// ============================================================================
// Domain Type -> ts-fsrs Card Conversions
// ============================================================================

/**
 * Convert a RecallCard (our domain type) to a ts-fsrs Card object for scheduling.
 */
export function recallCardToFsrsCard(card: RecallCard): Card {
  return {
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsedDays,
    scheduled_days: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.lastReview ? new Date(card.lastReview) : undefined,
  }
}

/**
 * Convert a ts-fsrs Card back to a property map for DB storage.
 * Returns entries as [FieldSystemId, value] pairs for use with setProperty.
 */
export function fsrsCardToProperties(card: Card): Array<[FieldSystemId, string | number]> {
  return [
    [SYSTEM_FIELDS.RECALL_DUE, card.due.toISOString()],
    [SYSTEM_FIELDS.RECALL_STABILITY, card.stability],
    [SYSTEM_FIELDS.RECALL_DIFFICULTY, card.difficulty],
    [SYSTEM_FIELDS.RECALL_ELAPSED_DAYS, card.elapsed_days],
    [SYSTEM_FIELDS.RECALL_SCHEDULED_DAYS, card.scheduled_days],
    [SYSTEM_FIELDS.RECALL_REPS, card.reps],
    [SYSTEM_FIELDS.RECALL_LAPSES, card.lapses],
    [SYSTEM_FIELDS.RECALL_STATE, card.state as number],
    [SYSTEM_FIELDS.RECALL_LAST_REVIEW, card.last_review?.toISOString() ?? ''],
  ]
}

/**
 * Create a default FSRS card for a newly created concept.
 * State = New (0), due = now.
 */
export function createEmptyRecallCard(now?: Date): RecallCard {
  const card = createEmptyCard(now ?? new Date())
  return {
    due: card.due.toISOString(),
    state: card.state as FsrsState,
    reps: card.reps,
    lapses: card.lapses,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    lastReview: card.last_review?.toISOString(),
  }
}
