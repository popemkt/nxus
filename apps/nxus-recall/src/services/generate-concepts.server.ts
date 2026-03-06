import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const generateConceptsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ topic: z.string().min(1) }))
  .handler(async (ctx) => {
    try {
      const { generateConcepts } = await import('@nxus/mastra/server')
      const result = await generateConcepts(ctx.data.topic)
      if (!result) {
        return { success: false as const, error: 'No concepts generated' }
      }
      return { success: true as const, concepts: result.concepts }
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof Error ? error.message : 'Failed to generate concepts',
      }
    }
  })
