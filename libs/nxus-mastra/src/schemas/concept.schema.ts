import { z } from 'zod'

export const BloomsLevelSchema = z.enum([
  'remember',
  'understand',
  'apply',
  'analyze',
  'evaluate',
  'create',
])

export type BloomsLevel = z.infer<typeof BloomsLevelSchema>

export const GeneratedConceptSchema = z.object({
  title: z.string().describe('Short, precise concept name'),
  summary: z.string().describe('2-3 sentence explanation of the concept'),
  whyItMatters: z.string().describe('Why this concept is important to understand'),
  bloomsLevel: BloomsLevelSchema.describe('Bloom\'s taxonomy level this concept targets'),
  relatedConceptTitles: z.array(z.string()).describe('Titles of related concepts in this batch'),
})

export type GeneratedConcept = z.infer<typeof GeneratedConceptSchema>

export const ConceptGenerationResultSchema = z.object({
  concepts: z.array(GeneratedConceptSchema).min(3).max(8),
})

export type ConceptGenerationResult = z.infer<typeof ConceptGenerationResultSchema>
