import { getAiClient } from '../lib/ai-client.js'
import { ExplanationResultSchema } from '../schemas/explain.schema.js'

const SYSTEM_PROMPT = `You are an expert tutor helping a student understand concepts they struggled with during a review session.

Given the question, the model answer, and the specific points the student missed, provide a clear, thorough explanation that:
- Breaks down each missed insight using simple language
- Uses concrete analogies or real-world examples
- Connects the concept to things the student already knows
- Keeps the explanation focused and practical (3-5 short paragraphs)

Do NOT repeat the model answer verbatim — add new perspective and depth.`

export interface ExplainFurtherInput {
  conceptTitle: string
  questionText: string
  modelAnswer: string
  keyInsightsMissed: string[]
  userAnswer: string
}

export async function explainFurther(input: ExplainFurtherInput) {
  const prompt = `Concept: ${input.conceptTitle}

Question: ${input.questionText}

Student's answer: ${input.userAnswer}

Model answer: ${input.modelAnswer}

Key insights the student missed:
${input.keyInsightsMissed.map((p) => `- ${p}`).join('\n')}

Please elaborate on what the student missed, using examples and analogies.`

  return getAiClient().generateStructured({
    schema: ExplanationResultSchema,
    system: SYSTEM_PROMPT,
    prompt,
  })
}
