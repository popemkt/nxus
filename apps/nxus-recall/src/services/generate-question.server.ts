import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { BloomsLevelSchema } from '@nxus/db'

const QuestionInputSchema = z.object({
  conceptId: z.string(),
  conceptTitle: z.string(),
  conceptSummary: z.string(),
  bloomsLevel: BloomsLevelSchema.nullable(),
  currentBloomsLevel: BloomsLevelSchema.nullable().optional(),
  adjacentConcepts: z.array(
    z.object({ title: z.string(), summary: z.string() }),
  ),
})

export const generateQuestionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(QuestionInputSchema)
  .handler(async (ctx) => {
    try {
      const { initDatabaseWithBootstrap, getCachedQuestion, setCachedQuestion } =
        await import('@nxus/db/server')
      const { GeneratedQuestionSchema } = await import('@nxus/mastra')
      const db = await initDatabaseWithBootstrap()

      // Check for cached question — validate shape since it's stored as JSON
      const cached = getCachedQuestion(db, ctx.data.conceptId)
      if (cached) {
        const parsed = GeneratedQuestionSchema.safeParse(cached)
        if (parsed.success) {
          return { success: true as const, question: parsed.data, fromCache: true }
        }
        // Cache is stale/corrupt — fall through to regenerate
      }

      const { generateQuestion } = await import('@nxus/mastra/server')
      const question = await generateQuestion(ctx.data)
      if (!question) {
        return { success: false as const, error: 'No question generated' }
      }

      setCachedQuestion(db, ctx.data.conceptId, question)

      return { success: true as const, question, fromCache: false }
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

/** Pre-generate and cache a question for a concept (fire-and-forget prefetch) */
export const prefetchQuestionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(QuestionInputSchema)
  .handler(async (ctx) => {
    try {
      const { initDatabaseWithBootstrap, getCachedQuestion, setCachedQuestion } =
        await import('@nxus/db/server')
      const db = await initDatabaseWithBootstrap()

      // Skip if already cached
      const existing = getCachedQuestion(db, ctx.data.conceptId)
      if (existing) return { success: true as const, alreadyCached: true }

      const { generateQuestion } = await import('@nxus/mastra/server')
      const question = await generateQuestion(ctx.data)
      if (question) {
        setCachedQuestion(db, ctx.data.conceptId, question)
      }
      return { success: true as const, alreadyCached: false }
    } catch {
      // Prefetch failures are non-critical
      return { success: false as const }
    }
  })
