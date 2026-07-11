import { defineAction } from '../define-action.js'
import {
  compactNode,
  ensureLiveNode,
  getFacade,
  resolveSupertagSystemId,
} from '../helpers.js'
import { TagNodeInputSchema, UntagNodeOutputSchema } from '../schemas.js'

export const untagNodeAction = defineAction({
  name: 'untag_node',
  description: 'Remove a supertag systemId from a live node.',
  input: TagNodeInputSchema,
  output: UntagNodeOutputSchema,
  handler: async (input) => {
    const nodeFacade = await getFacade()
    ensureLiveNode(await nodeFacade.findNodeById(input.nodeId), input.nodeId)
    const removed = await nodeFacade.removeNodeSupertag(
      input.nodeId,
      await resolveSupertagSystemId(input.supertag),
    )
    const node = ensureLiveNode(await nodeFacade.assembleNode(input.nodeId), input.nodeId)
    return { removed, node: compactNode(node) }
  },
})
