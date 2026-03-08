import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const explainFurtherServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      conceptTitle: z.string(),
      questionText: z.string(),
      modelAnswer: z.string(),
      keyInsightsMissed: z.array(z.string()),
      userAnswer: z.string(),
    }),
  )
  .handler(async (ctx) => {
    try {
      const { explainFurther } = await import('@nxus/mastra/server')
      const result = await explainFurther(ctx.data)
      return { success: true as const, explanation: result.explanation }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : 'Failed to generate explanation',
      }
    }
  })
