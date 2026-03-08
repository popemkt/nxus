import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { QUESTION_TYPES } from '@nxus/mastra'

export const evaluateAnswerServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      questionText: z.string(),
      modelAnswer: z.string(),
      userAnswer: z.string(),
      conceptTitle: z.string(),
      questionType: z.enum(QUESTION_TYPES).optional(),
    }),
  )
  .handler(async (ctx) => {
    try {
      // Only free-response uses AI evaluation — deterministic types are handled client-side
      const { evaluateAnswer } = await import('@nxus/mastra/server')
      const evaluation = await evaluateAnswer({
        questionText: ctx.data.questionText,
        modelAnswer: ctx.data.modelAnswer,
        userAnswer: ctx.data.userAnswer,
        conceptTitle: ctx.data.conceptTitle,
      })
      if (!evaluation) {
        return { success: false as const, error: 'No evaluation generated' }
      }
      return { success: true as const, evaluation }
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to evaluate answer',
      }
    }
  })
