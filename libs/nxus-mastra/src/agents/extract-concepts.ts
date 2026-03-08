import { getAiClient } from '../lib/ai-client.js'
import { ConceptGenerationResultSchema } from '../schemas/concept.schema.js'

const SYSTEM_PROMPT = `You are an expert educator who extracts structured learning concepts from unstructured text for spaced repetition training.

Given raw text (notes, articles, documentation), identify 3-8 distinct, atomic concepts that are worth memorizing.

Guidelines:
- Each concept should be a self-contained piece of knowledge
- Title: a clear, descriptive label for the concept
- Summary: 1-2 sentences ONLY, max 40 words — concise and direct
- "Why it matters": 1 sentence, max 20 words — practical relevance only
- Skip trivial facts — focus on concepts that require understanding
- Related concepts should reference other concepts in the same batch by title
- Assign appropriate Bloom's taxonomy levels based on the depth of the content

If the text is too short or trivial to extract meaningful concepts, return fewer concepts rather than padding.`

export async function extractConceptsFromText(text: string, topicHint?: string) {
  const prompt = `Extract learning concepts from the following text${topicHint ? ` (topic: "${topicHint}")` : ''}:

${text}`

  return getAiClient().generateStructured({
    schema: ConceptGenerationResultSchema,
    system: SYSTEM_PROMPT,
    prompt,
    model: 'claude-sonnet-4-5-20250514',
    effort: 'low',
  })
}
