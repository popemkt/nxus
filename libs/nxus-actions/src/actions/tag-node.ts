import { defineAction } from '../define-action.js'
import {
  compactNode,
  ensureLiveNode,
  getFacade,
  resolveSupertagSystemId,
} from '../helpers.js'
import { TagNodeInputSchema, TagNodeOutputSchema } from '../schemas.js'

export const tagNodeAction = defineAction({
  name: 'tag_node',
  description: 'Add a supertag systemId to a live node.',
  input: TagNodeInputSchema,
  output: TagNodeOutputSchema,
  handler: async (input) => {
    const nodeFacade = await getFacade()
    ensureLiveNode(await nodeFacade.findNodeById(input.nodeId), input.nodeId)
    const added = await nodeFacade.addNodeSupertag(
      input.nodeId,
      await resolveSupertagSystemId(input.supertag),
    )
    const node = ensureLiveNode(await nodeFacade.assembleNode(input.nodeId), input.nodeId)
    return { added, node: compactNode(node) }
  },
})
