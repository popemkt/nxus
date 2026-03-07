import { describe, it, expect, beforeEach } from 'vitest'
import { z } from 'zod'
import { getAiClient, setAiClient, type AiClient } from './ai-client.js'

function createMockClient(
  handler: (options: { schema: z.ZodType; system: string; prompt: string }) => unknown,
): AiClient {
  return {
    async generateStructured(options) {
      const raw = handler(options)
      return options.schema.parse(raw)
    },
  }
}

describe('ai-client facade', () => {
  beforeEach(() => {
    // Reset to default client between tests
    setAiClient(null)
  })

  it('getAiClient returns a client', () => {
    const client = getAiClient()
    expect(client).toBeDefined()
    expect(typeof client.generateStructured).toBe('function')
  })

  it('setAiClient overrides the default client', () => {
    const mock = createMockClient(() => ({ name: 'test' }))
    setAiClient(mock)

    expect(getAiClient()).toBe(mock)
  })

  it('generateStructured parses output through Zod schema', async () => {
    const schema = z.object({ answer: z.string(), score: z.number() })
    const expected = { answer: 'hello', score: 42 }

    const mock = createMockClient(() => expected)
    setAiClient(mock)

    const result = await getAiClient().generateStructured({
      schema,
      system: 'test system',
      prompt: 'test prompt',
    })

    expect(result).toEqual(expected)
  })

  it('generateStructured rejects when output fails Zod validation', async () => {
    const schema = z.object({ answer: z.string(), score: z.number() })

    const mock = createMockClient(() => ({ answer: 123, score: 'not a number' }))
    setAiClient(mock)

    await expect(
      getAiClient().generateStructured({
        schema,
        system: 'test',
        prompt: 'test',
      }),
    ).rejects.toThrow()
  })

  it('generateStructured passes system and prompt to the handler', async () => {
    const schema = z.object({ ok: z.boolean() })
    let capturedSystem = ''
    let capturedPrompt = ''

    const mock = createMockClient((opts) => {
      capturedSystem = opts.system
      capturedPrompt = opts.prompt
      return { ok: true }
    })
    setAiClient(mock)

    await getAiClient().generateStructured({
      schema,
      system: 'You are a test agent',
      prompt: 'Do the thing',
    })

    expect(capturedSystem).toBe('You are a test agent')
    expect(capturedPrompt).toBe('Do the thing')
  })
})
