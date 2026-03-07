import { describe, it, expect, beforeEach } from 'vitest'
import { setAiClient } from '../lib/ai-client.js'
import type { AiClient } from '../lib/ai-client.js'
import { generateQuestion, type QuestionGeneratorInput } from './question-generator.js'

/**
 * Mock that returns a valid shape for whichever schema the generator picks.
 * The schema itself determines the question type, so we provide data for all variants.
 */
const MOCK_DATA_BY_TYPE: Record<string, unknown> = {
  'free-response': {
    questionText: 'How would you use closures?',
    questionType: 'free-response',
    modelAnswer: 'Closures capture variables from enclosing scope.',
    hints: ['Think about scope'],
  },
  'multiple-choice': {
    questionText: 'Which describes a closure?',
    questionType: 'multiple-choice',
    modelAnswer: 'A function that captures scope.',
    hints: ['Think about scope'],
    choices: ['Captures scope', 'Runs immediately', 'A class', 'A loop'],
    correctIndex: 0,
  },
  'true-false': {
    questionText: 'Closures can access parent scope.',
    questionType: 'true-false',
    modelAnswer: 'True — closures capture enclosing scope.',
    hints: ['Think about lexical scoping'],
    correctAnswer: true,
  },
  'fill-blank': {
    questionText: 'A closure ___ variables from its enclosing scope.',
    questionType: 'fill-blank',
    modelAnswer: 'Captures — closures retain references.',
    hints: ['Think about what closures do'],
    blankAnswer: 'captures',
  },
}

function schemaAwareMockClient(): AiClient {
  return {
    async generateStructured(options) {
      // Try each variant until one parses
      for (const data of Object.values(MOCK_DATA_BY_TYPE)) {
        try {
          return options.schema.parse(data)
        } catch {
          continue
        }
      }
      throw new Error('No mock data matched the schema')
    },
  }
}

function promptCapturingClient(): { getPrompt: () => string; client: AiClient } {
  let capturedPrompt = ''
  return {
    getPrompt: () => capturedPrompt,
    client: {
      async generateStructured(options) {
        capturedPrompt = options.prompt
        for (const data of Object.values(MOCK_DATA_BY_TYPE)) {
          try {
            return options.schema.parse(data)
          } catch {
            continue
          }
        }
        throw new Error('No mock data matched the schema')
      },
    },
  }
}

const sampleInput: QuestionGeneratorInput = {
  conceptTitle: 'Closures',
  conceptSummary: 'A closure captures variables from its enclosing scope.',
  bloomsLevel: 'apply',
  adjacentConcepts: [
    { title: 'Scope', summary: 'Variable visibility rules in JavaScript.' },
  ],
}

describe('generateQuestion', () => {
  beforeEach(() => {
    setAiClient(null)
  })

  it('returns a valid question with correct common fields', async () => {
    setAiClient(schemaAwareMockClient())

    const result = await generateQuestion({
      ...sampleInput,
      currentBloomsLevel: 'apply',
    })

    expect(result.questionText).toBeDefined()
    expect(result.questionType).toBeDefined()
    expect(result.modelAnswer).toBeDefined()
    expect(result.hints).toBeDefined()
  })

  it('returns a question type appropriate for the blooms level', async () => {
    setAiClient(schemaAwareMockClient())

    // remember → multiple-choice or true-false
    const result = await generateQuestion({
      ...sampleInput,
      currentBloomsLevel: 'remember',
    })
    expect(['multiple-choice', 'true-false']).toContain(result.questionType)
  })

  it('includes adjacent concepts in the prompt', async () => {
    const { getPrompt, client } = promptCapturingClient()
    setAiClient(client)

    await generateQuestion({ ...sampleInput, currentBloomsLevel: 'apply' })

    expect(getPrompt()).toContain('Scope')
    expect(getPrompt()).toContain('Variable visibility rules')
  })

  it('uses currentBloomsLevel over bloomsLevel in prompt', async () => {
    const { getPrompt, client } = promptCapturingClient()
    setAiClient(client)

    await generateQuestion({
      ...sampleInput,
      bloomsLevel: 'analyze',
      currentBloomsLevel: 'understand',
    })

    expect(getPrompt()).toContain("Bloom's Level: understand")
  })

  it('handles empty adjacent concepts', async () => {
    const { getPrompt, client } = promptCapturingClient()
    setAiClient(client)

    await generateQuestion({
      ...sampleInput,
      adjacentConcepts: [],
      currentBloomsLevel: 'apply',
    })

    expect(getPrompt()).not.toContain('Adjacent concepts')
  })

  it('defaults to remember when no blooms level provided', async () => {
    const { getPrompt, client } = promptCapturingClient()
    setAiClient(client)

    await generateQuestion({
      ...sampleInput,
      bloomsLevel: null,
      currentBloomsLevel: null,
    })

    expect(getPrompt()).toContain("Bloom's Level: remember")
  })

  it('rejects if AI returns invalid shape', async () => {
    setAiClient({
      async generateStructured(options) {
        return options.schema.parse({ questionText: 123 })
      },
    })

    await expect(
      generateQuestion({ ...sampleInput, currentBloomsLevel: 'apply' }),
    ).rejects.toThrow()
  })
})
