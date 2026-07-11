import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { QueryDefinitionSchema, type AssembledNode, type FieldSystemId } from '@nxus/db'
import { z } from 'zod'

export interface CompactNodeSummary {
  id: string
  content: string | null
  supertags: Array<{ id: string; content: string; systemId: string | null }>
  fields: Record<string, unknown[]>
}

export interface ReadNodeResult {
  node: AssembledNode
  children: CompactNodeSummary[]
}

function ok(structuredContent: object): CallToolResult {
  const content: Record<string, unknown> = { ...structuredContent }
  return {
    structuredContent: content,
    content: [{ type: 'text', text: JSON.stringify(content) }],
  }
}

function toolError(error: unknown): CallToolResult {
  const message = error instanceof Error ? error.message : String(error)
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  }
}

async function runTool(
  handler: () => Promise<object>,
): Promise<CallToolResult> {
  try {
    return ok(await handler())
  } catch (error) {
    return toolError(error)
  }
}

async function getFacade() {
  const { nodeFacade } = await import('@nxus/db/server')
  await nodeFacade.init()
  return nodeFacade
}

function toFieldSystemId(value: string): FieldSystemId {
  if (!value.startsWith('field:')) {
    throw new Error(`Expected field system ID, received: ${value}`)
  }
  return value as FieldSystemId
}

function compactNode(node: AssembledNode): CompactNodeSummary {
  return {
    id: node.id,
    content: node.content,
    supertags: node.supertags,
    fields: Object.fromEntries(
      Object.entries(node.properties).map(([fieldName, values]) => [
        fieldName,
        values.map((value) => value.value),
      ]),
    ),
  }
}

function ensureLiveNode(node: AssembledNode | null): AssembledNode {
  if (!node || node.deletedAt !== null) {
    throw new Error('Node not found')
  }
  return node
}

function nodeOrder(node: AssembledNode): number {
  const values = Object.values(node.properties).flat()
  const orderValue = values.find((value) => value.fieldSystemId === 'field:order')
  return typeof orderValue?.value === 'number' ? orderValue.value : Number.MAX_SAFE_INTEGER
}

async function resolveSupertagSystemId(input: string): Promise<string> {
  if (input.startsWith('supertag:')) {
    return input
  }

  const nodeFacade = await getFacade()
  const { SYSTEM_SUPERTAGS } = await import('@nxus/db/server')
  const tags = await nodeFacade.getNodesBySupertagWithInheritance(
    SYSTEM_SUPERTAGS.SUPERTAG,
  )
  const normalized = input.startsWith('#') ? input.slice(1) : input
  const match = tags.find((tag) => {
    const content = tag.content ?? ''
    return content === input || content === `#${normalized}` || content === normalized
  })

  if (!match?.systemId) {
    throw new Error(`Supertag not found: ${input}`)
  }
  return match.systemId
}

async function resolveSupertagNode(input: string): Promise<AssembledNode> {
  const nodeFacade = await getFacade()
  const bySystemId = input.startsWith('supertag:')
    ? await nodeFacade.findNodeBySystemId(input)
    : null
  if (bySystemId) {
    return ensureLiveNode(bySystemId)
  }

  const byId = await nodeFacade.findNodeById(input)
  if (byId) {
    return ensureLiveNode(byId)
  }

  const systemId = await resolveSupertagSystemId(input)
  const resolved = await nodeFacade.findNodeBySystemId(systemId)
  return ensureLiveNode(resolved)
}

const JsonValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
])

const SearchNodesInputSchema = z.object({
  query: QueryDefinitionSchema,
  limit: z.number().int().positive().max(1000).optional(),
})

const ReadNodeInputSchema = z.object({
  nodeId: z.string().min(1),
})

const CreateNodeInputSchema = z.object({
  content: z.string(),
  parentId: z.string().optional(),
  supertag: z.string().optional(),
  fields: z.record(z.string(), JsonValueSchema).optional(),
})

const SetFieldInputSchema = z.object({
  nodeId: z.string().min(1),
  fieldId: z.string().min(1),
  value: JsonValueSchema,
})

const TagNodeInputSchema = z.object({
  nodeId: z.string().min(1),
  supertag: z.string().min(1),
})

const GetTagSchemaInputSchema = z.object({
  tag: z.string().min(1),
})

const ImportTifInputSchema = z.object({
  json: z.string().min(1),
})

const ExportSubtreeInputSchema = z.object({
  rootNodeId: z.string().optional(),
})

const GetDayNodeInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD required'),
})

