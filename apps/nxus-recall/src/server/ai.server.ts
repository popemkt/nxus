/**
 * AI server functions for concept generation, question generation, and answer evaluation.
 *
 * Uses the Anthropic SDK with structured output (zodOutputFormat + messages.parse)
 * for type-safe AI responses. All AI imports are dynamic to avoid bundling into the client.
 */

import { createServerFn } from '@tanstack/react-start'
import {
  FIELD_NAMES,
  getProperty,
  getPropertyValues,
  nodeFacade,
} from '@nxus/db/server'

import {
  GenerateConceptsInputSchema,
  GenerateQuestionInputSchema,
  EvaluateAnswerInputSchema,
  GeneratedConceptsOutputSchema,
  GeneratedQuestionOutputSchema,
  AnswerEvaluationOutputSchema,
} from '../types/schemas.js'
import type { GeneratedConcept, GeneratedQuestion, AnswerEvaluation } from '../types/ai.js'
import type { ServerResponse } from '../types/recall.js'

// ============================================================================
// AI Facade
// ============================================================================

/**
 * Thin AI facade: dynamically imports the Anthropic SDK, calls messages.parse
 * with a Zod schema for structured output, and returns the parsed result.
 *
 * Retries once on malformed output (e.g. if parsed_output is null).
 */
async function callAI<T>(
  schema: import('zod').ZodType<T>,
  systemPrompt: string,
  userPrompt: string,
): Promise<T> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'AI features require an Anthropic API key. Set ANTHROPIC_API_KEY in your environment variables.',
    )
  }

  const { default: Anthropic } = await import('@anthropic-ai/sdk')
  const { zodOutputFormat } = await import('@anthropic-ai/sdk/helpers/zod')

  const client = new Anthropic()

  const attempt = async (): Promise<T> => {
    const message = await client.messages.parse({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      output_config: { format: zodOutputFormat(schema) },
    })

    if (!message.parsed_output) {
      throw new Error('AI returned no structured output')
    }
    return message.parsed_output
  }

  try {
    return await attempt()
  } catch (error) {
    // Retry once on malformed output
    console.warn('[callAI] First attempt failed, retrying:', error)
    return await attempt()
  }
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Load a concept node and extract its context for AI prompts.
 */
