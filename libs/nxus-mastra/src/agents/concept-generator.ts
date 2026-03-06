import { generateObject } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { ConceptGenerationResultSchema } from '../schemas/concept.schema.js'

const anthropic = createAnthropic()

const SYSTEM_PROMPT = `You are an expert educator who creates structured learning concepts for spaced repetition training.

Given a topic, generate 5-8 well-structured concepts that cover the topic comprehensively.

Guidelines:
- Each concept should be a distinct, atomic piece of knowledge
- Target higher-order Bloom's taxonomy levels (apply, analyze, evaluate, create) — not just "remember"
- Summaries should be 2-3 sentences, clear and precise
- "Why it matters" should explain practical relevance
- Related concepts should reference other concepts in the same batch by title
- Concepts should progress from foundational to advanced
- Avoid overlap between concepts — each should teach something unique`

export async function generateConcepts(topic: string) {
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-20250514'),
    schema: ConceptGenerationResultSchema,
    system: SYSTEM_PROMPT,
    prompt: `Generate learning concepts for the topic: "${topic}"`,
  })
  return object
}
