import { defineAction } from '../define-action.js'
import { ImportTifInputSchema, ImportTifOutputSchema } from '../schemas.js'
import { z } from 'zod'

export const importTifAction = defineAction({
  name: 'import_tif',
  description: 'Import a Tana Intermediate File JSON string.',
  input: ImportTifInputSchema,
  output: ImportTifOutputSchema,
  handler: async (input) => {
    let parsed: unknown
    try {
      parsed = JSON.parse(input.json)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      throw new Error(`Invalid TIF JSON: ${detail}`)
    }
    const version = z.object({
      version: z.string(),
    }).passthrough().parse(parsed).version
    if (version !== 'TanaIntermediateFile V0.1') {
      throw new Error(`Unsupported TIF version: ${version}`)
    }
    const { importTif } = await import('@nxus/node-api/server')
    return { summary: await importTif({ json: input.json }) }
  },
})