async function loadConceptContext(conceptId: string): Promise<{
  title: string
  summary: string
  whyItMatters: string
  bloomsLevel: string
  topicName: string
  relatedConcepts: string[]
}> {
  const node = await nodeFacade.assembleNode(conceptId)
  if (!node) throw new Error(`Concept not found: ${conceptId}`)

  const topicId = node.ownerId ?? ''
  let topicName = 'Unknown Topic'
  if (topicId) {
    const topicNode = await nodeFacade.assembleNode(topicId)
    topicName = topicNode?.content ?? 'Unknown Topic'
  }

  // Resolve related concept titles
  const relatedIds = getPropertyValues<string>(node, FIELD_NAMES.RECALL_RELATED_CONCEPTS)
  const relatedConcepts: string[] = []
  for (const relatedId of relatedIds) {
    const relatedNode = await nodeFacade.assembleNode(relatedId)
    if (relatedNode?.content) relatedConcepts.push(relatedNode.content)
  }

  return {
    title: node.content ?? 'Untitled',
    summary: getProperty<string>(node, FIELD_NAMES.RECALL_SUMMARY) ?? '',
    whyItMatters: getProperty<string>(node, FIELD_NAMES.RECALL_WHY_IT_MATTERS) ?? '',
    bloomsLevel: getProperty<string>(node, FIELD_NAMES.RECALL_BLOOMS_LEVEL) ?? 'remember',
    topicName,
    relatedConcepts,
  }
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Generate 5-8 concepts for a topic using AI.
 *
 * The AI produces concepts at varied Bloom's taxonomy levels,
 * avoiding duplicates of any existing concepts provided.
 */
export const generateConceptsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(GenerateConceptsInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<GeneratedConcept[]>> => {
    try {
      const systemPrompt = `You are an expert educator and curriculum designer. Your task is to generate key concepts for a learning topic that will be used in a spaced repetition system.

Guidelines:
- Generate 5 to 8 concepts that are essential for understanding the topic
- Vary the Bloom's taxonomy levels across concepts (remember, understand, apply, analyze, evaluate, create)
- Each concept should be distinct and self-contained
- Summaries should be concise but complete (2-4 sentences)
- "whyItMatters" should explain practical relevance or connections to broader understanding
- Titles should be clear and specific (not generic like "Introduction" or "Basics")`

      let userPrompt = `Generate key concepts for the topic: "${data.topicName}"`

      if (data.existingConcepts && data.existingConcepts.length > 0) {
        userPrompt += `\n\nThe following concepts already exist for this topic, so avoid generating duplicates or very similar concepts:\n${data.existingConcepts.map((c) => `- ${c}`).join('\n')}`
      }

      const result = await callAI(
        GeneratedConceptsOutputSchema,
        systemPrompt,
        userPrompt,
      )

      return { success: true, data: result.concepts }
    } catch (error) {
      console.error('[generateConceptsServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Generate a question for a concept using AI.
 *
 * Loads the concept + related concepts from the DB to provide context,
 * then generates a higher-order question targeting the concept's Bloom's level or above.
 */
export const generateQuestionServerFn = createServerFn({ method: 'POST' })
  .inputValidator(GenerateQuestionInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<GeneratedQuestion>> => {
    try {
      await nodeFacade.init()

      const ctx = await loadConceptContext(data.conceptId)

      const systemPrompt = `You are an expert educator creating review questions for a spaced repetition system. Your questions should test deep understanding, not just surface-level recall.

Guidelines:
- Target the concept's Bloom's level or one level higher for optimal challenge
- Questions should be open-ended, requiring explanation or application
- Avoid simple yes/no or multiple-choice style questions
- The question should be answerable based on understanding of the concept alone
- Make the question specific enough that the quality of an answer can be evaluated`

      const userPrompt = `Topic: ${ctx.topicName}

Concept: ${ctx.title}
Summary: ${ctx.summary}
Why it matters: ${ctx.whyItMatters}
Current Bloom's level: ${ctx.bloomsLevel}
${ctx.relatedConcepts.length > 0 ? `Related concepts: ${ctx.relatedConcepts.join(', ')}` : ''}

Generate a review question for this concept.`

      const result = await callAI(
        GeneratedQuestionOutputSchema,
        systemPrompt,
        userPrompt,
      )

      return { success: true, data: result }
    } catch (error) {
      console.error('[generateQuestionServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Evaluate a user's answer to a review question using AI.
 *
 * Loads the concept context from DB, compares the answer against
 * the concept's content, and returns feedback with a suggested FSRS rating.
 */
export const evaluateAnswerServerFn = createServerFn({ method: 'POST' })
  .inputValidator(EvaluateAnswerInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<AnswerEvaluation>> => {
    try {
      await nodeFacade.init()

      const ctx = await loadConceptContext(data.conceptId)

      const systemPrompt = `You are an expert educator evaluating a student's answer in a spaced repetition review session. Provide constructive feedback and suggest an FSRS rating.

Rating scale:
- 1 (Again): The answer is incorrect or demonstrates no understanding. The student needs to relearn this concept.
- 2 (Hard): The answer is partially correct but has significant gaps or errors. The student struggled but showed some understanding.
- 3 (Good): The answer is mostly correct with minor omissions. The student demonstrates solid understanding.
- 4 (Easy): The answer is comprehensive and correct. The student clearly understands the concept deeply.

Guidelines:
- Be specific about what was correct and what was missing
- Provide the key points that a complete answer should include
- Be encouraging but honest about gaps
- Keep feedback concise (2-4 sentences)`

      const userPrompt = `Topic: ${ctx.topicName}

Concept: ${ctx.title}
Summary: ${ctx.summary}
Why it matters: ${ctx.whyItMatters}
Bloom's level: ${ctx.bloomsLevel}

Question (${data.questionType} level): ${data.questionText}

Student's answer: ${data.userAnswer}

Evaluate this answer and suggest a rating.`

      const result = await callAI(
        AnswerEvaluationOutputSchema,
        systemPrompt,
        userPrompt,
      )

      return { success: true, data: result }
    } catch (error) {
      console.error('[evaluateAnswerServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })
