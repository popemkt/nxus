import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const evaluateAnswerServerFn = createServerFn({ method: 'POST' })
  .inputValidator(
    z.object({
      questionText: z.string(),
      modelAnswer: z.string(),
      userAnswer: z.string(),
      conceptTitle: z.string(),
      questionType: z.string().optional(),
      correctIndex: z.number().optional(),
      correctAnswer: z.boolean().optional(),
      blankAnswer: z.string().optional(),
    }),
  )
  .handler(async (ctx) => {
    try {
      const { questionType } = ctx.data

      // Deterministic evaluation for structured question types
      if (questionType === 'multiple-choice' && ctx.data.correctIndex !== undefined) {
        const isCorrect = ctx.data.userAnswer === String(ctx.data.correctIndex)
        return {
          success: true as const,
          evaluation: {
            rating: isCorrect ? ('good' as const) : ('again' as const),
            score: isCorrect ? 80 : 10,
            feedback: isCorrect
              ? 'Correct! ' + ctx.data.modelAnswer
              : 'Incorrect. ' + ctx.data.modelAnswer,
            keyInsightsMissed: isCorrect ? [] : ['Review the correct answer above'],
            strongPoints: isCorrect ? ['Selected the correct answer'] : [],
          },
        }
      }

      if (questionType === 'true-false' && ctx.data.correctAnswer !== undefined) {
        const isCorrect = ctx.data.userAnswer === String(ctx.data.correctAnswer)
        return {
          success: true as const,
          evaluation: {
            rating: isCorrect ? ('good' as const) : ('again' as const),
            score: isCorrect ? 80 : 10,
            feedback: isCorrect
              ? 'Correct! ' + ctx.data.modelAnswer
              : 'Incorrect. ' + ctx.data.modelAnswer,
            keyInsightsMissed: isCorrect ? [] : ['Review the correct answer above'],
            strongPoints: isCorrect ? ['Correctly identified the statement'] : [],
          },
        }
      }

      if (questionType === 'fill-blank' && ctx.data.blankAnswer) {
        const normalize = (s: string) => s.trim().toLowerCase()
        const isCorrect = normalize(ctx.data.userAnswer) === normalize(ctx.data.blankAnswer)
        const isClose = !isCorrect && normalize(ctx.data.blankAnswer).includes(normalize(ctx.data.userAnswer))
        return {
          success: true as const,
          evaluation: {
            rating: isCorrect ? ('good' as const) : isClose ? ('hard' as const) : ('again' as const),
            score: isCorrect ? 80 : isClose ? 40 : 10,
            feedback: isCorrect
              ? 'Correct! ' + ctx.data.modelAnswer
              : `The answer is "${ctx.data.blankAnswer}". ${ctx.data.modelAnswer}`,
            keyInsightsMissed: isCorrect ? [] : [`The blank should be filled with "${ctx.data.blankAnswer}"`],
            strongPoints: isCorrect ? ['Filled in the correct answer'] : isClose ? ['Close, but not exact'] : [],
          },
        }
      }

      // Free-response: use AI evaluation
      const { evaluateAnswer } = await import('@nxus/mastra/server')
      const evaluation = await evaluateAnswer({
        questionText: ctx.data.questionText,
        modelAnswer: ctx.data.modelAnswer,
        userAnswer: ctx.data.userAnswer,
        conceptTitle: ctx.data.conceptTitle,
      })
      if (!evaluation) {
        return { success: false as const, error: 'No evaluation generated' }
      }
      return { success: true as const, evaluation }
    } catch (error) {
      return {
        success: false as const,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to evaluate answer',
      }
    }
  })
