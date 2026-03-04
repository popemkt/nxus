import { Agent } from '@mastra/core/agent'
import { GeneratedQuestionSchema } from '../schemas/question.schema.js'

export const questionGeneratorAgent = new Agent({
  id: 'question-generator',
  name: 'Question Generator',
  model: 'anthropic/claude-4-5-sonnet',
  instructions: `You are an expert educator creating dynamic review questions for spaced repetition.

Your goal is to generate ONE question that tests higher-order thinking — not simple recall.

Question types:
- Application: "How would you use [concept] to solve [scenario]?"
- Analysis: "What are the key differences between [concept] and [related concept]?"
- Comparison: "Compare and contrast [concept A] with [concept B]"
- Synthesis: "How does [concept] relate to [adjacent concept] in practice?"
- Evaluation: "When would [concept] be the wrong choice, and why?"

Guidelines:
- Questions should require understanding, not just memorization
- Use the adjacent concepts to create cross-concept questions when possible
- The model answer should be thorough but concise (3-5 sentences)
- Provide 1-3 progressive hints (from subtle to more direct)
- Vary question types across reviews to maintain engagement`,
})

export interface QuestionGeneratorInput {
  conceptTitle: string
  conceptSummary: string
  bloomsLevel: string | null
  adjacentConcepts: Array<{ title: string; summary: string }>
}

export async function generateQuestion(input: QuestionGeneratorInput) {
  const adjacentContext =
    input.adjacentConcepts.length > 0
      ? `\n\nAdjacent concepts for cross-referencing:\n${input.adjacentConcepts
          .map((c) => `- ${c.title}: ${c.summary}`)
          .join('\n')}`
      : ''

  const prompt = `Generate a review question for this concept:

Title: ${input.conceptTitle}
Summary: ${input.conceptSummary}
Bloom's Level: ${input.bloomsLevel ?? 'apply'}
${adjacentContext}`

  const response = await questionGeneratorAgent.generate(prompt, {
    structuredOutput: {
      schema: GeneratedQuestionSchema,
    },
  })
  return response.object
}
