import { z } from 'zod'

export const ExplanationResultSchema = z.object({
  explanation: z.string().describe('Detailed elaboration with examples and analogies, 3-5 paragraphs'),
})

export type ExplanationResult = z.infer<typeof ExplanationResultSchema>
