import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { getSupertagColor } from '@/lib/supertag-colors'
import { initDatabaseSeeded } from './ensure-seeded.server'

/**
 * Search nodes by content text. Uses the query evaluator with a ContentFilter.
 */
export const searchNodesServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().positive().max(50).optional(),
  }))
  .handler(async (ctx) => {
    const { nodeFacade } = await import('@nxus/db/server')
    await initDatabaseSeeded()
    await nodeFacade.init()

    const limit = ctx.data.limit ?? 20

    const result = await nodeFacade.evaluateQuery({
      filters: [{ type: 'content', query: ctx.data.query, caseSensitive: false }],
      limit,
    })

    return {
      success: true as const,
      nodes: result.nodes.map((n) => ({
        id: n.id,
        content: n.content ?? '',
        supertags: n.supertags.map((st: { id: string; content: string; systemId: string | null }) => ({
          id: st.id,
          name: st.content,
          color: getSupertagColor(st.id),
          systemId: st.systemId,
        })),
      })),
    }
  })
