import { z } from 'zod'
import { BLOOMS_LEVELS } from '@nxus/db'
export type { BloomsLevel } from '@nxus/db'

export const BloomsLevelSchema = z.enum(BLOOMS_LEVELS)

export const GeneratedConceptSchema = z.object({
  title: z.string().describe('Short, precise concept name'),
  summary: z.string().describe('1-2 sentence explanation, max 40 words'),
  whyItMatters: z.string().describe('1 sentence on practical relevance, max 20 words'),
  bloomsLevel: BloomsLevelSchema.describe('Bloom\'s taxonomy level this concept targets'),
  relatedConceptTitles: z.array(z.string()).describe('Titles of related concepts in this batch'),
})

export type GeneratedConcept = z.infer<typeof GeneratedConceptSchema>

export const ConceptGenerationResultSchema = z.object({
  concepts: z.array(GeneratedConceptSchema).min(3).max(8),
})

export type ConceptGenerationResult = z.infer<typeof ConceptGenerationResultSchema>
