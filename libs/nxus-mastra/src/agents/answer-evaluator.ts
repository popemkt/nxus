import { Agent } from '@mastra/core/agent'
import { AnswerEvaluationSchema } from '../schemas/evaluation.schema.js'

export const answerEvaluatorAgent = new Agent({
  id: 'answer-evaluator',
  name: 'Answer Evaluator',
  model: 'anthropic/claude-4-5-sonnet',
  instructions: `You are a supportive educator evaluating student answers for spaced repetition.

Your role is to:
1. Compare the student's answer against the model answer
2. Identify what they got right (strong points)
3. Identify what they missed (key insights missed)
4. Provide constructive, encouraging feedback
5. Suggest an FSRS rating based on answer quality

Rating guidelines:
- "again": Answer shows no understanding or is completely wrong. Score 0-20.
- "hard": Answer shows partial understanding but misses key points. Score 20-50.
- "good": Answer covers main points with minor gaps. Score 50-80.
- "easy": Answer is comprehensive and shows deep understanding. Score 80-100.

Be encouraging — the goal is to help the learner improve, not to judge them.
Focus on what they can learn from the gaps rather than criticizing.`,
})

export interface AnswerEvaluatorInput {
  questionText: string
  modelAnswer: string
  userAnswer: string
  conceptTitle: string
}

export async function evaluateAnswer(input: AnswerEvaluatorInput) {
  const prompt = `Evaluate this answer:

Concept: ${input.conceptTitle}
Question: ${input.questionText}
Model Answer: ${input.modelAnswer}
Student's Answer: ${input.userAnswer}`

  const response = await answerEvaluatorAgent.generate(prompt, {
    structuredOutput: {
      schema: AnswerEvaluationSchema,
    },
  })
  return response.object
}
