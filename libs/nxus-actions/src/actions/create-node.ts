import { defineAction } from '../define-action.js'
import {
  compactNode,
  ensureLiveNode,
  getFacade,
  resolveSupertagSystemId,
  toFieldSystemId,
} from '../helpers.js'
import {
  CreateNodeInputSchema,
  CreateNodeOutputSchema,
} from '../schemas.js'

export const createNodeAction = defineAction({
  name: 'create_node',
  description: 'Create a node through nodeFacade and optionally tag and set fields.',
  input: CreateNodeInputSchema,
  output: CreateNodeOutputSchema,
  handler: async (input) => {
    const nodeFacade = await getFacade()
    const fields = Object.entries(input.fields ?? {}).map(([fieldId, value]) => ({
      fieldId: toFieldSystemId(fieldId),
      value,
    }))
    const nodeId = await nodeFacade.createNode({
      content: input.content,
      ownerId: input.parentId,
    })
    if (input.supertag) {
      await nodeFacade.addNodeSupertag(
        nodeId,
        await resolveSupertagSystemId(input.supertag),
      )
    }
    for (const field of fields) {
      await nodeFacade.setProperty(nodeId, field.fieldId, field.value)
    }
    const node = ensureLiveNode(await nodeFacade.assembleNode(nodeId))
    return { nodeId, node: compactNode(node) }
  },
})
