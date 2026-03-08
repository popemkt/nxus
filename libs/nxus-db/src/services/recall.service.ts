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
  BLOOM_LEVEL_NODES,
} from '../schemas/node-schema.js'
import type * as schema from '../schemas/item-schema.js'
import {
  assembleNode,
  createNode,
  setProperty,
  getProperty,
  getPropertyValues,
  getNodesBySupertags,
  getSystemNode,
} from './node.service.js'
import type { AssembledNode } from '../types/node.js'
import type {
  RecallTopic,
  RecallCard,
  RecallConcept,
  ReviewLog,
  RecallStats,
  BloomsLevel,
  FsrsCardState,
  LearningPathItem,
} from '../types/recall.js'

// Re-export types for convenience
export type { RecallTopic, RecallCard, RecallConcept, ReviewLog, RecallStats, BloomsLevel, LearningPathItem }

type DatabaseInstance = BetterSQLite3Database<typeof schema>

// ============================================================================
// Bloom's Level Helpers (string ↔ node ID mapping)
// ============================================================================

const BLOOMS_STRING_TO_SYSTEM_ID: Record<string, string> = {
  remember: BLOOM_LEVEL_NODES.REMEMBER,
  understand: BLOOM_LEVEL_NODES.UNDERSTAND,
  apply: BLOOM_LEVEL_NODES.APPLY,
  analyze: BLOOM_LEVEL_NODES.ANALYZE,
  evaluate: BLOOM_LEVEL_NODES.EVALUATE,
  create: BLOOM_LEVEL_NODES.CREATE,
}

const BLOOMS_SYSTEM_ID_TO_STRING: Record<string, BloomsLevel> = {
  [BLOOM_LEVEL_NODES.REMEMBER]: 'remember',
  [BLOOM_LEVEL_NODES.UNDERSTAND]: 'understand',
  [BLOOM_LEVEL_NODES.APPLY]: 'apply',
  [BLOOM_LEVEL_NODES.ANALYZE]: 'analyze',
  [BLOOM_LEVEL_NODES.EVALUATE]: 'evaluate',
  [BLOOM_LEVEL_NODES.CREATE]: 'create',
}

/** Resolve a Bloom's node ID to its string label, or null */
function resolveBloomsNodeId(db: DatabaseInstance, nodeId: string): BloomsLevel | null {
  // Fast path: check if the stored value is a system ID (e.g. 'bloom:remember')
  if (BLOOMS_SYSTEM_ID_TO_STRING[nodeId]) {
    return BLOOMS_SYSTEM_ID_TO_STRING[nodeId]
  }
  // Slow path: look up the node by UUID and check its systemId
  const node = getSystemNode(db, nodeId)
  if (node) return null // getSystemNode looks up by systemId, not useful here
  // Fallback: it might be a plain string from before migration
  if (nodeId in BLOOMS_STRING_TO_SYSTEM_ID) return nodeId as BloomsLevel
  return null
}

/** Get the UUID of a Bloom's level node from its string name */
function getBloomsNodeId(db: DatabaseInstance, level: string): string {
  const systemId = BLOOMS_STRING_TO_SYSTEM_ID[level]
  if (!systemId) return level // fallback: return as-is
  const node = getSystemNode(db, systemId)
  return node?.id ?? level
}

// ============================================================================
// Assembly Helpers
// ============================================================================

function assembleCard(db: DatabaseInstance, node: AssembledNode): RecallCard | null {
  const due = getProperty<string>(node, FIELD_NAMES.RECALL_DUE)
  if (!due) return null

  // Resolve currentBloomsLevel — stored as Bloom's node ID, return as string
  const rawBlooms = getProperty<string>(node, FIELD_NAMES.RECALL_CURRENT_BLOOMS_LEVEL)
  const currentBloomsLevel = rawBlooms
    ? (resolveBloomsNodeId(db, rawBlooms) ?? 'remember')
    : 'remember'

  return {
    due,
    state: (getProperty<number>(node, FIELD_NAMES.RECALL_STATE) ?? 0) as FsrsCardState,
    reps: getProperty<number>(node, FIELD_NAMES.RECALL_REPS) ?? 0,
    lapses: getProperty<number>(node, FIELD_NAMES.RECALL_LAPSES) ?? 0,
    stability: getProperty<number>(node, FIELD_NAMES.RECALL_STABILITY) ?? 0,
    difficulty: getProperty<number>(node, FIELD_NAMES.RECALL_DIFFICULTY) ?? 0,
    elapsedDays: getProperty<number>(node, FIELD_NAMES.RECALL_ELAPSED_DAYS) ?? 0,
    scheduledDays: getProperty<number>(node, FIELD_NAMES.RECALL_SCHEDULED_DAYS) ?? 0,
    lastReview: getProperty<string>(node, FIELD_NAMES.RECALL_LAST_REVIEW) ?? null,
    currentBloomsLevel,
  }
}

