import { z } from 'zod'
import type { BloomsLevel } from './concept.schema.js'

/**
 * Question type discriminated union.
 *
 * Each variant shares `questionText`, `modelAnswer`, `hints`, but adds
 * type-specific fields (e.g. `choices` for multiple-choice).
 */

const BaseQuestionFields = {
  questionText: z.string().describe('The question to ask the learner'),
  modelAnswer: z.string().describe('An ideal answer for evaluation reference'),
  hints: z.array(z.string()).max(3).describe('Progressive hints if the learner is stuck'),
}

export const FreeResponseQuestionSchema = z.object({
  ...BaseQuestionFields,
  questionType: z.literal('free-response'),
})

export const MultipleChoiceQuestionSchema = z.object({
  ...BaseQuestionFields,
  questionType: z.literal('multiple-choice'),
  choices: z.array(z.string()).min(3).max(5).describe('Answer choices (one must match modelAnswer)'),
  correctIndex: z.number().min(0).max(4).describe('Zero-based index of the correct choice'),
})

export const TrueFalseQuestionSchema = z.object({
  ...BaseQuestionFields,
  questionType: z.literal('true-false'),
  correctAnswer: z.boolean().describe('Whether the statement is true or false'),
})

export const FillBlankQuestionSchema = z.object({
  ...BaseQuestionFields,
  questionType: z.literal('fill-blank'),
  blankAnswer: z.string().describe('The word or phrase that fills the blank'),
})

export const GeneratedQuestionSchema = z.discriminatedUnion('questionType', [
  FreeResponseQuestionSchema,
  MultipleChoiceQuestionSchema,
  TrueFalseQuestionSchema,
  FillBlankQuestionSchema,
])

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>

/**
 * All possible question type literals.
 */
export const QUESTION_TYPES = ['free-response', 'multiple-choice', 'true-false', 'fill-blank'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]

/**
 * Bloom's level → allowed question types mapping.
 *
 * Lower levels get structured question types (MC, T/F, fill-blank).
 * Higher levels get free-response to test deeper thinking.
 */
export const BLOOMS_QUESTION_TYPES: Record<BloomsLevel, QuestionType[]> = {
  remember: ['multiple-choice', 'true-false'],
  understand: ['multiple-choice', 'fill-blank'],
  apply: ['free-response', 'fill-blank'],
  analyze: ['free-response'],
  evaluate: ['free-response'],
  create: ['free-response'],
}
