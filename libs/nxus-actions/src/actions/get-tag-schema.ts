import { defineAction } from '../define-action.js'
import { ensureLiveNode, getFacade, resolveSupertagNode } from '../helpers.js'
import { GetTagSchemaInputSchema, GetTagSchemaOutputSchema } from '../schemas.js'

export const getTagSchemaAction = defineAction({
  name: 'get_tag_schema',
  description: 'Read declared and inherited field definitions for a supertag.',
  input: GetTagSchemaInputSchema,
  output: GetTagSchemaOutputSchema,
  handler: async (input) => {
    const nodeFacade = await getFacade()
    const { FIELD_NAMES } = await import('@nxus/db/server')
    const tag = await resolveSupertagNode(input.tag)
    const tagIds = [tag.id, ...(await nodeFacade.getAncestorSupertags(tag.id))]
    const fields = []
    const seen = new Set<string>()
    for (const tagId of tagIds) {
      const sourceTag = ensureLiveNode(await nodeFacade.assembleNode(tagId))
      const definitions = await nodeFacade.getSupertagFieldDefinitions(tagId)
      for (const [fieldSystemId, definition] of definitions) {
        if (seen.has(fieldSystemId)) {
          continue
        }
        seen.add(fieldSystemId)
        const fieldNode = ensureLiveNode(
          await nodeFacade.assembleNode(definition.fieldNodeId),
        )
        fields.push({
          systemId: fieldSystemId,
          fieldNodeId: definition.fieldNodeId,
          name: definition.fieldName,
          type: fieldNode.properties[FIELD_NAMES.FIELD_TYPE]?.[0]?.value ?? 'text',
          defaultValue: definition.defaultValue ?? null,
          inheritedFrom: sourceTag.id === tag.id ? null : {
            id: sourceTag.id,
            systemId: sourceTag.systemId,
            content: sourceTag.content,
          },
        })
      }
    }
    return {
      tag: {
        id: tag.id,
        systemId: tag.systemId,
        content: tag.content,
      },
      fields,
    }
  },
})
