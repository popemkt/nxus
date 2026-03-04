/**
 * recall.service.ts - Recall training service layer
 *
 * Pure functions that create/query nodes and assemble them into
 * typesafe RecallTopic, RecallConcept, RecallCard, and ReviewLog objects.
 *
 * The app never touches raw nodes — it consumes these assembled types.
 */

import { eq } from 'drizzle-orm'
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import {
  nodes,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  FIELD_NAMES,
} from '../schemas/node-schema.js'
import type * as schema from '../schemas/item-schema.js'
import {
  assembleNode,
  createNode,
  setProperty,
  getProperty,
  getNodesBySupertags,
} from './node.service.js'
import type { AssembledNode } from '../types/node.js'
import type {
  RecallTopic,
  RecallCard,
  RecallConcept,
  ReviewLog,
  RecallStats,
} from '../types/recall.js'

// Re-export types for convenience
export type { RecallTopic, RecallCard, RecallConcept, ReviewLog, RecallStats }

type DatabaseInstance = BetterSQLite3Database<typeof schema>

// ============================================================================
// Assembly Helpers
// ============================================================================

function assembleCard(node: AssembledNode): RecallCard | null {
  const due = getProperty<string>(node, FIELD_NAMES.RECALL_DUE)
  if (!due) return null

  return {
    due,
    state: getProperty<number>(node, FIELD_NAMES.RECALL_STATE) ?? 0,
    reps: getProperty<number>(node, FIELD_NAMES.RECALL_REPS) ?? 0,
    lapses: getProperty<number>(node, FIELD_NAMES.RECALL_LAPSES) ?? 0,
    stability: getProperty<number>(node, FIELD_NAMES.RECALL_STABILITY) ?? 0,
    difficulty: getProperty<number>(node, FIELD_NAMES.RECALL_DIFFICULTY) ?? 0,
    elapsedDays: getProperty<number>(node, FIELD_NAMES.RECALL_ELAPSED_DAYS) ?? 0,
    scheduledDays: getProperty<number>(node, FIELD_NAMES.RECALL_SCHEDULED_DAYS) ?? 0,
    lastReview: getProperty<string>(node, FIELD_NAMES.RECALL_LAST_REVIEW) ?? null,
  }
}

function assembleConcept(
  node: AssembledNode,
  topicId: string,
  topicName: string,
): RecallConcept {
  return {
    id: node.id,
    topicId,
    topicName,
    title: node.content || '',
    summary: getProperty<string>(node, FIELD_NAMES.RECALL_SUMMARY) ?? '',
    whyItMatters: getProperty<string>(node, FIELD_NAMES.RECALL_WHY_IT_MATTERS) ?? null,
    bloomsLevel: getProperty<string>(node, FIELD_NAMES.RECALL_BLOOMS_LEVEL) ?? null,
    source: getProperty<string>(node, FIELD_NAMES.RECALL_SOURCE) ?? null,
    relatedConceptTitles: getProperty<string[]>(node, FIELD_NAMES.RECALL_RELATED_CONCEPTS) ?? [],
    card: assembleCard(node),
  }
}

function assembleReviewLog(node: AssembledNode): ReviewLog {
  return {
    id: node.id,
    conceptId: getProperty<string>(node, FIELD_NAMES.PARENT) ?? '',
    questionText: getProperty<string>(node, FIELD_NAMES.RECALL_QUESTION_TEXT) ?? '',
    questionType: getProperty<string>(node, FIELD_NAMES.RECALL_QUESTION_TYPE) ?? '',
    userAnswer: getProperty<string>(node, FIELD_NAMES.RECALL_USER_ANSWER) ?? '',
    aiFeedback: getProperty<string>(node, FIELD_NAMES.RECALL_AI_FEEDBACK) ?? '',
    rating: getProperty<number>(node, FIELD_NAMES.RECALL_RATING) ?? 0,
    reviewedAt: node.createdAt,
  }
}

// ============================================================================
// Topic Operations
// ============================================================================

export function getTopics(db: DatabaseInstance): RecallTopic[] {
  const topicNodes = getNodesBySupertags(db, [SYSTEM_SUPERTAGS.RECALL_TOPIC])
  const now = new Date().toISOString()

  return topicNodes
    .filter((n) => !n.deletedAt)
    .map((node) => {
      const conceptNodes = getConceptNodesByTopic(db, node.id)
      const dueCount = conceptNodes.filter((c) => {
        const due = getProperty<string>(c, FIELD_NAMES.RECALL_DUE)
        return due && due <= now
      }).length

      return {
        id: node.id,
        name: node.content || '',
        description: getProperty<string>(node, FIELD_NAMES.DESCRIPTION) ?? null,
        conceptCount: conceptNodes.length,
        dueCount,
        createdAt: node.createdAt,
      }
    })
}

