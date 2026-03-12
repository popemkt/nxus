/**
 * recall.ts - Recall training types
 *
 * These types are shared between client and server code.
 */

import { z } from 'zod'
import { UUID_REGEX } from './common.js'

export const RecallTopicSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  name: z.string(),
  description: z.string().nullable(),
  conceptCount: z.number(),
  dueCount: z.number(),
  createdAt: z.coerce.date(),
})
export type RecallTopic = z.infer<typeof RecallTopicSchema>

export const BLOOMS_LEVELS = [
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
] as const
export const BloomsLevelSchema = z.enum(BLOOMS_LEVELS)
export type BloomsLevel = (typeof BLOOMS_LEVELS)[number]

/** FSRS card state: 0=New, 1=Learning, 2=Review, 3=Relearning */
export const FsrsCardStateSchema = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
])
export type FsrsCardState = z.infer<typeof FsrsCardStateSchema>

export const RecallCardSchema = z.object({
  due: z.string().datetime(),
  state: FsrsCardStateSchema,
  reps: z.number(),
  lapses: z.number(),
  stability: z.number(),
  difficulty: z.number(),
  elapsedDays: z.number(),
  scheduledDays: z.number(),
  lastReview: z.string().datetime().nullable(),
  currentBloomsLevel: BloomsLevelSchema,
})
export type RecallCard = z.infer<typeof RecallCardSchema>

export const RecallConceptSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  topicId: z.string().regex(UUID_REGEX),
  topicName: z.string(),
  title: z.string(),
  summary: z.string(),
  whyItMatters: z.string().nullable(),
  bloomsLevel: BloomsLevelSchema.nullable(),
  source: z.string().nullable(),
  relatedConceptTitles: z.array(z.string()),
  relatedConceptIds: z.array(z.string().regex(UUID_REGEX)),
  card: RecallCardSchema.nullable(),
})
export type RecallConcept = z.infer<typeof RecallConceptSchema>

export const ReviewLogSchema = z.object({
  id: z.string().regex(UUID_REGEX),
  conceptId: z.string().regex(UUID_REGEX),
  questionText: z.string(),
  questionType: z.string(),
  userAnswer: z.string(),
  aiFeedback: z.string(),
  rating: z.number(),
  reviewedAt: z.coerce.date(),
  reviewState: FsrsCardStateSchema.optional(),
  reviewScore: z.number().optional(),
  timeSpentMs: z.number().optional(),
  stabilityBefore: z.number().optional(),
  difficultyBefore: z.number().optional(),
  scheduledDays: z.number().optional(),
  hintsUsed: z.number().optional(),
})
export type ReviewLog = z.infer<typeof ReviewLogSchema>

export const RecallStatsSchema = z.object({
  totalTopics: z.number(),
  totalConcepts: z.number(),
  dueNow: z.number(),
  reviewedToday: z.number(),
  currentStreak: z.number(),
  longestStreak: z.number(),
})
export type RecallStats = z.infer<typeof RecallStatsSchema>

export const LearningPathPrioritySchema = z.enum(['overdue', 'due-soon', 'new'])

export const LearningPathItemSchema = z.object({
  concept: RecallConceptSchema,
  retrievability: z.number(),
  priority: LearningPathPrioritySchema,
})
export type LearningPathItem = z.infer<typeof LearningPathItemSchema>
