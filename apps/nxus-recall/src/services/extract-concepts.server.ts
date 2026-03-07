import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const extractConceptsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ text: z.string().min(1), topicHint: z.string().optional() }))
  .handler(async (ctx) => {
    try {
      const { extractConceptsFromText } = await import('@nxus/mastra/server')
      const result = await extractConceptsFromText(ctx.data.text, ctx.data.topicHint)
      if (!result) {
        return { success: false as const, error: 'No concepts extracted' }
      }
      return { success: true as const, concepts: result.concepts }
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : 'Failed to extract concepts',
      }
    }
  })
