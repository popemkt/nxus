import { defineAction } from '../define-action.js'
import { ensureLiveNode, getFacade } from '../helpers.js'
import { ExportSubtreeInputSchema, ExportSubtreeOutputSchema } from '../schemas.js'

export const exportSubtreeAction = defineAction({
  name: 'export_subtree',
  description: 'Export a subtree, or all root nodes when omitted, to TIF JSON.',
  input: ExportSubtreeInputSchema,
  output: ExportSubtreeOutputSchema,
  handler: async (input) => {
    if (input.rootNodeId) {
      const nodeFacade = await getFacade()
      ensureLiveNode(await nodeFacade.findNodeById(input.rootNodeId), input.rootNodeId)
    }
    const { exportSubtree } = await import('@nxus/node-api/server')
    return { tif: await exportSubtree({ rootNodeId: input.rootNodeId }) }
  },
})
