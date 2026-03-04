/**
 * Zod validation schemas for Recall server function inputs/outputs.
 *
 * These schemas are used with TanStack Start's `.inputValidator()` to
 * validate server function parameters at the boundary.
 */

import { z } from 'zod'

// ============================================================================
// Shared Schema Primitives
// ============================================================================

export const BloomsLevelSchema = z.enum([
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
])

export const FsrsRatingSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
])

// ============================================================================
// CRUD Server Function Input Schemas
// ============================================================================

/** Input for getTopicsServerFn — no params needed */
export const GetTopicsInputSchema = z.object({})
export type GetTopicsInput = z.infer<typeof GetTopicsInputSchema>

/** Input for getTopicServerFn */
export const GetTopicInputSchema = z.object({
  topicId: z.string().min(1),
})
export type GetTopicInput = z.infer<typeof GetTopicInputSchema>

/** Input for getConceptsByTopicServerFn */
export const GetConceptsByTopicInputSchema = z.object({
  topicId: z.string().min(1),
})
export type GetConceptsByTopicInput = z.infer<typeof GetConceptsByTopicInputSchema>

/** Input for getDueCardsServerFn */
export const GetDueCardsInputSchema = z.object({
  topicId: z.string().optional(),
})
export type GetDueCardsInput = z.infer<typeof GetDueCardsInputSchema>

/** Input for saveConceptServerFn (creates topic if new + concept) */
export const SaveConceptInputSchema = z.object({
  topicName: z.string().min(1, 'Topic name is required'),
  title: z.string().min(1, 'Concept title is required'),
  summary: z.string().min(1, 'Summary is required'),
  whyItMatters: z.string().min(1, 'Why it matters is required'),
  bloomsLevel: BloomsLevelSchema,
  source: z.string().optional(),
  relatedConceptIds: z.array(z.string()).optional(),
})
export type SaveConceptInput = z.infer<typeof SaveConceptInputSchema>

/** Input for createManualConceptServerFn (under existing topic) */
export const CreateManualConceptInputSchema = z.object({
  topicId: z.string().min(1),
  title: z.string().min(1, 'Concept title is required'),
  summary: z.string().min(1, 'Summary is required'),
  whyItMatters: z.string().min(1, 'Why it matters is required'),
  bloomsLevel: BloomsLevelSchema,
  source: z.string().optional(),
  relatedConceptIds: z.array(z.string()).optional(),
})
export type CreateManualConceptInput = z.infer<typeof CreateManualConceptInputSchema>

// ============================================================================
// FSRS Server Function Input Schemas
// ============================================================================

/** Input for rateCardServerFn */
export const RateCardInputSchema = z.object({
  conceptId: z.string().min(1),
  rating: FsrsRatingSchema,
  questionText: z.string().min(1),
  questionType: z.string().min(1),
  userAnswer: z.string().min(1),
  aiFeedback: z.string().min(1),
})
export type RateCardInput = z.infer<typeof RateCardInputSchema>

/** Input for previewIntervalsServerFn */
export const PreviewIntervalsInputSchema = z.object({
  conceptId: z.string().min(1),
})
export type PreviewIntervalsInput = z.infer<typeof PreviewIntervalsInputSchema>

// ============================================================================
// AI Server Function Input Schemas
// ============================================================================

/** Input for generateConceptsServerFn */
export const GenerateConceptsInputSchema = z.object({
  topicName: z.string().min(1, 'Topic name is required'),
  existingConcepts: z.array(z.string()).optional(),
})
export type GenerateConceptsInput = z.infer<typeof GenerateConceptsInputSchema>

/** Input for generateQuestionServerFn */
export const GenerateQuestionInputSchema = z.object({
  conceptId: z.string().min(1),
})
export type GenerateQuestionInput = z.infer<typeof GenerateQuestionInputSchema>

/** Input for evaluateAnswerServerFn */
export const EvaluateAnswerInputSchema = z.object({
  conceptId: z.string().min(1),
  questionText: z.string().min(1),
  questionType: z.string().min(1),
  userAnswer: z.string().min(1),
})
export type EvaluateAnswerInput = z.infer<typeof EvaluateAnswerInputSchema>

// ============================================================================
// AI Output Schemas (used with structured output / tool use)
// ============================================================================

/** Schema for a single AI-generated concept */
export const GeneratedConceptSchema = z.object({
  title: z.string(),
  summary: z.string(),
  whyItMatters: z.string(),
  bloomsLevel: BloomsLevelSchema,
})

/** Schema for the batch of AI-generated concepts */
export const GeneratedConceptsOutputSchema = z.object({
  concepts: z.array(GeneratedConceptSchema),
})

/** Schema for an AI-generated question */
export const GeneratedQuestionOutputSchema = z.object({
  questionText: z.string(),
  questionType: BloomsLevelSchema,
})

/** Schema for an AI answer evaluation */
export const AnswerEvaluationOutputSchema = z.object({
  feedback: z.string(),
  suggestedRating: FsrsRatingSchema,
})
