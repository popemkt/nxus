import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const getConceptsByTopicServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ topicId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, getConceptsByTopic } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    const concepts = getConceptsByTopic(db, ctx.data.topicId)
    return { success: true as const, concepts }
  })

export const getConceptByIdServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ conceptId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, getConceptById } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    const concept = getConceptById(db, ctx.data.conceptId)
    if (!concept) {
      return { success: false as const, error: 'Concept not found' }
    }
    return { success: true as const, concept }
  })

const SaveConceptInputSchema = z.object({
  topicId: z.string(),
  title: z.string().min(1),
  summary: z.string().min(1),
  whyItMatters: z.string().optional(),
  bloomsLevel: z.string().optional(),
  source: z.string().optional(),
  relatedConceptTitles: z.array(z.string()).optional(),
})

export const saveConceptServerFn = createServerFn({ method: 'POST' })
  .inputValidator(SaveConceptInputSchema)
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, saveConcept } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    const conceptId = saveConcept(db, ctx.data)
    return { success: true as const, conceptId }
  })

/**
 * Save multiple concepts and link their related concepts as node references.
 * This is the preferred way to save a batch — it resolves title→ID links.
 */
const SaveConceptsBatchInputSchema = z.object({
  topicId: z.string(),
  concepts: z.array(z.object({
    title: z.string().min(1),
    summary: z.string().min(1),
    whyItMatters: z.string().optional(),
    bloomsLevel: z.string().optional(),
    source: z.string().optional(),
    relatedConceptTitles: z.array(z.string()).optional(),
  })),
})

export const saveConceptsBatchServerFn = createServerFn({ method: 'POST' })
  .inputValidator(SaveConceptsBatchInputSchema)
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, saveConcept, linkRelatedConcepts } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()

    // Save all concepts first
    const titleToId = new Map<string, string>()
    const conceptsToLink: Array<{ conceptId: string; relatedTitles: string[] }> = []

    for (const concept of ctx.data.concepts) {
      const conceptId = saveConcept(db, {
        topicId: ctx.data.topicId,
        ...concept,
      })
      titleToId.set(concept.title, conceptId)
      if (concept.relatedConceptTitles && concept.relatedConceptTitles.length > 0) {
        conceptsToLink.push({
          conceptId,
          relatedTitles: concept.relatedConceptTitles,
        })
      }
    }

    // Now link related concepts using resolved node IDs
    linkRelatedConcepts(db, titleToId, conceptsToLink)

    return {
      success: true as const,
      savedCount: ctx.data.concepts.length,
      conceptIds: Array.from(titleToId.values()),
    }
  })

export const deleteConceptServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ conceptId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, deleteConcept } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    deleteConcept(db, ctx.data.conceptId)
    return { success: true as const }
  })

export const updateConceptServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      conceptId: z.string(),
      title: z.string().optional(),
      summary: z.string().optional(),
      whyItMatters: z.string().optional(),
    }),
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, updateConcept } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()
    updateConcept(db, ctx.data)
    return { success: true as const }
  })

export const getReviewLogsServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ conceptId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, getReviewLogsByConcept } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()
    const logs = getReviewLogsByConcept(db, ctx.data.conceptId)
    return { success: true as const, logs }
  })
