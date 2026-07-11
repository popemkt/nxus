import { defineAction } from '../define-action.js'
import { getFacade } from '../helpers.js'
import { ListTagsInputSchema, ListTagsOutputSchema } from '../schemas.js'

export const listTagsAction = defineAction({
  name: 'list_tags',
  description: 'List supertag definition nodes.',
  input: ListTagsInputSchema,
  output: ListTagsOutputSchema,
  handler: async () => {
    const nodeFacade = await getFacade()
    const { FIELD_NAMES, SYSTEM_SUPERTAGS } = await import('@nxus/db/server')
    const tags = await nodeFacade.getNodesBySupertagWithInheritance(
      SYSTEM_SUPERTAGS.SUPERTAG,
    )
    return {
      tags: tags
        .filter((tag) => tag.deletedAt === null)
        .map((tag) => ({
          id: tag.id,
          systemId: tag.systemId,
          content: tag.content,
          baseType: tag.properties[FIELD_NAMES.BASE_TYPE]?.[0]?.value ?? null,
        })),
    }
  },
})
