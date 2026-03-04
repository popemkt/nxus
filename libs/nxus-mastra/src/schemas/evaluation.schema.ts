import { z } from 'zod'

export const FsrsRatingSchema = z.enum(['again', 'hard', 'good', 'easy'])

export type FsrsRating = z.infer<typeof FsrsRatingSchema>

/** Maps FSRS rating labels to numeric values used by ts-fsrs */
export const FSRS_RATING_MAP = {
  again: 1,
  hard: 2,
  good: 3,
  easy: 4,
} as const satisfies Record<FsrsRating, number>

export const AnswerEvaluationSchema = z.object({
  rating: FsrsRatingSchema.describe('Suggested FSRS rating based on answer quality'),
  score: z.number().min(0).max(100).describe('Numeric score 0-100'),
  feedback: z.string().describe('Constructive feedback explaining what was good and what could be improved'),
  keyInsightsMissed: z.array(z.string()).describe('Important points the answer missed'),
  strongPoints: z.array(z.string()).describe('What the learner got right'),
})

export type AnswerEvaluation = z.infer<typeof AnswerEvaluationSchema>