export function createNxusMcpServer(): McpServer {
  const server = new McpServer(
    { name: 'nxus', version: '0.1.0' },
    { capabilities: { tools: {} } },
  )

  server.registerTool(
    'search_nodes',
    {
      title: 'Search nodes',
      description: 'Evaluate an nxus QueryDefinition and return compact node summaries.',
      inputSchema: SearchNodesInputSchema,
    },
    (input) =>
      runTool(async () => {
        const nodeFacade = await getFacade()
        const definition = {
          ...input.query,
          limit: input.limit ?? input.query.limit,
        }
        const result = await nodeFacade.evaluateQuery(definition)
        return {
          nodes: result.nodes
            .filter((node) => node.deletedAt === null)
            .slice(0, input.limit ?? result.nodes.length)
            .map(compactNode),
          totalCount: result.totalCount,
          evaluatedAt: result.evaluatedAt.toISOString(),
        }
      }),
  )

  server.registerTool(
    'read_node',
    {
      title: 'Read node',
      description: 'Read an assembled live node plus one ordered child level.',
      inputSchema: ReadNodeInputSchema,
    },
    (input) =>
      runTool(async () => {
        const nodeFacade = await getFacade()
        const node = ensureLiveNode(await nodeFacade.assembleNode(input.nodeId))
        const childrenResult = await nodeFacade.evaluateQuery({
          filters: [
            { type: 'relation', relationType: 'childOf', targetNodeId: input.nodeId },
          ],
          limit: Number.MAX_SAFE_INTEGER,
        })
        const children = childrenResult.nodes
          .filter((child) => child.deletedAt === null)
          .sort((left, right) => nodeOrder(left) - nodeOrder(right))
          .map(compactNode)
        return { node, children } satisfies ReadNodeResult
      }),
  )

  server.registerTool(
    'create_node',
    {
      title: 'Create node',
      description: 'Create a node through nodeFacade and optionally tag and set fields.',
      inputSchema: CreateNodeInputSchema,
    },
    (input) =>
      runTool(async () => {
        const nodeFacade = await getFacade()
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
        for (const [fieldId, value] of Object.entries(input.fields ?? {})) {
          await nodeFacade.setProperty(nodeId, toFieldSystemId(fieldId), value)
        }
        const node = ensureLiveNode(await nodeFacade.assembleNode(nodeId))
        return { nodeId, node: compactNode(node) }
      }),
  )

  server.registerTool(
    'set_field',
    {
      title: 'Set field',
      description: 'Set one field value on a live node.',
      inputSchema: SetFieldInputSchema,
    },
    (input) =>
      runTool(async () => {
        const nodeFacade = await getFacade()
        ensureLiveNode(await nodeFacade.findNodeById(input.nodeId))
        await nodeFacade.setProperty(
          input.nodeId,
          toFieldSystemId(input.fieldId),
          input.value,
        )
        const node = ensureLiveNode(await nodeFacade.assembleNode(input.nodeId))
        return { node: compactNode(node) }
      }),
  )

  server.registerTool(
    'tag_node',
    {
      title: 'Tag node',
      description: 'Add a supertag systemId to a live node.',
      inputSchema: TagNodeInputSchema,
    },
    (input) =>
      runTool(async () => {
        const nodeFacade = await getFacade()
        ensureLiveNode(await nodeFacade.findNodeById(input.nodeId))
        const added = await nodeFacade.addNodeSupertag(
          input.nodeId,
          await resolveSupertagSystemId(input.supertag),
        )
        const node = ensureLiveNode(await nodeFacade.assembleNode(input.nodeId))
        return { added, node: compactNode(node) }
      }),
  )

  server.registerTool(
    'untag_node',
    {
      title: 'Untag node',
      description: 'Remove a supertag systemId from a live node.',
      inputSchema: TagNodeInputSchema,
    },
    (input) =>
      runTool(async () => {
        const nodeFacade = await getFacade()
        ensureLiveNode(await nodeFacade.findNodeById(input.nodeId))
        const removed = await nodeFacade.removeNodeSupertag(
          input.nodeId,
          await resolveSupertagSystemId(input.supertag),
        )
        const node = ensureLiveNode(await nodeFacade.assembleNode(input.nodeId))
        return { removed, node: compactNode(node) }
      }),
  )

  server.registerTool(
    'list_tags',
    {
      title: 'List tags',
      description: 'List supertag definition nodes.',
      inputSchema: z.object({}),
    },
    () =>
      runTool(async () => {
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
      }),
  )

  server.registerTool(
    'get_tag_schema',
    {
      title: 'Get tag schema',
      description: 'Read declared and inherited field definitions for a supertag.',
      inputSchema: GetTagSchemaInputSchema,
    },
    (input) =>
      runTool(async () => {
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
      }),
  )

  server.registerTool(
    'import_tif',
    {
      title: 'Import TIF',
      description: 'Import a Tana Intermediate File JSON string.',
      inputSchema: ImportTifInputSchema,
    },
    (input) =>
      runTool(async () => {
        const { importTif } = await import('@nxus/node-api/server')
        return { summary: await importTif({ json: input.json }) }
      }),
  )

  server.registerTool(
    'export_subtree',
    {
      title: 'Export subtree',
      description: 'Export a subtree, or all root nodes when omitted, to TIF JSON.',
      inputSchema: ExportSubtreeInputSchema,
    },
    (input) =>
      runTool(async () => {
        const { exportSubtree } = await import('@nxus/node-api/server')
        return { tif: await exportSubtree({ rootNodeId: input.rootNodeId }) }
      }),
  )

  server.registerTool(
    'get_day_node',
    {
      title: 'Get day node',
      description: 'Get or create the deterministic daily-note node for a date.',
      inputSchema: GetDayNodeInputSchema,
    },
    (input) =>
      runTool(async () => {
        const { getOrCreateDayNode } = await import('@nxus/node-api/server')
        return await getOrCreateDayNode({ date: input.date })
      }),
  )

  return server
}
