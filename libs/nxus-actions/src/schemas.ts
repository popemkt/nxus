import { QueryDefinitionSchema } from '@nxus/db'
import { z } from 'zod'

export const JsonValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
])

export const CompactNodeSchema = z.object({
  id: z.string(),
  content: z.string().nullable(),
  supertags: z.array(z.object({
    id: z.string(),
    content: z.string(),
    systemId: z.string().nullable(),
  })),
  fields: z.record(z.string(), z.array(z.unknown())),
})

export const PropertyValueSchema = z.object({
  value: z.unknown(),
  rawValue: z.string(),
  fieldNodeId: z.string(),
  fieldName: z.string(),
  fieldSystemId: z.string().nullable(),
  order: z.number(),
})

export const AssembledNodeSchema = z.object({
  id: z.string(),
  content: z.string().nullable(),
  systemId: z.string().nullable(),
  ownerId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  deletedAt: z.date().nullable(),
  properties: z.record(z.string(), z.array(PropertyValueSchema)),
  supertags: z.array(z.object({
    id: z.string(),
    content: z.string(),
    systemId: z.string().nullable(),
  })),
})

export const SearchNodesInputSchema = z.object({
  query: QueryDefinitionSchema,
  limit: z.number().int().positive().max(1000).optional(),
}).strict()

export const SearchNodesOutputSchema = z.object({
  nodes: z.array(CompactNodeSchema),
  totalCount: z.number(),
  evaluatedAt: z.string(),
})

export const ReadNodeInputSchema = z.object({
  nodeId: z.string().min(1),
}).strict()

export const ReadNodeOutputSchema = z.object({
  node: AssembledNodeSchema,
  children: z.array(CompactNodeSchema),
})

export const CreateNodeInputSchema = z.object({
  content: z.string().min(1),
  parentId: z.string().min(1).optional(),
  supertag: z.string().min(1).optional(),
  fields: z.record(z.string(), JsonValueSchema).optional(),
}).strict()

export const CreateNodeOutputSchema = z.object({
  nodeId: z.string(),
  node: CompactNodeSchema,
})

export const SetFieldInputSchema = z.object({
  nodeId: z.string().min(1),
  fieldId: z.string().min(1),
  value: JsonValueSchema,
}).strict()

export const SetFieldOutputSchema = z.object({
  node: CompactNodeSchema,
})

export const TagNodeInputSchema = z.object({
  nodeId: z.string().min(1),
  supertag: z.string().min(1),
}).strict()

export const TagNodeOutputSchema = z.object({
  added: z.boolean(),
  node: CompactNodeSchema,
})

export const UntagNodeOutputSchema = z.object({
  removed: z.boolean(),
  node: CompactNodeSchema,
})

export const ListTagsInputSchema = z.object({}).strict()

export const ListTagsOutputSchema = z.object({
  tags: z.array(z.object({
    id: z.string(),
    systemId: z.string().nullable(),
    content: z.string().nullable(),
    baseType: z.unknown(),
  })),
})

export const GetTagSchemaInputSchema = z.object({
  tag: z.string().min(1),
}).strict()

export const GetTagSchemaOutputSchema = z.object({
  tag: z.object({
    id: z.string(),
    systemId: z.string().nullable(),
    content: z.string().nullable(),
  }),
  fields: z.array(z.object({
    systemId: z.string(),
    fieldNodeId: z.string(),
    name: z.string(),
    type: z.unknown(),
    defaultValue: z.unknown(),
    inheritedFrom: z.union([
      z.object({
        id: z.string(),
        systemId: z.string().nullable(),
        content: z.string().nullable(),
      }),
      z.null(),
    ]),
  })),
})

export const ImportTifInputSchema = z.object({
  json: z.string().min(1),
}).strict()

export const ImportTifOutputSchema = z.object({
  summary: z.object({
    nodesImported: z.number(),
    topLevelNodesImported: z.number(),
    supertagsImported: z.number(),
    fieldsImported: z.number(),
    refsResolved: z.number(),
    brokenRefs: z.number(),
    skipped: z.array(z.unknown()),
    topLevelNodeIds: z.array(z.string()),
  }),
})

export interface TifNodeOutput {
  uid: string
  name: string
  type: string
  children?: TifNodeOutput[]
}

const TifNodeSchema: z.ZodType<TifNodeOutput> = z.lazy(() =>
  z.object({
    uid: z.string(),
    name: z.string(),
    type: z.string(),
    children: z.array(TifNodeSchema).optional(),
  }).passthrough(),
)

export const ExportSubtreeInputSchema = z.object({
  rootNodeId: z.string().min(1).optional(),
}).strict()

export const ExportSubtreeOutputSchema = z.object({
  tif: z.object({
    version: z.literal('TanaIntermediateFile V0.1'),
    summary: z.object({
      totalNodes: z.number(),
      topLevelNodes: z.number(),
    }).passthrough(),
    nodes: z.array(TifNodeSchema),
  }).passthrough(),
})

export const GetDayNodeInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
}).strict()

export const GetDayNodeOutputSchema = z.object({
  success: z.literal(true),
  nodeId: z.string(),
  created: z.boolean(),
})
