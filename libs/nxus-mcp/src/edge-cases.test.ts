import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { CallToolResultSchema, type CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { nxusActions } from '@nxus/actions'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createNxusMcpServer } from './index.js'

const ToolContentTextSchema = z.object({
  type: z.literal('text'),
  text: z.string().min(1),
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

const SetFieldResultSchema = z.object({
  node: CompactNodeSchema,
})

const ReadNodeResultSchema = z.object({
  node: z.object({
    id: z.string(),
    content: z.string().nullable(),
  }).passthrough(),
  children: z.array(CompactNodeSchema),
})

const ImportTifResultSchema = z.object({
  summary: z.object({
    topLevelNodeIds: z.array(z.string()),
  }).passthrough(),
})

const TIF_FIXTURE = {
  version: 'TanaIntermediateFile V0.1',
  summary: {
    leafNodes: 0,
    topLevelNodes: 1,
    totalNodes: 1,
    calendarNodes: 0,
    fields: 0,
    brokenRefs: 0,
  },
  attributes: [],
  nodes: [
    {
      uid: 'edge-root',
      name: 'Edge Imported Root',
      type: 'node',
      createdAt: 1_700_000_000_000,
      editedAt: 1_700_000_000_000,
    },
  ],
}

interface ClientSession {
  client: Client
  server: ReturnType<typeof createNxusMcpServer>
}

interface MalformedCase {
  actionName: string
  argumentsValue: Record<string, unknown>
}

let tempDir: string

async function createClient(): Promise<ClientSession> {
  const server = createNxusMcpServer()
  const client = new Client({ name: 'nxus-mcp-edge-test', version: '0.1.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  return { client, server }
}

async function callRawTool(
  client: Client,
  name: string,
  argumentsValue: Record<string, unknown>,
): Promise<CallToolResult> {
  return CallToolResultSchema.parse(
    await client.callTool({ name, arguments: argumentsValue }),
  )
}

function toolText(result: CallToolResult): string {
  const firstContent = result.content[0]
  return ToolContentTextSchema.parse(firstContent).text
}

async function expectToolError(
  client: Client,
  name: string,
  argumentsValue: Record<string, unknown>,
  expected: RegExp,
): Promise<string> {
  const result = await callRawTool(client, name, argumentsValue)
  expect(result.isError).toBe(true)
  expect(result.structuredContent).toBeUndefined()
  const text = toolText(result)
  expect(text).toMatch(expected)
  return text
}

async function callTool(
  client: Client,
  name: string,
  argumentsValue: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await callRawTool(client, name, argumentsValue)
  if (result.isError) {
    throw new Error(toolText(result))
  }
  if (!result.structuredContent) {
    throw new Error(`Tool ${name} returned no structuredContent`)
  }
  return result.structuredContent
}

describe('nxus MCP edge cases', () => {
  beforeAll(() => {
    tempDir = join(tmpdir(), `nxus-mcp-edge-${process.pid}`)
    mkdirSync(tempDir, { recursive: true })
    process.env.NXUS_DB_PATH = join(tempDir, 'nxus.db')
    process.env.ARCHITECTURE_TYPE = 'node'
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.NXUS_DB_PATH
    delete process.env.ARCHITECTURE_TYPE
  })

  it.each<MalformedCase>([
    { actionName: 'create_node', argumentsValue: {} },
    { actionName: 'create_node', argumentsValue: { content: '' } },
    { actionName: 'create_node', argumentsValue: { content: 123 } },
    { actionName: 'create_node', argumentsValue: { content: null } },
    { actionName: 'create_node', argumentsValue: { content: 'extra', extra: true } },
    { actionName: 'read_node', argumentsValue: {} },
    { actionName: 'read_node', argumentsValue: { nodeId: 123 } },
    { actionName: 'read_node', argumentsValue: { nodeId: '' } },
    { actionName: 'read_node', argumentsValue: { nodeId: null } },
    { actionName: 'read_node', argumentsValue: { nodeId: 'missing', extra: true } },
    { actionName: 'search_nodes', argumentsValue: {} },
    { actionName: 'search_nodes', argumentsValue: { query: null } },
    { actionName: 'search_nodes', argumentsValue: { query: { filters: [] }, limit: 0 } },
    { actionName: 'search_nodes', argumentsValue: { query: { filters: [] }, extra: true } },
    { actionName: 'tag_node', argumentsValue: {} },
    { actionName: 'tag_node', argumentsValue: { nodeId: 123, supertag: 'supertag:task' } },
    { actionName: 'tag_node', argumentsValue: { nodeId: 'node', supertag: '' } },
    { actionName: 'tag_node', argumentsValue: { nodeId: 'node', supertag: null } },
    { actionName: 'tag_node', argumentsValue: { nodeId: 'node', supertag: 'supertag:task', extra: true } },
    { actionName: 'untag_node', argumentsValue: {} },
    { actionName: 'untag_node', argumentsValue: { nodeId: 123, supertag: 'supertag:task' } },
    { actionName: 'untag_node', argumentsValue: { nodeId: 'node', supertag: '' } },
    { actionName: 'untag_node', argumentsValue: { nodeId: 'node', supertag: null } },
    { actionName: 'untag_node', argumentsValue: { nodeId: 'node', supertag: 'supertag:task', extra: true } },
    { actionName: 'set_field', argumentsValue: {} },
    { actionName: 'set_field', argumentsValue: { nodeId: 123, fieldId: 'field:status', value: 'active' } },
    { actionName: 'set_field', argumentsValue: { nodeId: 'node', fieldId: '', value: 'active' } },
    { actionName: 'set_field', argumentsValue: { nodeId: 'node', fieldId: 'field:status', value: undefined } },
    { actionName: 'set_field', argumentsValue: { nodeId: 'node', fieldId: 'field:status', value: 'active', extra: true } },
    { actionName: 'get_tag_schema', argumentsValue: {} },
    { actionName: 'get_tag_schema', argumentsValue: { tag: 123 } },
    { actionName: 'get_tag_schema', argumentsValue: { tag: '' } },
    { actionName: 'get_tag_schema', argumentsValue: { tag: null } },
    { actionName: 'get_tag_schema', argumentsValue: { tag: 'supertag:task', extra: true } },
    { actionName: 'list_tags', argumentsValue: { extra: true } },
    { actionName: 'get_day_node', argumentsValue: {} },
    { actionName: 'get_day_node', argumentsValue: { date: 123 } },
    { actionName: 'get_day_node', argumentsValue: { date: '' } },
    { actionName: 'get_day_node', argumentsValue: { date: null } },
    { actionName: 'get_day_node', argumentsValue: { date: '2026-07-11', extra: true } },
    { actionName: 'import_tif', argumentsValue: {} },
    { actionName: 'import_tif', argumentsValue: { json: 123 } },
    { actionName: 'import_tif', argumentsValue: { json: '' } },
    { actionName: 'import_tif', argumentsValue: { json: null } },
    { actionName: 'import_tif', argumentsValue: { json: JSON.stringify(TIF_FIXTURE), extra: true } },
    { actionName: 'export_subtree', argumentsValue: { rootNodeId: 123 } },
    { actionName: 'export_subtree', argumentsValue: { rootNodeId: '' } },
    { actionName: 'export_subtree', argumentsValue: { rootNodeId: null } },
    { actionName: 'export_subtree', argumentsValue: { extra: true } },
  ])('surfaces malformed input as MCP isError for $actionName', async ({ actionName, argumentsValue }) => {
    const { client, server } = await createClient()
    try {
      await expectToolError(client, actionName, argumentsValue, /expected|invalid|too small|unrecognized|required/i)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('returns clean errors for nonexistent node and tag references', async () => {
    const { client, server } = await createClient()
    try {
      const missingNodeId = 'node:does-not-exist'
      await expectToolError(client, 'read_node', { nodeId: missingNodeId }, /Node not found: node:does-not-exist/)
      await expectToolError(client, 'tag_node', { nodeId: missingNodeId, supertag: 'supertag:task' }, /Node not found: node:does-not-exist/)
      await expectToolError(client, 'untag_node', { nodeId: missingNodeId, supertag: 'supertag:task' }, /Node not found: node:does-not-exist/)
      await expectToolError(client, 'set_field', { nodeId: missingNodeId, fieldId: 'field:status', value: 'active' }, /Node not found: node:does-not-exist/)
      await expectToolError(client, 'export_subtree', { rootNodeId: missingNodeId }, /Node not found: node:does-not-exist/)

      const created = CreateNodeResultSchema.parse(await callTool(client, 'create_node', {
        content: 'Tag target',
      }))
      await expectToolError(client, 'tag_node', { nodeId: created.nodeId, supertag: 'not-a-real-tag' }, /Supertag not found: not-a-real-tag/)
      await expectToolError(client, 'tag_node', { nodeId: created.nodeId, supertag: 'supertag:not-real' }, /Supertag not found: supertag:not-real/)
      await expectToolError(client, 'get_tag_schema', { tag: 'not-a-real-tag' }, /Supertag not found: not-a-real-tag/)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('preserves long, unicode, and mention-like content without resolving bogus mentions', async () => {
    const { client, server } = await createClient()
    try {
      const longContent = `${'x'.repeat(100_000)} unicode \u2728 emoji \u{1F680} [[node:not-real]]`
      const created = CreateNodeResultSchema.parse(await callTool(client, 'create_node', {
        content: longContent,
      }))
      expect(created.node.content).toBe(longContent)

      const read = ReadNodeResultSchema.parse(await callTool(client, 'read_node', {
        nodeId: created.nodeId,
      }))
      expect(read.node.content).toBe(longContent)
      expect(read.children).toEqual([])
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('returns clean import_tif errors for malformed JSON and unsupported versions', async () => {
    const { client, server } = await createClient()
    try {
      await expectToolError(client, 'import_tif', { json: '{' }, /Invalid TIF JSON/)
      await expectToolError(client, 'import_tif', {
        json: JSON.stringify({ ...TIF_FIXTURE, version: 'TanaIntermediateFile V9' }),
      }, /Unsupported TIF version: TanaIntermediateFile V9/)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('keeps cheap idempotent operations consistent', async () => {
    const { client, server } = await createClient()
    try {
      const created = CreateNodeResultSchema.parse(await callTool(client, 'create_node', {
        content: 'Idempotent edge node',
      }))

      const untagged = z.object({ removed: z.boolean(), node: CompactNodeSchema }).parse(
        await callTool(client, 'untag_node', {
          nodeId: created.nodeId,
          supertag: 'supertag:task',
        }),
      )
      expect(untagged.removed).toBe(false)

      const first = SetFieldResultSchema.parse(await callTool(client, 'set_field', {
        nodeId: created.nodeId,
        fieldId: 'field:status',
        value: 'stable',
      }))
      const second = SetFieldResultSchema.parse(await callTool(client, 'set_field', {
        nodeId: created.nodeId,
        fieldId: 'field:status',
        value: 'stable',
      }))

      expect(first.node.fields.status).toEqual(['stable'])
      expect(second.node.fields.status).toEqual(['stable'])
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('keeps every registered action error envelope explicit and non-empty', async () => {
    const malformedByActionName = new Map<string, Record<string, unknown>>([
      ['create_node', {}],
      ['read_node', {}],
      ['search_nodes', {}],
      ['tag_node', {}],
      ['untag_node', {}],
      ['set_field', {}],
      ['get_tag_schema', {}],
      ['list_tags', { extra: true }],
      ['get_day_node', {}],
      ['import_tif', {}],
      ['export_subtree', { extra: true }],
    ])
    const { client, server } = await createClient()
    try {
      for (const action of nxusActions) {
        const argumentsValue = malformedByActionName.get(action.name)
        if (!argumentsValue) {
          throw new Error(`Missing malformed input for action: ${action.name}`)
        }
        const result = await callRawTool(client, action.name, argumentsValue)
        expect(result.isError, action.name).toBe(true)
        expect(toolText(result), action.name).toMatch(/\S/)
      }
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('imports a valid TIF after rejecting invalid boundaries', async () => {
    const { client, server } = await createClient()
    try {
      const imported = ImportTifResultSchema.parse(await callTool(client, 'import_tif', {
        json: JSON.stringify(TIF_FIXTURE),
      }))
      expect(imported.summary.topLevelNodeIds).toHaveLength(1)
    } finally {
      await client.close()
      await server.close()
    }
  })
})
