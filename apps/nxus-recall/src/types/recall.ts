/**
 * Domain types for the Recall spaced repetition system.
 *
 * These types represent the application-level data model,
 * bridging the node-based DB architecture with the UI layer.
 */

// ============================================================================
// Enums & Literal Types
// ============================================================================

/** Bloom's Taxonomy cognitive levels */
export type BloomsLevel =
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate'
  | 'create'

/** FSRS card states (mirrors ts-fsrs State enum values) */
export type FsrsState = 0 | 1 | 2 | 3

/** FSRS rating values (mirrors ts-fsrs Rating enum, excluding Manual=0) */
export type FsrsRating = 1 | 2 | 3 | 4

/** Human-readable labels for FSRS states */
export const FSRS_STATE_LABELS: Record<FsrsState, string> = {
  0: 'New',
  1: 'Learning',
  2: 'Review',
  3: 'Relearning',
}

/** Human-readable labels for FSRS ratings */
export const FSRS_RATING_LABELS: Record<FsrsRating, string> = {
  1: 'Again',
  2: 'Hard',
  3: 'Good',
  4: 'Easy',
}

// ============================================================================
// Domain Interfaces
// ============================================================================

/** A topic groups related concepts for study */
export interface RecallTopic {
  id: string
  name: string
  description?: string
  /** Number of concepts in this topic (computed) */
  conceptCount: number
  /** Number of concepts due for review (computed) */
  dueCount: number
}

/** A concept is an individual knowledge item with FSRS scheduling state */
export interface RecallConcept {
  id: string
  topicId: string
  topicName: string
  title: string
  summary: string
  whyItMatters: string
  bloomsLevel: BloomsLevel
  source?: string
  relatedConceptIds: string[]
  card: RecallCard
}

/** FSRS scheduling state for a concept */
export interface RecallCard {
  /** Next review date (ISO string) */
  due: string
  /** Card state: 0=New, 1=Learning, 2=Review, 3=Relearning */
  state: FsrsState
  /** Number of successful reviews */
  reps: number
  /** Number of lapses (forgotten reviews) */
  lapses: number
  /** Memory stability (days at 90% retention) */
  stability: number
  /** Item difficulty [1-10] */
  difficulty: number
  /** Days since last review */
  elapsedDays: number
  /** Days until next scheduled review */
  scheduledDays: number
  /** Last review date (ISO string) */
  lastReview?: string
}

/** A log entry for a single review event */
export interface ReviewLog {
  id: string
  conceptId: string
  questionText: string
  questionType: string
  userAnswer: string
  aiFeedback: string
  rating: FsrsRating
  /** When the review was performed (ISO string from createdAt) */
  reviewedAt: string
}

// ============================================================================
// Server Response Types
// ============================================================================

/** Standard server function response wrapper */
export type ServerResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string }

/** Interval preview for a single rating option */
export interface IntervalPreview {
  /** Next review date (ISO string) */
  due: string
  /** Days until next review */
  scheduledDays: number
}

/** Preview of intervals for all rating options */
export type IntervalsPreview = Record<FsrsRating, IntervalPreview>