function assembleConcept(
  db: DatabaseInstance,
  node: AssembledNode,
  topicId: string,
  topicName: string,
): RecallConcept {
  // Resolve bloomsLevel — stored as Bloom's node ID, return as string
  const rawBlooms = getProperty<string>(node, FIELD_NAMES.RECALL_BLOOMS_LEVEL)
  const bloomsLevel = rawBlooms ? (resolveBloomsNodeId(db, rawBlooms) ?? rawBlooms) : null

  // Resolve related concepts — stored as node IDs, return both IDs and titles
  const relatedIds = getPropertyValues<string>(node, FIELD_NAMES.RECALL_RELATED_CONCEPTS)
  const relatedConceptTitles = relatedIds.map((id) => {
    const relatedNode = assembleNode(db, id)
    return relatedNode?.content ?? id
  })

  return {
    id: node.id,
    topicId,
    topicName,
    title: node.content || '',
    summary: getProperty<string>(node, FIELD_NAMES.RECALL_SUMMARY) ?? '',
    whyItMatters: getProperty<string>(node, FIELD_NAMES.RECALL_WHY_IT_MATTERS) ?? null,
    bloomsLevel,
    source: getProperty<string>(node, FIELD_NAMES.RECALL_SOURCE) ?? null,
    relatedConceptTitles,
    relatedConceptIds: relatedIds,
    card: assembleCard(db, node),
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
    reviewState: getProperty<number>(node, FIELD_NAMES.RECALL_REVIEW_STATE) ?? undefined,
    reviewScore: getProperty<number>(node, FIELD_NAMES.RECALL_REVIEW_SCORE) ?? undefined,
    timeSpentMs: getProperty<number>(node, FIELD_NAMES.RECALL_REVIEW_TIME_SPENT_MS) ?? undefined,
    stabilityBefore: getProperty<number>(node, FIELD_NAMES.RECALL_REVIEW_STABILITY_BEFORE) ?? undefined,
    difficultyBefore: getProperty<number>(node, FIELD_NAMES.RECALL_REVIEW_DIFFICULTY_BEFORE) ?? undefined,
    scheduledDays: getProperty<number>(node, FIELD_NAMES.RECALL_REVIEW_SCHEDULED_DAYS) ?? undefined,
    hintsUsed: getProperty<number>(node, FIELD_NAMES.RECALL_REVIEW_HINTS_USED) ?? undefined,
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
    assembleConcept(db, node, topicId, topicNode.content || ''),
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

  return assembleConcept(db, node, topicId, topicName)
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
    // Store as Bloom's level node ID
    const bloomsNodeId = getBloomsNodeId(db, input.bloomsLevel)
    setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_BLOOMS_LEVEL, bloomsNodeId)
  }
  if (input.source) {
    setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_SOURCE, input.source)
  }
  // relatedConceptTitles are resolved to node IDs via linkRelatedConcepts() after all concepts are saved

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
  // Initialize currentBloomsLevel as Bloom's node ID for 'remember'
  const rememberNodeId = getBloomsNodeId(db, 'remember')
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_CURRENT_BLOOMS_LEVEL, rememberNodeId)

  return conceptId
}

/**
 * Resolve related concept titles to node IDs and store as node references.
 * Call this after all concepts in a batch have been saved.
 *
 * @param titleToId - Map of concept title → saved concept node ID
 */
