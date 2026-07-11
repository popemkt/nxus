import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { getAction, nxusActions } from './registry.js'

const malformedByActionName: Record<string, unknown> = {
  create_node: null,
  read_node: null,
  search_nodes: null,
  tag_node: null,
  untag_node: null,
  set_field: null,
  get_tag_schema: null,
  list_tags: null,
  get_day_node: null,
  import_tif: null,
  export_subtree: null,
}

let tempDir: string

describe('nxus action edge cases', () => {
  beforeAll(() => {
    tempDir = join(tmpdir(), `nxus-actions-edge-${process.pid}`)
    mkdirSync(tempDir, { recursive: true })
    process.env.NXUS_DB_PATH = join(tempDir, 'nxus.db')
    process.env.ARCHITECTURE_TYPE = 'node'
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.NXUS_DB_PATH
    delete process.env.ARCHITECTURE_TYPE
  })

  it.each(nxusActions)('rejects null top-level input for $name', async (action) => {
    await expect(action.handler(malformedByActionName[action.name])).rejects.toThrow()
  })

  it('ACT-B1: rejects extra unknown keys directly at action schemas', async () => {
    const createNode = getAction('create_node')
    if (!createNode) {
      throw new Error('Expected create_node action to exist')
    }

    await expect(createNode.handler({
      content: 'schema strictness',
      extra: true,
    })).rejects.toThrow(/unrecognized/i)
  })
})
