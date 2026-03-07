import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const generateQuestionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      conceptTitle: z.string(),
      conceptSummary: z.string(),
      bloomsLevel: z.string().nullable(),
      currentBloomsLevel: z.string().nullable().optional(),
      adjacentConcepts: z.array(
        z.object({ title: z.string(), summary: z.string() }),
      ),
    }),
  )
  .handler(async (ctx) => {
    try {
      const { generateQuestion } = await import('@nxus/mastra/server')
      const question = await generateQuestion(ctx.data)
      if (!question) {
        return { success: false as const, error: 'No question generated' }
      }
      return { success: true as const, question }
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate question',
      }
    }
  })