export function linkRelatedConcepts(
  db: DatabaseInstance,
  titleToId: Map<string, string>,
  conceptsToLink: Array<{ conceptId: string; relatedTitles: string[] }>,
): void {
  for (const { conceptId, relatedTitles } of conceptsToLink) {
    const relatedIds = relatedTitles
      .map((title) => titleToId.get(title))
      .filter((id): id is string => id !== undefined)

    for (let i = 0; i < relatedIds.length; i++) {
      setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_RELATED_CONCEPTS, relatedIds[i]!, i)
    }
  }
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
    return assembleConcept(db, node, topicId, topicNode?.content ?? '')
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
    assembleConcept(db, node, topicId, topicNode.content || ''),
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
  currentBloomsLevel?: BloomsLevel
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
  if (input.currentBloomsLevel) {
    const bloomsNodeId = getBloomsNodeId(db, input.currentBloomsLevel)
    setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_CURRENT_BLOOMS_LEVEL, bloomsNodeId)
  }
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
  reviewState?: number
  reviewScore?: number
  timeSpentMs?: number
  stabilityBefore?: number
  difficultyBefore?: number
  scheduledDays?: number
  hintsUsed?: number
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

  if (input.reviewState !== undefined) {
    setProperty(db, logId, SYSTEM_FIELDS.RECALL_REVIEW_STATE, input.reviewState)
  }
  if (input.reviewScore !== undefined) {
    setProperty(db, logId, SYSTEM_FIELDS.RECALL_REVIEW_SCORE, input.reviewScore)
  }
  if (input.timeSpentMs !== undefined) {
    setProperty(db, logId, SYSTEM_FIELDS.RECALL_REVIEW_TIME_SPENT_MS, input.timeSpentMs)
  }
  if (input.stabilityBefore !== undefined) {
    setProperty(db, logId, SYSTEM_FIELDS.RECALL_REVIEW_STABILITY_BEFORE, input.stabilityBefore)
  }
  if (input.difficultyBefore !== undefined) {
    setProperty(db, logId, SYSTEM_FIELDS.RECALL_REVIEW_DIFFICULTY_BEFORE, input.difficultyBefore)
  }
  if (input.scheduledDays !== undefined) {
    setProperty(db, logId, SYSTEM_FIELDS.RECALL_REVIEW_SCHEDULED_DAYS, input.scheduledDays)
  }
  if (input.hintsUsed !== undefined) {
    setProperty(db, logId, SYSTEM_FIELDS.RECALL_REVIEW_HINTS_USED, input.hintsUsed)
  }

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
// Question Cache Operations
// ============================================================================

/** Get a cached (pre-generated) question for a concept, or null */
export function getCachedQuestion(db: DatabaseInstance, conceptId: string): unknown | null {
  const node = assembleNode(db, conceptId)
  if (!node) return null
  const raw = getProperty<string>(node, FIELD_NAMES.RECALL_CACHED_QUESTION)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

/** Cache a pre-generated question on a concept node */
export function setCachedQuestion(db: DatabaseInstance, conceptId: string, question: unknown): void {
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_CACHED_QUESTION, JSON.stringify(question))
}

/** Clear the cached question after it has been used */
export function clearCachedQuestion(db: DatabaseInstance, conceptId: string): void {
  setProperty(db, conceptId, SYSTEM_FIELDS.RECALL_CACHED_QUESTION, '')
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

  // Compute streaks from review log dates
  const reviewDates = new Set<string>()
  for (const log of allLogs) {
    reviewDates.add(log.createdAt.toISOString().slice(0, 10))
  }
  const sortedDates = Array.from(reviewDates).sort().reverse()
  const todayStr = new Date().toISOString().slice(0, 10)

  let currentStreak = 0
  let longestStreak = 0
  let runLength = 0

  // Walk sorted dates (newest first) for current streak
  for (let i = 0; i < sortedDates.length; i++) {
    const expected = new Date()
    expected.setDate(expected.getDate() - i)
    const expectedStr = expected.toISOString().slice(0, 10)
    if (sortedDates[i] === expectedStr) {
      currentStreak++
    } else if (i === 0 && sortedDates[0] === new Date(Date.now() - 86400000).toISOString().slice(0, 10)) {
      // Allow yesterday as the start if today has no reviews yet
      currentStreak = 0
      break
    } else {
      break
    }
  }

  // Longest streak: walk all dates chronologically
  const chronological = Array.from(reviewDates).sort()
  for (let i = 0; i < chronological.length; i++) {
    if (i === 0) {
      runLength = 1
    } else {
      const prev = new Date(chronological[i - 1]!)
      const curr = new Date(chronological[i]!)
      const diffDays = Math.round((curr.getTime() - prev.getTime()) / 86400000)
      runLength = diffDays === 1 ? runLength + 1 : 1
    }
    if (runLength > longestStreak) longestStreak = runLength
  }

  return {
    totalTopics: topics.length,
    totalConcepts: concepts.length,
    dueNow,
    reviewedToday,
    currentStreak,
    longestStreak,
  }
}

