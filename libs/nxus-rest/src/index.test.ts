import { nxusActions } from '@nxus/actions'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dispatchNxusRestRequest, handleNxusRestRequest } from './index.js'

let tempDir: string

async function call(request: Request): Promise<{ response: Response; body: Record<string, unknown> }> {
  const response = await handleNxusRestRequest(request)
  return { response, body: await response.json() as Record<string, unknown> }
}

describe('nxus REST adapter', () => {
  beforeAll(() => {
    tempDir = join(tmpdir(), `nxus-rest-${process.pid}`)
    mkdirSync(tempDir, { recursive: true })
    process.env.NXUS_DB_PATH = join(tempDir, 'nxus.db')
    process.env.ARCHITECTURE_TYPE = 'node'
  })

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true })
    delete process.env.NXUS_DB_PATH
    delete process.env.ARCHITECTURE_TYPE
  })

  it('REST-B1: lists every registered action with its input JSON schema', async () => {
    const { response, body } = await call(new Request('http://nxus.test/actions'))
    expect(response.status).toBe(200)
    expect(body.success).toBe(true)

    const data = body.data as { actions: Array<{ name: string; inputSchema: Record<string, unknown> }> }
    expect(data.actions.map((action) => action.name).sort()).toEqual(
      nxusActions.map((action) => action.name).sort(),
    )
    expect(data.actions.find((action) => action.name === 'create_node')?.inputSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    })
  })

  it('REST-B2: dispatches a registered action through the fetch handler', async () => {
    const { response, body } = await call(new Request('http://nxus.test/actions/create_node', {
      method: 'POST',
      body: JSON.stringify({ content: 'REST Roundtrip Node' }),
    }))

    expect(response.status).toBe(200)
    expect(body.success).toBe(true)
    expect((body.data as { node: { content: string } }).node.content).toBe('REST Roundtrip Node')
  })

  it('REST-B4: returns 404 (not a crash) for malformed percent-encoding in the action id', async () => {
    const { response, body } = await call(new Request('http://nxus.test/actions/%', {
      method: 'POST',
      body: '{}',
    }))
    expect(response.status).toBe(404)
    expect(body).toEqual({ success: false, error: 'Route not found' })
  })

  it('REST-B6: returns 405 for non-POST methods on an action path', async () => {
    const { response } = await call(new Request('http://nxus.test/actions/create_node'))
    expect(response.status).toBe(405)
  })

  it('REST-B4: returns 404 for an unknown action', async () => {
    const { response, body } = await call(new Request('http://nxus.test/actions/not_real', {
      method: 'POST',
      body: '{}',
    }))
    expect(response.status).toBe(404)
    expect(body).toEqual({ success: false, error: 'Action not found: not_real' })
  })

  it('REST-B3: returns 400 for malformed JSON, missing fields, and strict-schema extra keys', async () => {
    const malformed = await call(new Request('http://nxus.test/actions/create_node', {
      method: 'POST',
      body: '{',
    }))
    expect(malformed.response.status).toBe(400)
    expect(malformed.body).toEqual({ success: false, error: 'Malformed JSON body' })

    for (const input of [{}, { content: 'strict input', extra: true }]) {
      const result = await call(new Request('http://nxus.test/actions/create_node', {
        method: 'POST',
        body: JSON.stringify(input),
      }))
      expect(result.response.status).toBe(400)
      expect(result.body.success).toBe(false)
      expect(result.body.error).toMatch(/expected|unrecognized/i)
    }
  })

  it('REST-B5: maps named reference failures to 404 and other execution failures to 422', async () => {
    const missingNode = await call(new Request('http://nxus.test/actions/read_node', {
      method: 'POST',
      body: JSON.stringify({ nodeId: 'node:does-not-exist' }),
    }))
    expect(missingNode.response.status).toBe(404)
    expect(missingNode.body).toEqual({ success: false, error: 'Node not found: node:does-not-exist' })

    const invalidTif = await dispatchNxusRestRequest({
      method: 'POST',
      path: '/actions/import_tif',
      body: { json: '{' },
    })
    expect(invalidTif.status).toBe(422)
    expect(invalidTif.body).toEqual({ success: false, error: expect.stringMatching(/Invalid TIF JSON/) })
  })
})
