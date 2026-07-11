import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAction } from './define-action.js'
import { getAction, nxusActions } from './registry.js'
import { CreateNodeOutputSchema, ReadNodeOutputSchema } from './schemas.js'

const badInputsByActionName: Record<string, unknown> = {
  search_nodes: { query: { filters: [] }, limit: 0 },
  read_node: { nodeId: '' },
  create_node: { content: 'bad field node', fields: { status: 'active' } },
  set_field: { nodeId: '', fieldId: 'status', value: 'active' },
  tag_node: { nodeId: '', supertag: '' },
  untag_node: { nodeId: '', supertag: '' },
  list_tags: null,
  get_tag_schema: { tag: '' },
  import_tif: { json: '' },
  export_subtree: { rootNodeId: 42 },
  get_day_node: { date: '07-11-2026' },
}

let tempDir: string

describe('nxus action registry', () => {
  beforeAll(() => {
    tempDir = join(tmpdir(), `nxus-actions-${process.pid}`)
    mkdirSync(tempDir, { recursive: true })
    process.env.NXUS_DB_PATH = join(tempDir, 'nxus.db')
    process.env.ARCHITECTURE_TYPE = 'node'
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.NXUS_DB_PATH
    delete process.env.ARCHITECTURE_TYPE
  })

  it('has unique named actions with descriptions and schemas', () => {
    const names = nxusActions.map((action) => action.name)
    expect(new Set(names).size).toBe(names.length)
    for (const action of nxusActions) {
      expect(action.name).toMatch(/\S/)
      expect(action.description).toMatch(/\S/)
      expect(action.input).toBeInstanceOf(z.ZodType)
      expect(action.output).toBeInstanceOf(z.ZodType)
      expect(getAction(action.name)).toBe(action)
    }
  })

  it.each(nxusActions)('rejects malformed input for $name', async (action) => {
    await expect(action.handler(badInputsByActionName[action.name])).rejects.toThrow()
  })

  it('validates handler output shape', async () => {
    const invalidAction = defineAction({
      name: 'test_invalid_output',
      description: 'Test-only invalid output action.',
      input: z.object({ ok: z.literal(true) }),
      output: z.object({ count: z.number().int() }),
      handler: async () => ({ count: 1.5 }),
    })

    await expect(invalidAction.handler({ ok: true })).rejects.toThrow()
  })

  it('runs create-node -> read-node through the registry directly', async () => {
    const createNode = getAction('create_node')
    const readNode = getAction('read_node')
    if (!createNode || !readNode) {
      throw new Error('Expected create_node and read_node actions to exist')
    }

    const created = CreateNodeOutputSchema.parse(await createNode.handler({
      content: 'Registry Smoke Node',
    }))
    const read = ReadNodeOutputSchema.parse(await readNode.handler({
      nodeId: created.nodeId,
    }))

    expect(read.node.content).toBe('Registry Smoke Node')
    expect(read.children).toEqual([])
  })
})