// ============================================================================
// Update Concept
// ============================================================================

export interface UpdateConceptInput {
  conceptId: string
  title?: string
  summary?: string
  whyItMatters?: string
}

export function updateConcept(db: DatabaseInstance, input: UpdateConceptInput): void {
  if (input.title) {
    db.update(nodes)
      .set({ content: input.title, contentPlain: input.title.toLowerCase(), updatedAt: new Date() })
      .where(eq(nodes.id, input.conceptId))
      .run()
  }
  if (input.summary !== undefined) {
    setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_SUMMARY, input.summary)
  }
  if (input.whyItMatters !== undefined) {
    setProperty(db, input.conceptId, SYSTEM_FIELDS.RECALL_WHY_IT_MATTERS, input.whyItMatters)
  }
}

// ============================================================================
// Merge Topics
// ============================================================================

export function mergeTopics(db: DatabaseInstance, sourceTopicId: string, targetTopicId: string): number {
  const conceptNodes = getConceptNodesByTopic(db, sourceTopicId)
  for (const node of conceptNodes) {
    setProperty(db, node.id, SYSTEM_FIELDS.PARENT, targetTopicId)
  }
  deleteTopic(db, sourceTopicId)
  return conceptNodes.length
}

// ============================================================================
// All Cards by Topic (for cram mode)
// ============================================================================

export function getAllCardsByTopic(
  db: DatabaseInstance,
  topicId: string,
): RecallConcept[] {
  const topicNode = assembleNode(db, topicId)
  if (!topicNode) return []

  const conceptNodes = getConceptNodesByTopic(db, topicId)
  return conceptNodes.map((node) =>
    assembleConcept(db, node, topicId, topicNode.content || ''),
  )
}

// ============================================================================
// Learning Path Suggestions
// ============================================================================

export function getLearningPathSuggestions(
  db: DatabaseInstance,
  limit: number = 5,
): LearningPathItem[] {
  const allConcepts = getNodesBySupertags(db, [SYSTEM_SUPERTAGS.RECALL_CONCEPT])
    .filter((n) => !n.deletedAt)

  const now = Date.now()
  const items: LearningPathItem[] = []

  for (const node of allConcepts) {
    const topicId = getProperty<string>(node, FIELD_NAMES.PARENT) ?? ''
    const topicNode = topicId ? assembleNode(db, topicId) : null
    const concept = assembleConcept(db, node, topicId, topicNode?.content ?? '')

    if (!concept.card) {
      // New card — never reviewed
      items.push({ concept, retrievability: 0, priority: 'new' })
      continue
    }

    const { stability, lastReview } = concept.card
    if (stability <= 0 || !lastReview) {
      items.push({ concept, retrievability: 0, priority: 'new' })
      continue
    }

    const elapsedDays = (now - new Date(lastReview).getTime()) / 86400000
    const retrievability = Math.pow(1 + (19 / 81) * (elapsedDays / stability), -0.5)

    const priority = retrievability < 0.5 ? 'overdue' : retrievability < 0.85 ? 'due-soon' : 'new'
    items.push({ concept, retrievability, priority })
  }

  // Sort: overdue first (lowest retrievability), then due-soon, then new
  items.sort((a, b) => a.retrievability - b.retrievability)
  return items.slice(0, limit)
}
