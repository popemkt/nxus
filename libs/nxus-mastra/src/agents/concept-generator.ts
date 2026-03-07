import { getAiClient } from '../lib/ai-client.js'
import { ConceptGenerationResultSchema } from '../schemas/concept.schema.js'

const SYSTEM_PROMPT = `You are an expert educator who creates structured learning concepts for spaced repetition training.

Given a topic, generate 5-8 well-structured concepts that cover the topic comprehensively.

Guidelines:
- Each concept should be a distinct, atomic piece of knowledge that a beginner can grasp
- Keep concepts focused and contained — avoid sprawling, multi-part ideas
- Title: max 6 words — a precise label, not a sentence
- Summary: 1-2 sentences ONLY, max 40 words — concise and direct, no filler
- "Why it matters": 1 sentence, max 20 words — practical relevance only
- Related concepts should reference other concepts in the same batch by title
- Concepts should progress from foundational to advanced

Bloom's level distribution — use a progressive mix:
- Start with 2-3 concepts at "remember" or "understand" (foundational terms, definitions, key facts)
- Include 2-3 at "apply" (practical use cases, how-to)
- Include 1-2 at "analyze" or higher (comparisons, trade-offs, evaluation)
The bloomsLevel represents the TARGET ceiling — learners will start at "remember" and work up to it.

Avoid overlap between concepts — each should teach something unique.`

export async function generateConcepts(topic: string) {
  return getAiClient().generateStructured({
    schema: ConceptGenerationResultSchema,
    system: SYSTEM_PROMPT,
    prompt: `Generate learning concepts for the topic: "${topic}"`,
    model: 'claude-sonnet-4-5-20250514',
    effort: 'low',
  })
}
