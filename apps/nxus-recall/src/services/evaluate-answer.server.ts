import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const evaluateAnswerServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      questionText: z.string(),
      modelAnswer: z.string(),
      userAnswer: z.string(),
      conceptTitle: z.string(),
    }),
  )
  .handler(async (ctx) => {
    try {
      const { evaluateAnswer } = await import('@nxus/mastra/server')
      const evaluation = await evaluateAnswer(ctx.data)
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
