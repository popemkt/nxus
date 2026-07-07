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
    await initDatabaseSeeded()
    const { searchNodes } = await import('@nxus/node-api/server')
    const result = await searchNodes({
      query: ctx.data.query,
      limit: ctx.data.limit ?? 20,
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
