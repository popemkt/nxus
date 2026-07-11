import { defineAction } from '../define-action.js'
import { compactNode, getFacade } from '../helpers.js'
import { SearchNodesInputSchema, SearchNodesOutputSchema } from '../schemas.js'

export const searchNodesAction = defineAction({
  name: 'search_nodes',
  description: 'Evaluate an nxus QueryDefinition and return compact node summaries.',
  input: SearchNodesInputSchema,
  output: SearchNodesOutputSchema,
  handler: async (input) => {
    const nodeFacade = await getFacade()
    const definition = {
      ...input.query,
      limit: input.limit ?? input.query.limit,
    }
    const result = await nodeFacade.evaluateQuery(definition)
    return {
      nodes: result.nodes
        .filter((node) => node.deletedAt === null)
        .slice(0, input.limit ?? result.nodes.length)
        .map(compactNode),
      totalCount: result.totalCount,
      evaluatedAt: result.evaluatedAt.toISOString(),
    }
  },
})
