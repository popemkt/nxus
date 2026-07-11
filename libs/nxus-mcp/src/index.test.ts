import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolResultSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createNxusMcpServer } from './index.js'

const ToolContentTextSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
})

const CompactNodeSchema = z.object({
  id: z.string(),
  content: z.string().nullable(),
  supertags: z.array(z.object({
    id: z.string(),
    content: z.string(),
    systemId: z.string().nullable(),
  })),
  fields: z.record(z.string(), z.array(z.unknown())),
})

const CreateNodeResultSchema = z.object({
  nodeId: z.string(),
  node: CompactNodeSchema,
})

const ReadNodeResultSchema = z.object({
  node: z.object({
    id: z.string(),
    content: z.string().nullable(),
  }).passthrough(),
  children: z.array(CompactNodeSchema),
})

const SearchNodesResultSchema = z.object({
  nodes: z.array(CompactNodeSchema),
  totalCount: z.number(),
  evaluatedAt: z.string(),
})

const ListTagsResultSchema = z.object({
  tags: z.array(z.object({
    id: z.string(),
    systemId: z.string().nullable(),
    content: z.string().nullable(),
    baseType: z.unknown(),
  })),
})

const GetTagSchemaResultSchema = z.object({
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
    inheritedFrom: z.unknown(),
  })),
})

const ImportTifResultSchema = z.object({
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

const ExportSubtreeResultSchema = z.object({
  tif: z.object({
    version: z.literal('TanaIntermediateFile V0.1'),
    summary: z.object({
      totalNodes: z.number(),
      topLevelNodes: z.number(),
    }).passthrough(),
    nodes: z.array(z.object({
      uid: z.string(),
      name: z.string(),
      type: z.string(),
    }).passthrough()),
  }).passthrough(),
})

const DayNodeResultSchema = z.object({
  success: z.literal(true),
  nodeId: z.string(),
  created: z.boolean(),
})

const TIF_FIXTURE = {
  version: 'TanaIntermediateFile V0.1',
  summary: {
    leafNodes: 1,
    topLevelNodes: 1,
    totalNodes: 2,
    calendarNodes: 0,
    fields: 1,
    brokenRefs: 0,
  },
  attributes: [{ name: 'Status', values: ['open'], count: 1, dataType: 'any' }],
  nodes: [
    {
      uid: 'root',
      name: 'Imported Project',
      type: 'node',
      createdAt: 1_700_000_000_000,
      editedAt: 1_700_000_000_000,
      children: [
        {
          uid: 'field-status',
          name: 'Status',
          type: 'field',
          createdAt: 1_700_000_000_000,
          editedAt: 1_700_000_000_000,
          children: [
            {
              uid: 'field-status-value',
              name: 'open',
              type: 'node',
              createdAt: 1_700_000_000_000,
              editedAt: 1_700_000_000_000,
            },
          ],
        },
        {
          uid: 'child',
          name: 'Imported Child',
          type: 'node',
          createdAt: 1_700_000_000_000,
          editedAt: 1_700_000_000_000,
        },
      ],
    },
  ],
}

let tempDir: string

async function createClient() {
  const server = createNxusMcpServer()
  const client = new Client({ name: 'nxus-mcp-test', version: '0.1.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, server }
}

function toolText(result: CallToolResult): string {
  const firstContent = result.content[0]
  return ToolContentTextSchema.parse(firstContent).text
}

async function callTool(
  client: Client,
  name: string,
  argumentsValue: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = CallToolResultSchema.parse(
    await client.callTool({ name, arguments: argumentsValue }),
  )
  if (result.isError) {
    throw new Error(toolText(result))
  }
  if (!result.structuredContent) {
    throw new Error(`Tool ${name} returned no structuredContent`)
  }
  return result.structuredContent
}

describe('nxus MCP server', () => {
  beforeAll(() => {
    tempDir = join(tmpdir(), `nxus-mcp-${process.pid}`)
    mkdirSync(tempDir, { recursive: true })
    process.env.NXUS_DB_PATH = join(tempDir, 'nxus.db')
    process.env.ARCHITECTURE_TYPE = 'node'
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.NXUS_DB_PATH
    delete process.env.ARCHITECTURE_TYPE
  })

  it('runs create -> tag -> set_field -> read -> search and tag schema through MCP', async () => {
    const { client, server } = await createClient()
    try {
      const created = CreateNodeResultSchema.parse(await callTool(client, 'create_node', {
        content: 'MCP Roundtrip Node',
        supertag: 'supertag:item',
      }))

      const tagged = z.object({ added: z.boolean(), node: CompactNodeSchema }).parse(
        await callTool(client, 'tag_node', {
          nodeId: created.nodeId,
          supertag: 'supertag:task',
        }),
      )
      expect(tagged.added).toBe(true)

      const setField = z.object({ node: CompactNodeSchema }).parse(
        await callTool(client, 'set_field', {
          nodeId: created.nodeId,
          fieldId: 'field:status',
          value: 'active',
        }),
      )
      expect(setField.node.fields.status).toEqual(['active'])

      const read = ReadNodeResultSchema.parse(await callTool(client, 'read_node', {
        nodeId: created.nodeId,
      }))
      expect(read.node.content).toBe('MCP Roundtrip Node')
      expect(read.children).toEqual([])

      const search = SearchNodesResultSchema.parse(await callTool(client, 'search_nodes', {
        query: {
          filters: [{ type: 'content', query: 'MCP Roundtrip', caseSensitive: false }],
          limit: 10,
        },
      }))
      expect(search.nodes.map((node) => node.id)).toContain(created.nodeId)

      const tags = ListTagsResultSchema.parse(await callTool(client, 'list_tags', {}))
      expect(tags.tags.some((tag) => tag.systemId === 'supertag:task')).toBe(true)

      const schema = GetTagSchemaResultSchema.parse(
        await callTool(client, 'get_tag_schema', { tag: 'supertag:task' }),
      )
      expect(schema.tag.systemId).toBe('supertag:task')

      const untagged = z.object({ removed: z.boolean(), node: CompactNodeSchema }).parse(
        await callTool(client, 'untag_node', {
          nodeId: created.nodeId,
          supertag: 'supertag:task',
        }),
      )
      expect(untagged.removed).toBe(true)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('imports TIF and exports the imported subtree through MCP', async () => {
    const { client, server } = await createClient()
    try {
      const imported = ImportTifResultSchema.parse(await callTool(client, 'import_tif', {
        json: JSON.stringify(TIF_FIXTURE),
      }))
      expect(imported.summary.topLevelNodeIds).toHaveLength(1)

      const exported = ExportSubtreeResultSchema.parse(
        await callTool(client, 'export_subtree', {
          rootNodeId: imported.summary.topLevelNodeIds[0],
        }),
      )
      expect(exported.tif.nodes[0].name).toBe('Imported Project')
      expect(exported.tif.summary.totalNodes).toBeGreaterThanOrEqual(2)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('gets day nodes idempotently through MCP', async () => {
    const { client, server } = await createClient()
    try {
      const first = DayNodeResultSchema.parse(await callTool(client, 'get_day_node', {
        date: '2026-07-11',
      }))
      const second = DayNodeResultSchema.parse(await callTool(client, 'get_day_node', {
        date: '2026-07-11',
      }))

      expect(first.created).toBe(true)
      expect(second.created).toBe(false)
      expect(second.nodeId).toBe(first.nodeId)
    } finally {
      await client.close()
      await server.close()
    }
  })
})
