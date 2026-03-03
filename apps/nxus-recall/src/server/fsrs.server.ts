/**
 * FSRS scheduling server functions for spaced repetition.
 *
 * Uses ts-fsrs to compute next review intervals and process card ratings.
 * Follows the same pattern as recall.server.ts:
 * createServerFn({ method: 'POST' }).inputValidator(schema).handler(...)
 */

import { createServerFn } from '@tanstack/react-start'
import {
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  nodeFacade,
} from '@nxus/db/server'

import { fsrs, type Grade } from 'ts-fsrs'

import {
  RateCardInputSchema,
  PreviewIntervalsInputSchema,
} from '../types/schemas.js'
import type {
  RecallCard,
  ServerResponse,
  IntervalsPreview,
  FsrsRating,
} from '../types/recall.js'
import {
  nodeToRecallConcept,
  recallCardToFsrsCard,
  fsrsCardToProperties,
} from './recall-logic.js'

// FSRS instance configured for 90% retention, max 365-day interval
const f = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
})

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Rate a card after a review session.
 *
 * Loads the concept from DB, runs FSRS scheduling with the given rating,
 * updates all FSRS properties on the concept node, and creates a ReviewLog
 * child node with the question/answer/feedback/rating.
 */
export const rateCardServerFn = createServerFn({ method: 'POST' })
  .inputValidator(RateCardInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<RecallCard>> => {
    try {
      await nodeFacade.init()

      // Load the concept node
      const conceptNode = await nodeFacade.assembleNode(data.conceptId)
      if (!conceptNode) {
        return { success: false, error: 'Concept not found' }
      }

      // Resolve topic name for the return value
      const topicId = conceptNode.ownerId ?? ''
      let topicName = 'Unknown Topic'
      if (topicId) {
        const topicNode = await nodeFacade.assembleNode(topicId)
        topicName = topicNode?.content ?? 'Unknown Topic'
      }

      // Convert DB state to domain concept, then to ts-fsrs Card
      const concept = nodeToRecallConcept(conceptNode, topicName)
      const fsrsCard = recallCardToFsrsCard(concept.card)

      // Run FSRS scheduling
      const now = new Date()
      const result = f.next(fsrsCard, now, data.rating as Grade)
      const updatedCard = result.card

      // Persist updated FSRS properties on the concept node
      const props = fsrsCardToProperties(updatedCard)
      for (const [fieldId, value] of props) {
        await nodeFacade.setProperty(data.conceptId, fieldId, value)
      }

      // Create a ReviewLog child node under the concept
      const reviewLogId = await nodeFacade.createNode({
        content: `Review: ${concept.title}`,
        supertagId: SYSTEM_SUPERTAGS.RECALL_REVIEW_LOG,
        ownerId: data.conceptId,
      })

      await nodeFacade.setProperty(reviewLogId, SYSTEM_FIELDS.RECALL_QUESTION_TEXT, data.questionText)
      await nodeFacade.setProperty(reviewLogId, SYSTEM_FIELDS.RECALL_QUESTION_TYPE, data.questionType)
      await nodeFacade.setProperty(reviewLogId, SYSTEM_FIELDS.RECALL_USER_ANSWER, data.userAnswer)
      await nodeFacade.setProperty(reviewLogId, SYSTEM_FIELDS.RECALL_AI_FEEDBACK, data.aiFeedback)
      await nodeFacade.setProperty(reviewLogId, SYSTEM_FIELDS.RECALL_RATING, data.rating)

      await nodeFacade.save()

      // Return the updated card state
      const updatedRecallCard: RecallCard = {
        due: updatedCard.due.toISOString(),
        state: updatedCard.state as RecallCard['state'],
        reps: updatedCard.reps,
        lapses: updatedCard.lapses,
        stability: updatedCard.stability,
        difficulty: updatedCard.difficulty,
        elapsedDays: updatedCard.elapsed_days,
        scheduledDays: updatedCard.scheduled_days,
        lastReview: updatedCard.last_review?.toISOString(),
      }

      return { success: true, data: updatedRecallCard }
    } catch (error) {
      console.error('[rateCardServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Preview intervals for all rating options without committing.
 *
 * Loads the concept, runs FSRS repeat() to get scheduling for each
 * of Again/Hard/Good/Easy, returns the preview intervals.
 */
export const previewIntervalsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(PreviewIntervalsInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<IntervalsPreview>> => {
    try {
      await nodeFacade.init()

      // Load the concept node
      const conceptNode = await nodeFacade.assembleNode(data.conceptId)
      if (!conceptNode) {
        return { success: false, error: 'Concept not found' }
      }

      // Convert to ts-fsrs Card
      const topicId = conceptNode.ownerId ?? ''
      let topicName = 'Unknown Topic'
      if (topicId) {
        const topicNode = await nodeFacade.assembleNode(topicId)
        topicName = topicNode?.content ?? 'Unknown Topic'
      }

      const concept = nodeToRecallConcept(conceptNode, topicName)
      const fsrsCard = recallCardToFsrsCard(concept.card)

      // Get scheduling for all ratings
      const now = new Date()
      const scheduling = f.repeat(fsrsCard, now)

      // Build preview for each rating (1=Again, 2=Hard, 3=Good, 4=Easy)
      const ratings: FsrsRating[] = [1, 2, 3, 4]
      const preview = {} as IntervalsPreview

      for (const rating of ratings) {
        const entry = scheduling[rating as Grade]
        preview[rating] = {
          due: entry.card.due.toISOString(),
          scheduledDays: entry.card.scheduled_days,
        }
      }

      return { success: true, data: preview }
    } catch (error) {
      console.error('[previewIntervalsServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })
