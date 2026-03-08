import { describe, it, expect, beforeEach } from 'vitest'
import { setAiClient, type AiClient } from '../lib/ai-client.js'
import { evaluateAnswer, type AnswerEvaluatorInput } from './answer-evaluator.js'

function mockAiClient(returnValue: unknown): AiClient {
  return {
    async generateStructured(options) {
      return options.schema.parse(returnValue)
    },
  }
}

const sampleInput: AnswerEvaluatorInput = {
  questionText: 'What is a closure?',
  modelAnswer: 'A closure captures variables from its enclosing scope.',
  userAnswer: 'A closure is a function that remembers its scope.',
  conceptTitle: 'Closures',
}

const validEvaluation = {
  rating: 'good' as const,
  score: 72,
  feedback: 'Good understanding of the core concept.',
  keyInsightsMissed: ['Did not mention variable capture explicitly'],
  strongPoints: ['Understands scope retention'],
}

describe('evaluateAnswer', () => {
  beforeEach(() => {
    setAiClient(null)
  })

  it('returns a valid evaluation matching AnswerEvaluationSchema', async () => {
    setAiClient(mockAiClient(validEvaluation))

    const result = await evaluateAnswer(sampleInput)

    expect(result.rating).toBe('good')
    expect(result.score).toBe(72)
    expect(result.feedback).toBeDefined()
    expect(result.keyInsightsMissed).toHaveLength(1)
    expect(result.strongPoints).toHaveLength(1)
  })

  it('includes all input fields in the prompt', async () => {
    let capturedPrompt = ''
    setAiClient({
      async generateStructured(options) {
        capturedPrompt = options.prompt
        return options.schema.parse(validEvaluation)
      },
    })

    await evaluateAnswer(sampleInput)

    expect(capturedPrompt).toContain('Closures')
    expect(capturedPrompt).toContain('What is a closure?')
    expect(capturedPrompt).toContain(sampleInput.modelAnswer)
    expect(capturedPrompt).toContain(sampleInput.userAnswer)
  })

  it('rejects invalid rating values', async () => {
    setAiClient(mockAiClient({ ...validEvaluation, rating: 'terrible' }))

    await expect(evaluateAnswer(sampleInput)).rejects.toThrow()
  })

  it('rejects score out of range', async () => {
    setAiClient(mockAiClient({ ...validEvaluation, score: 150 }))

    await expect(evaluateAnswer(sampleInput)).rejects.toThrow()
  })
})
