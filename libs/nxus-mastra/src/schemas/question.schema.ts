import { z } from 'zod'

export const QuestionTypeSchema = z.enum([
  'application',
  'analysis',
  'comparison',
  'synthesis',
  'evaluation',
])

export type QuestionType = z.infer<typeof QuestionTypeSchema>

export const GeneratedQuestionSchema = z.object({
  questionText: z.string().describe('The question to ask the learner'),
  questionType: QuestionTypeSchema.describe('Type of higher-order thinking required'),
  modelAnswer: z.string().describe('An ideal answer for evaluation reference'),
  hints: z.array(z.string()).max(3).describe('Progressive hints if the learner is stuck'),
})

export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>
