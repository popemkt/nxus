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
