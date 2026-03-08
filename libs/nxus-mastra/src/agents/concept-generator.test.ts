import { describe, it, expect, beforeEach } from 'vitest'
import { setAiClient, type AiClient } from '../lib/ai-client.js'
import { generateConcepts } from './concept-generator.js'

function mockAiClient(returnValue: unknown): AiClient {
  return {
    async generateStructured(options) {
      return options.schema.parse(returnValue)
    },
  }
}

const validConcepts = {
  concepts: [
    {
      title: 'Closures',
      summary: 'A closure captures variables from its enclosing scope.',
      whyItMatters: 'Enables data privacy and factory patterns.',
      bloomsLevel: 'apply' as const,
      relatedConceptTitles: ['Scope'],
    },
    {
      title: 'Scope',
      summary: 'Rules governing variable visibility.',
      whyItMatters: 'Foundation of variable management.',
      bloomsLevel: 'understand' as const,
      relatedConceptTitles: ['Closures'],
    },
    {
      title: 'Hoisting',
      summary: 'Variable declarations are moved to the top of their scope.',
      whyItMatters: 'Prevents unexpected undefined values.',
      bloomsLevel: 'remember' as const,
      relatedConceptTitles: ['Scope'],
    },
  ],
}

describe('generateConcepts', () => {
  beforeEach(() => {
    setAiClient(null)
  })

  it('returns valid concepts matching ConceptGenerationResultSchema', async () => {
    setAiClient(mockAiClient(validConcepts))

    const result = await generateConcepts('JavaScript Fundamentals')

    expect(result.concepts).toHaveLength(3)
    expect(result.concepts[0].title).toBe('Closures')
    expect(result.concepts[0].bloomsLevel).toBe('apply')
  })

  it('includes the topic in the prompt', async () => {
    let capturedPrompt = ''
    setAiClient({
      async generateStructured(options) {
        capturedPrompt = options.prompt
        return options.schema.parse(validConcepts)
      },
    })

    await generateConcepts('Rust Ownership')

    expect(capturedPrompt).toContain('Rust Ownership')
  })

  it('rejects fewer than 3 concepts', async () => {
    setAiClient(
      mockAiClient({
        concepts: [validConcepts.concepts[0], validConcepts.concepts[1]],
      }),
    )

    await expect(generateConcepts('test')).rejects.toThrow()
  })

  it('rejects invalid blooms level', async () => {
    setAiClient(
      mockAiClient({
        concepts: [
          { ...validConcepts.concepts[0], bloomsLevel: 'invalid' },
          validConcepts.concepts[1],
          validConcepts.concepts[2],
        ],
      }),
    )

    await expect(generateConcepts('test')).rejects.toThrow()
  })
})
