import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const getDueCardsServerFn = createServerFn({ method: 'GET' })
  .inputValidator(
    z.object({ topicId: z.string().optional(), limit: z.number().optional() }),
  )
  .handler(async (ctx) => {
    const {
      initDatabaseWithBootstrap,
      getDueCards,
      getDueCardsByTopic,
    } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()

    const cards = ctx.data.topicId
      ? getDueCardsByTopic(db, ctx.data.topicId, ctx.data.limit)
      : getDueCards(db, ctx.data.limit)

    return { success: true as const, cards }
  })

export const getRecallStatsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { initDatabaseWithBootstrap, getRecallStats } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    const stats = getRecallStats(db)
    return { success: true as const, stats }
  },
)

const SubmitReviewSchema = z.object({
  conceptId: z.string(),
  questionText: z.string(),
  questionType: z.string(),
  userAnswer: z.string(),
  aiFeedback: z.string(),
  rating: z.number().min(1).max(4),
})

export const submitReviewServerFn = createServerFn({ method: 'POST' })
  .inputValidator(SubmitReviewSchema)
  .handler(async (ctx) => {
    const {
      initDatabaseWithBootstrap,
      getConceptById,
      updateCardFsrs,
      createReviewLog,
    } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()

    const concept = getConceptById(db, ctx.data.conceptId)
    if (!concept || !concept.card) {
      return { success: false as const, error: 'Concept or card not found' }
    }

    // Use ts-fsrs to compute next card state
    const { fsrs, createEmptyCard, Rating, State } = await import('ts-fsrs')

    const f = fsrs()
    const card = {
      due: new Date(concept.card.due),
      stability: concept.card.stability,
      difficulty: concept.card.difficulty,
      elapsed_days: concept.card.elapsedDays,
      scheduled_days: concept.card.scheduledDays,
      reps: concept.card.reps,
      lapses: concept.card.lapses,
      state: concept.card.state as 0 | 1 | 2 | 3,
      last_review: concept.card.lastReview
        ? new Date(concept.card.lastReview)
        : undefined,
    }

    const now = new Date()
    const scheduling = f.repeat(card, now)
    const ratingKey = ctx.data.rating as 1 | 2 | 3 | 4
    const next = scheduling[ratingKey]

    if (!next) {
      return { success: false as const, error: 'FSRS scheduling failed' }
    }

    // Compute Bloom's progression
    const { nextBloomsLevel } = await import('@nxus/mastra/server')
    const currentBlooms = concept.card.currentBloomsLevel ?? 'remember'
    const ceiling = (concept.bloomsLevel as 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create') ?? 'apply'
    const newBlooms = nextBloomsLevel(currentBlooms, ceiling, ratingKey)

    // Update card state
    updateCardFsrs(db, {
      conceptId: ctx.data.conceptId,
      due: next.card.due.toISOString(),
      state: next.card.state,
      reps: next.card.reps,
      lapses: next.card.lapses,
      stability: next.card.stability,
      difficulty: next.card.difficulty,
      elapsedDays: next.card.elapsed_days,
      scheduledDays: next.card.scheduled_days,
      lastReview: now.toISOString(),
      currentBloomsLevel: newBlooms,
    })

    // Create review log
    createReviewLog(db, {
      conceptId: ctx.data.conceptId,
      questionText: ctx.data.questionText,
      questionType: ctx.data.questionType,
      userAnswer: ctx.data.userAnswer,
      aiFeedback: ctx.data.aiFeedback,
      rating: ctx.data.rating,
    })

    // Return interval info for all ratings
    const intervals = Object.entries(scheduling).reduce(
      (acc, [key, val]) => {
        const days = Math.round(val.card.scheduled_days)
        acc[Number(key) as 1 | 2 | 3 | 4] = days
        return acc
      },
      {} as Record<1 | 2 | 3 | 4, number>,
    )

    return {
      success: true as const,
      nextDue: next.card.due.toISOString(),
      intervals,
    }
  })

export const previewIntervalsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ conceptId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, getConceptById } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()

    const concept = getConceptById(db, ctx.data.conceptId)
    if (!concept || !concept.card) {
      return { success: false as const, error: 'Concept or card not found' }
    }

    const { fsrs } = await import('ts-fsrs')
    const f = fsrs()
    const card = {
      due: new Date(concept.card.due),
      stability: concept.card.stability,
      difficulty: concept.card.difficulty,
      elapsed_days: concept.card.elapsedDays,
      scheduled_days: concept.card.scheduledDays,
      reps: concept.card.reps,
      lapses: concept.card.lapses,
      state: concept.card.state as 0 | 1 | 2 | 3,
      last_review: concept.card.lastReview
        ? new Date(concept.card.lastReview)
        : undefined,
    }

    const scheduling = f.repeat(card, new Date())
    const intervals = Object.entries(scheduling).reduce(
      (acc, [key, val]) => {
        const days = Math.round(val.card.scheduled_days)
        acc[Number(key) as 1 | 2 | 3 | 4] = days
        return acc
      },
      {} as Record<1 | 2 | 3 | 4, number>,
    )

    return { success: true as const, intervals }
  })