export function getTopicById(db: DatabaseInstance, topicId: string): RecallTopic | null {
  const node = assembleNode(db, topicId)
  if (!node || node.deletedAt) return null

  const hasSuperTag = node.supertags.some(
    (st) => st.systemId === SYSTEM_SUPERTAGS.RECALL_TOPIC,
  )
  if (!hasSuperTag) return null

  const conceptNodes = getConceptNodesByTopic(db, node.id)
  const now = new Date().toISOString()
  const dueCount = conceptNodes.filter((c) => {
    const due = getProperty<string>(c, FIELD_NAMES.RECALL_DUE)
    return due && due <= now
  }).length

  return {
    id: node.id,
    name: node.content || '',
    description: getProperty<string>(node, FIELD_NAMES.DESCRIPTION) ?? null,
    conceptCount: conceptNodes.length,
    dueCount,
    createdAt: node.createdAt,
  }
}

export function createTopic(
  db: DatabaseInstance,
  name: string,
  description?: string,
): string {
  const topicId = createNode(db, {
    content: name,
    supertagId: SYSTEM_SUPERTAGS.RECALL_TOPIC,
  })

  if (description) {
    setProperty(db, topicId, SYSTEM_FIELDS.DESCRIPTION, description)
  }

  return topicId
}

export function deleteTopic(db: DatabaseInstance, topicId: string): void {
  const now = new Date()
  db.update(nodes)
    .set({ deletedAt: now })
    .where(eq(nodes.id, topicId))
    .run()
}

// ============================================================================
// Concept Operations
// ============================================================================

function getConceptNodesByTopic(
  db: DatabaseInstance,
  topicId: string,
): AssembledNode[] {
  const allConcepts = getNodesBySupertags(db, [SYSTEM_SUPERTAGS.RECALL_CONCEPT])
  return allConcepts.filter((c) => {
    if (c.deletedAt) return false
    const parent = getProperty<string>(c, FIELD_NAMES.PARENT)
    return parent === topicId
  })
}

export function getConceptsByTopic(
  db: DatabaseInstance,
  topicId: string,
): RecallConcept[] {
  const topicNode = assembleNode(db, topicId)
  if (!topicNode) return []

  const conceptNodes = getConceptNodesByTopic(db, topicId)
  return conceptNodes.map((node) =>
    assembleConcept(node, topicId, topicNode.content || ''),
  )
}

export function getConceptById(
  db: DatabaseInstance,
  conceptId: string,
): RecallConcept | null {
  const node = assembleNode(db, conceptId)
  if (!node || node.deletedAt) return null

  const hasSuperTag = node.supertags.some(
    (st) => st.systemId === SYSTEM_SUPERTAGS.RECALL_CONCEPT,
  )
  if (!hasSuperTag) return null

  const topicId = getProperty<string>(node, FIELD_NAMES.PARENT) ?? ''
  const topicNode = topicId ? assembleNode(db, topicId) : null
  const topicName = topicNode?.content ?? ''

  return assembleConcept(node, topicId, topicName)
}

export interface SaveConceptInput {
  topicId: string
  title: string
  summary: string
  whyItMatters?: string
  bloomsLevel?: string
  source?: string
  relatedConceptTitles?: string[]
}

export function saveConcept(
  db: DatabaseInstance,
  input: SaveConceptInput,
): string {
  const conceptId = createNode(db, {
    content: input.title,
    supertagId: SYSTEM_SUPERTAGS.RECALL_CONCEPT,
  })

  // Link to topic
  setProperty(db, conceptId, SYSTEM_FIELDS.PARENT, input.topicId)

  // Set concept fields
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_SUMMARY, input.summary)

  if (input.whyItMatters) {
    setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_WHY_IT_MATTERS, input.whyItMatters)
  }
  if (input.bloomsLevel) {
    setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_BLOOMS_LEVEL, input.bloomsLevel)
  }
  if (input.source) {
    setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_SOURCE, input.source)
  }
  if (input.relatedConceptTitles && input.relatedConceptTitles.length > 0) {
    setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_RELATED_CONCEPTS, input.relatedConceptTitles)
  }

  // Initialize FSRS card state (New card, due now)
  const now = new Date().toISOString()
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_DUE, now)
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_STATE, 0) // New
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_REPS, 0)
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_LAPSES, 0)
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_STABILITY, 0)
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_DIFFICULTY, 0)
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_ELAPSED_DAYS, 0)
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_SCHEDULED_DAYS, 0)

  return conceptId
}

export function deleteConcept(db: DatabaseInstance, conceptId: string): void {
  const now = new Date()
  db.update(nodes)
    .set({ deletedAt: now })
    .where(eq(nodes.id, conceptId))
    .run()
}

// ============================================================================
// FSRS Card Operations
// ============================================================================

