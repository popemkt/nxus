import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const generateQuestionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      conceptId: z.string(),
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
      // Check for cached question first
      const { initDatabaseWithBootstrap, getCachedQuestion, setCachedQuestion } =
        await import('@nxus/db/server')
      const db = await initDatabaseWithBootstrap()
      const cached = getCachedQuestion(db, ctx.data.conceptId)
      if (cached) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return { success: true as const, question: cached as any, fromCache: true }
      }

      const { generateQuestion } = await import('@nxus/mastra/server')
      const question = await generateQuestion(ctx.data)
      if (!question) {
        return { success: false as const, error: 'No question generated' }
      }

      // Cache the generated question on the concept node
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
  .inputValidator(
    z.object({
      conceptId: z.string(),
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
