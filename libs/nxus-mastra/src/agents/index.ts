export { generateConcepts } from './concept-generator.js'
export {
  generateQuestion,
  type QuestionGeneratorInput,
} from './question-generator.js'
export {
  evaluateAnswer,
  type AnswerEvaluatorInput,
} from './answer-evaluator.js'

// Re-export facade for testing/customization
export { getAiClient, setAiClient, type AiClient } from '../lib/ai-client.js'

// Bloom's progression logic
export { nextBloomsLevel } from '../lib/blooms-progression.js'
