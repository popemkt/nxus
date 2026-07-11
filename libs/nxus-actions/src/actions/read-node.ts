import { defineAction } from '../define-action.js'
import { compactNode, ensureLiveNode, getFacade, nodeOrder } from '../helpers.js'
import { ReadNodeInputSchema, ReadNodeOutputSchema } from '../schemas.js'

export const readNodeAction = defineAction({
  name: 'read_node',
  description: 'Read an assembled live node plus one ordered child level.',
  input: ReadNodeInputSchema,
  output: ReadNodeOutputSchema,
  handler: async (input) => {
    const nodeFacade = await getFacade()
    const node = ensureLiveNode(await nodeFacade.assembleNode(input.nodeId))
    const childrenResult = await nodeFacade.evaluateQuery({
      filters: [
        { type: 'relation', relationType: 'childOf', targetNodeId: input.nodeId },
      ],
      limit: Number.MAX_SAFE_INTEGER,
    })
    const children = childrenResult.nodes
      .filter((child) => child.deletedAt === null)
      .sort((left, right) => nodeOrder(left) - nodeOrder(right))
      .map(compactNode)
    return { node, children }
  },
})
