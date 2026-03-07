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
}

export interface RecallStats {
  totalTopics: number
  totalConcepts: number
  dueNow: number
  reviewedToday: number
}
