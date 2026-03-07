/**
 * recall.ts - Recall training types
 *
 * These types are shared between client and server code.
 * NO runtime imports here - types only!
 */

export interface RecallTopic {
  id: string
  name: string
  description: string | null
  conceptCount: number
  dueCount: number
  createdAt: Date
}

export type BloomsLevel = 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create'

export interface RecallCard {
  due: string
  state: number
  reps: number
  lapses: number
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  lastReview: string | null
  currentBloomsLevel: BloomsLevel
}

export interface RecallConcept {
  id: string
  topicId: string
  topicName: string
  title: string
  summary: string
  whyItMatters: string | null
  bloomsLevel: string | null
  source: string | null
  relatedConceptTitles: string[]
  relatedConceptIds: string[]
  card: RecallCard | null
}

export interface ReviewLog {
  id: string
  conceptId: string
  questionText: string
  questionType: string
  userAnswer: string
  aiFeedback: string
  rating: number
  reviewedAt: Date
  /** Card state at time of review (0-3) */
  reviewState?: number
  /** AI evaluation score (0-100) */
  reviewScore?: number
  /** Milliseconds from question shown to answer submitted */
  timeSpentMs?: number
  /** FSRS stability before this review */
  stabilityBefore?: number
  /** FSRS difficulty before this review */
  difficultyBefore?: number
  /** Interval assigned after this review */
  scheduledDays?: number
  /** Number of hints revealed before answering */
  hintsUsed?: number
}

export interface RecallStats {
  totalTopics: number
  totalConcepts: number
  dueNow: number
  reviewedToday: number
  currentStreak: number
  longestStreak: number
}

export interface LearningPathItem {
  concept: RecallConcept
  retrievability: number
  priority: 'overdue' | 'due-soon' | 'new'
}
