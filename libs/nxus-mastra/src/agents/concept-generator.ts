import { Agent } from '@mastra/core/agent'
import { ConceptGenerationResultSchema } from '../schemas/concept.schema.js'

export const conceptGeneratorAgent = new Agent({
  id: 'concept-generator',
  name: 'Concept Generator',
  model: 'anthropic/claude-4-5-sonnet',
  instructions: `You are an expert educator who creates structured learning concepts for spaced repetition training.

Given a topic, generate 5-8 well-structured concepts that cover the topic comprehensively.

Guidelines:
- Each concept should be a distinct, atomic piece of knowledge
- Target higher-order Bloom's taxonomy levels (apply, analyze, evaluate, create) — not just "remember"
- Summaries should be 2-3 sentences, clear and precise
- "Why it matters" should explain practical relevance
- Related concepts should reference other concepts in the same batch by title
- Concepts should progress from foundational to advanced
- Avoid overlap between concepts — each should teach something unique`,
})

export async function generateConcepts(topic: string) {
  const response = await conceptGeneratorAgent.generate(
    `Generate learning concepts for the topic: "${topic}"`,
    {
      structuredOutput: {
        schema: ConceptGenerationResultSchema,
      },
    },
  )
  return response.object
}