export function getDueCards(
  db: DatabaseInstance,
  limit: number = 50,
): RecallConcept[] {
  const now = new Date().toISOString()
  const allConcepts = getNodesBySupertags(db, [SYSTEM_SUPERTAGS.RECALL_CONCEPT])

  const dueConcepts = allConcepts
    .filter((c) => {
      if (c.deletedAt) return false
      const due = getProperty<string>(c, FIELD_NAMES.RECALL_DUE)
      return due && due <= now
    })
    .sort((a, b) => {
      const dueA = getProperty<string>(a, FIELD_NAMES.RECALL_DUE) ?? ''
      const dueB = getProperty<string>(b, FIELD_NAMES.RECALL_DUE) ?? ''
      return dueA.localeCompare(dueB)
    })
    .slice(0, limit)

  return dueConcepts.map((node) => {
    const topicId = getProperty<string>(node, FIELD_NAMES.PARENT) ?? ''
    const topicNode = topicId ? assembleNode(db, topicId) : null
    return assembleConcept(node, topicId, topicNode?.content ?? '')
  })
}

export function getDueCardsByTopic(
  db: DatabaseInstance,
  topicId: string,
  limit: number = 50,
): RecallConcept[] {
  const now = new Date().toISOString()
  const topicNode = assembleNode(db, topicId)
  if (!topicNode) return []

  const conceptNodes = getConceptNodesByTopic(db, topicId)
  const dueConcepts = conceptNodes
    .filter((c) => {
      const due = getProperty<string>(c, FIELD_NAMES.RECALL_DUE)
      return due && due <= now
    })
    .sort((a, b) => {
      const dueA = getProperty<string>(a, FIELD_NAMES.RECALL_DUE) ?? ''
      const dueB = getProperty<string>(b, FIELD_NAMES.RECALL_DUE) ?? ''
      return dueA.localeCompare(dueB)
    })
    .slice(0, limit)

  return dueConcepts.map((node) =>
    assembleConcept(node, topicId, topicNode.content || ''),
  )
}

export interface UpdateCardFsrsInput {
  conceptId: string
  due: string
  state: number
  reps: number
  lapses: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  lastReview: string
}

export function updateCardFsrs(
  db: DatabaseInstance,
  input: UpdateCardFsrsInput,
): void {
  setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_DUE, input.due)
  setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_STATE, input.state)
  setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_REPS, input.reps)
  setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_LAPSES, input.lapses)
  setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_STABILITY, input.stability)
  setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_DIFFICULTY, input.difficulty)
  setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_ELAPSED_DAYS, input.elapsedDays)
  setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_SCHEDULED_DAYS, input.scheduledDays)
  setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_LAST_REVIEW, input.lastReview)
}

// ============================================================================
// Review Log Operations
// ============================================================================

export interface CreateReviewLogInput {
  conceptId: string
  questionText: string
  questionType: string
  userAnswer: string
  aiFeedback: string
  rating: number
}

export function createReviewLog(
  db: DatabaseInstance,
  input: CreateReviewLogInput,
): string {
  const logId = createNode(db, {
    content: `Review: ${input.questionText.slice(0, 50)}`,
    supertagId: SYSTEM_SUPERTAGS.RECALL_REVIEW_LOG,
  })

  setProperty(db, logId, SYSTEM_FIELDS.PARENT, input.conceptId)
  setProperty(db, logId, SYSTEM_FIELDS.RECALL_QUESTION_TEXT, input.questionText)
  setProperty(db, logId, SYSTEM_FIELDS.RECALL_QUESTION_TYPE, input.questionType)
  setProperty(db, logId, SYSTEM_FIELDS.RECALL_USER_ANSWER, input.userAnswer)
  setProperty(db, logId, SYSTEM_FIELDS.RECALL_AI_FEEDBACK, input.aiFeedback)
  setProperty(db, logId, SYSTEM_FIELDS.RECALL_RATING, input.rating)

  return logId
}

export function getReviewLogsByConcept(
  db: DatabaseInstance,
  conceptId: string,
): ReviewLog[] {
  const allLogs = getNodesBySupertags(db, [SYSTEM_SUPERTAGS.RECALL_REVIEW_LOG])
  return allLogs
    .filter((n) => {
      if (n.deletedAt) return false
      const parent = getProperty<string>(n, FIELD_NAMES.PARENT)
      return parent === conceptId
    })
    .map(assembleReviewLog)
    .sort((a, b) => b.reviewedAt.getTime() - a.reviewedAt.getTime())
}

// ============================================================================
// Stats
// ============================================================================

export function getRecallStats(db: DatabaseInstance): RecallStats {
  const topics = getNodesBySupertags(db, [SYSTEM_SUPERTAGS.RECALL_TOPIC])
    .filter((n) => !n.deletedAt)
  const concepts = getNodesBySupertags(db, [SYSTEM_SUPERTAGS.RECALL_CONCEPT])
    .filter((n) => !n.deletedAt)

  const now = new Date().toISOString()
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const dueNow = concepts.filter((c) => {
    const due = getProperty<string>(c, FIELD_NAMES.RECALL_DUE)
    return due && due <= now
  }).length

  const allLogs = getNodesBySupertags(db, [SYSTEM_SUPERTAGS.RECALL_REVIEW_LOG])
    .filter((n) => !n.deletedAt)
  const reviewedToday = allLogs.filter(
    (n) => n.createdAt >= todayStart,
  ).length

  return {
    totalTopics: topics.length,
    totalConcepts: concepts.length,
    dueNow,
    reviewedToday,
  }
}
