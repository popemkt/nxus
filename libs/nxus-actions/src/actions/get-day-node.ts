import { defineAction } from '../define-action.js'
import { GetDayNodeInputSchema, GetDayNodeOutputSchema } from '../schemas.js'

export const getDayNodeAction = defineAction({
  name: 'get_day_node',
  description: 'Get or create the deterministic daily-note node for a date.',
  input: GetDayNodeInputSchema,
  output: GetDayNodeOutputSchema,
  handler: async (input) => {
    const { getOrCreateDayNode } = await import('@nxus/node-api/server')
    return await getOrCreateDayNode({ date: input.date })
  },
})
