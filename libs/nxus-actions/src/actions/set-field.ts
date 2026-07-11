import { defineAction } from '../define-action.js'
import { compactNode, ensureLiveNode, getFacade, toFieldSystemId } from '../helpers.js'
import { SetFieldInputSchema, SetFieldOutputSchema } from '../schemas.js'

export const setFieldAction = defineAction({
  name: 'set_field',
  description: 'Set one field value on a live node.',
  input: SetFieldInputSchema,
  output: SetFieldOutputSchema,
  handler: async (input) => {
    const nodeFacade = await getFacade()
    ensureLiveNode(await nodeFacade.findNodeById(input.nodeId), input.nodeId)
    await nodeFacade.setProperty(input.nodeId, toFieldSystemId(input.fieldId), input.value)
    const node = ensureLiveNode(await nodeFacade.assembleNode(input.nodeId), input.nodeId)
    return { node: compactNode(node) }
  },
})
