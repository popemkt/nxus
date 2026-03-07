import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const getTopicsServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { initDatabaseWithBootstrap } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()
    const { getTopics } = await import('@nxus/db/server')
    const topics = getTopics(db)
    return { success: true as const, topics }
  },
)

export const getTopicByIdServerFn = createServerFn({ method: 'GET' })
  .inputValidator(z.object({ topicId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, getTopicById } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    const topic = getTopicById(db, ctx.data.topicId)
    if (!topic) {
      return { success: false as const, error: 'Topic not found' }
    }
    return { success: true as const, topic }
  })

export const createTopicServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ name: z.string().min(1), description: z.string().optional() }),
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, createTopic } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    const topicId = createTopic(db, ctx.data.name, ctx.data.description)
    return { success: true as const, topicId }
  })

export const deleteTopicServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ topicId: z.string() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, deleteTopic } = await import(
      '@nxus/db/server'
    )
    const db = await initDatabaseWithBootstrap()
    deleteTopic(db, ctx.data.topicId)
    return { success: true as const }
  })

export const mergeTopicsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({ sourceTopicId: z.string(), targetTopicId: z.string() }),
  )
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, mergeTopics } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()
    const movedCount = mergeTopics(db, ctx.data.sourceTopicId, ctx.data.targetTopicId)
    return { success: true as const, movedCount }
  })
