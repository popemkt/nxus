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

export const BLOOMS_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const
export type BloomsLevel = (typeof BLOOMS_LEVELS)[number]

/** FSRS card state: 0=New, 1=Learning, 2=Review, 3=Relearning */
export type FsrsCardState = 0 | 1 | 2 | 3

export interface RecallCard {
  due: string
  state: FsrsCardState
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
  bloomsLevel: BloomsLevel | null
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
  reviewState?: FsrsCardState
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
