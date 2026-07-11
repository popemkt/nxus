import { defineAction } from '../define-action.js'
import { ImportTifInputSchema, ImportTifOutputSchema } from '../schemas.js'

export const importTifAction = defineAction({
  name: 'import_tif',
  description: 'Import a Tana Intermediate File JSON string.',
  input: ImportTifInputSchema,
  output: ImportTifOutputSchema,
  handler: async (input) => {
    const { importTif } = await import('@nxus/node-api/server')
    return { summary: await importTif({ json: input.json }) }
  },
})
