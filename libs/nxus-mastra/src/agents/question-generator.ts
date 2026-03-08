import { getAiClient } from '../lib/ai-client.js'
import {
  FreeResponseQuestionSchema,
  MultipleChoiceQuestionSchema,
  TrueFalseQuestionSchema,
  FillBlankQuestionSchema,
  BLOOMS_QUESTION_TYPES,
  type QuestionType,
} from '../schemas/question.schema.js'
import type { BloomsLevel } from '../schemas/concept.schema.js'

const SYSTEM_PROMPTS: Record<QuestionType, string> = {
  'free-response': `You are an expert educator creating a free-response review question for spaced repetition.

Generate ONE question that tests the learner's understanding at the specified Bloom's level.

Guidelines:
- The question should require the learner to explain, apply, or analyze — not just recall a fact
- Use adjacent concepts for cross-referencing when available
- The model answer should be thorough but concise (3-5 sentences)
- Provide 1-3 progressive hints (from subtle to more direct)`,

  'multiple-choice': `You are an expert educator creating a multiple-choice review question for spaced repetition.

Generate ONE multiple-choice question with 4 answer choices.

Guidelines:
- One choice must be clearly correct (matching the modelAnswer)
- Distractors should be plausible but wrong — avoid trick questions
- The correctIndex must be the zero-based index of the correct choice
- Provide 1-3 progressive hints
- The modelAnswer should explain WHY the correct answer is right`,

  'true-false': `You are an expert educator creating a true/false review question for spaced repetition.

Generate ONE true/false statement about the concept.

Guidelines:
- The statement should test a specific fact or relationship, not a trivial detail
- correctAnswer must be a boolean (true or false)
- The modelAnswer should explain why the statement is true or false
- Provide 1-3 progressive hints`,

  'fill-blank': `You are an expert educator creating a fill-in-the-blank review question for spaced repetition.

Generate ONE fill-in-the-blank question.

Guidelines:
- The questionText should contain "___" (triple underscore) where the blank goes
- blankAnswer is the exact word or short phrase that fills the blank
- The modelAnswer should explain the answer in context
- Provide 1-3 progressive hints`,
}

const QUESTION_TYPE_SCHEMAS = {
  'free-response': FreeResponseQuestionSchema,
  'multiple-choice': MultipleChoiceQuestionSchema,
  'true-false': TrueFalseQuestionSchema,
  'fill-blank': FillBlankQuestionSchema,
} as const

export interface QuestionGeneratorInput {
  conceptTitle: string
  conceptSummary: string
  bloomsLevel: string | null
  currentBloomsLevel?: string | null
  adjacentConcepts: Array<{ title: string; summary: string }>
}

export async function generateQuestion(input: QuestionGeneratorInput) {
  const effectiveBlooms = (input.currentBloomsLevel ?? input.bloomsLevel ?? 'remember') as BloomsLevel
  const questionType = pickQuestionType(effectiveBlooms)

  const adjacentContext =
    input.adjacentConcepts.length > 0
      ? `\n\nAdjacent concepts for cross-referencing:\n${input.adjacentConcepts
          .map((c) => `- ${c.title}: ${c.summary}`)
          .join('\n')}`
      : ''

  const prompt = `Generate a review question for this concept:

Title: ${input.conceptTitle}
Summary: ${input.conceptSummary}
Bloom's Level: ${effectiveBlooms}
${adjacentContext}`

  return getAiClient().generateStructured({
    schema: QUESTION_TYPE_SCHEMAS[questionType],
    system: SYSTEM_PROMPTS[questionType],
    prompt,
  })
}

function pickQuestionType(blooms: BloomsLevel): QuestionType {
  const allowed = BLOOMS_QUESTION_TYPES[blooms]
  return allowed[Math.floor(Math.random() * allowed.length)]!
}
