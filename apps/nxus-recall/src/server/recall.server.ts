/**
 * recall.server.ts - CRUD server functions for topics, concepts, and due cards.
 *
 * Follows the calendar.server.ts pattern:
 * createServerFn({ method: 'POST' }).inputValidator(schema).handler(...)
 */

import { createServerFn } from '@tanstack/react-start'
import {
  FIELD_NAMES,
  SYSTEM_FIELDS,
  SYSTEM_SUPERTAGS,
  getProperty,
  nodeFacade,
  type AssembledNode,
  type QueryFilter,
} from '@nxus/db/server'

import {
  GetTopicsInputSchema,
  GetTopicInputSchema,
  GetConceptsByTopicInputSchema,
  GetDueCardsInputSchema,
  SaveConceptInputSchema,
  CreateManualConceptInputSchema,
} from '../types/schemas.js'
import type {
  RecallTopic,
  RecallConcept,
  ServerResponse,
} from '../types/recall.js'
import {
  nodeToRecallTopic,
  nodeToRecallConcept,
  fsrsCardToProperties,
} from './recall-logic.js'
import { createEmptyCard } from 'ts-fsrs'

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get all concept nodes owned by a topic, filtering by supertag.
 */
async function getConceptNodesForTopic(topicId: string): Promise<AssembledNode[]> {
  const result = await nodeFacade.evaluateQuery({
    filters: [
      {
        type: 'supertag',
        supertagId: SYSTEM_SUPERTAGS.RECALL_CONCEPT,
        includeInherited: false,
      },
      {
        type: 'relation',
        relationType: 'childOf',
        targetNodeId: topicId,
      },
    ],
    limit: 10000,
  })
  return result.nodes
}

/**
 * Count how many concepts under a topic are due for review (due <= now).
 */
function countDueConcepts(conceptNodes: AssembledNode[], now: Date): number {
  return conceptNodes.filter((node) => {
    const dueStr = getProperty<string>(node, FIELD_NAMES.RECALL_DUE)
    if (!dueStr) return true // No due date means "new" — treat as due
    return new Date(dueStr) <= now
  }).length
}

/**
 * Set all concept properties on a node (content fields + FSRS defaults).
 */
async function setConceptProperties(
  nodeId: string,
  data: {
    summary: string
    whyItMatters: string
    bloomsLevel: string
    source?: string
    relatedConceptIds?: string[]
  },
): Promise<void> {
  await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.RECALL_SUMMARY, data.summary)
  await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.RECALL_WHY_IT_MATTERS, data.whyItMatters)
  await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.RECALL_BLOOMS_LEVEL, data.bloomsLevel)

  if (data.source) {
    await nodeFacade.setProperty(nodeId, SYSTEM_FIELDS.RECALL_SOURCE, data.source)
  }

  if (data.relatedConceptIds && data.relatedConceptIds.length > 0) {
    for (const relatedId of data.relatedConceptIds) {
      await nodeFacade.addPropertyValue(nodeId, SYSTEM_FIELDS.RECALL_RELATED_CONCEPTS, relatedId)
    }
  }

  // Set FSRS defaults for a new card
  const emptyCard = createEmptyCard(new Date())
  const fsrsProps = fsrsCardToProperties(emptyCard)
  for (const [fieldId, value] of fsrsProps) {
    await nodeFacade.setProperty(nodeId, fieldId, value)
  }
}

// ============================================================================
// Server Functions
// ============================================================================

/**
 * Get all recall topics with concept and due counts.
 */
export const getTopicsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(GetTopicsInputSchema)
  .handler(async (): Promise<ServerResponse<RecallTopic[]>> => {
    try {
      await nodeFacade.init()

      const result = await nodeFacade.evaluateQuery({
        filters: [
          {
            type: 'supertag',
            supertagId: SYSTEM_SUPERTAGS.RECALL_TOPIC,
            includeInherited: false,
          },
        ],
        sort: { field: 'content', direction: 'asc' },
        limit: 1000,
      })

      const now = new Date()
      const topics: RecallTopic[] = []

      for (const topicNode of result.nodes) {
        const conceptNodes = await getConceptNodesForTopic(topicNode.id)
        const dueCount = countDueConcepts(conceptNodes, now)
        topics.push(nodeToRecallTopic(topicNode, conceptNodes.length, dueCount))
      }

      return { success: true, data: topics }
    } catch (error) {
      console.error('[getTopicsServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Get a single topic by ID with concept and due counts.
 */
export const getTopicServerFn = createServerFn({ method: 'POST' })
  .inputValidator(GetTopicInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<RecallTopic>> => {
    try {
      await nodeFacade.init()

      const node = await nodeFacade.assembleNode(data.topicId)
      if (!node) {
        return { success: false, error: 'Topic not found' }
      }

      const conceptNodes = await getConceptNodesForTopic(node.id)
      const now = new Date()
      const dueCount = countDueConcepts(conceptNodes, now)
      const topic = nodeToRecallTopic(node, conceptNodes.length, dueCount)

      return { success: true, data: topic }
    } catch (error) {
      console.error('[getTopicServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Get all concepts for a topic.
 */
export const getConceptsByTopicServerFn = createServerFn({ method: 'POST' })
  .inputValidator(GetConceptsByTopicInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<RecallConcept[]>> => {
    try {
      await nodeFacade.init()

      // Resolve topic name for the concept domain objects
      const topicNode = await nodeFacade.assembleNode(data.topicId)
      const topicName = topicNode?.content ?? 'Unknown Topic'

      const conceptNodes = await getConceptNodesForTopic(data.topicId)
      const concepts = conceptNodes.map((node) => nodeToRecallConcept(node, topicName))

      return { success: true, data: concepts }
    } catch (error) {
      console.error('[getConceptsByTopicServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Get all concepts that are due for review, optionally filtered by topic.
 */
export const getDueCardsServerFn = createServerFn({ method: 'POST' })
  .inputValidator(GetDueCardsInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<RecallConcept[]>> => {
    try {
      await nodeFacade.init()

      const now = new Date()
      const nowIso = now.toISOString()

      // Build query: recall-concept nodes with due <= now
      const filters: QueryFilter[] = [
        {
          type: 'supertag',
          supertagId: SYSTEM_SUPERTAGS.RECALL_CONCEPT,
          includeInherited: false,
        },
        {
          type: 'property',
          fieldId: SYSTEM_FIELDS.RECALL_DUE as string,
          op: 'lte',
          value: nowIso,
        },
      ]

      // If topicId is provided, filter by owner
      if (data.topicId) {
        filters.push({
          type: 'relation',
          relationType: 'childOf',
          targetNodeId: data.topicId,
        })
      }

      const result = await nodeFacade.evaluateQuery({
        filters,
        sort: { field: SYSTEM_FIELDS.RECALL_DUE as string, direction: 'asc' },
        limit: 500,
      })

      // Resolve topic names for each concept
      const topicNameCache = new Map<string, string>()
      const concepts: RecallConcept[] = []

      for (const node of result.nodes) {
        const topicId = node.ownerId ?? ''
        if (!topicNameCache.has(topicId) && topicId) {
          const topicNode = await nodeFacade.assembleNode(topicId)
          topicNameCache.set(topicId, topicNode?.content ?? 'Unknown Topic')
        }
        const topicName = topicNameCache.get(topicId) ?? 'Unknown Topic'
        concepts.push(nodeToRecallConcept(node, topicName))
      }

      return { success: true, data: concepts }
    } catch (error) {
      console.error('[getDueCardsServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Save a concept under a topic (find-or-create topic by name).
 * Used by the AI Explore flow to save generated concepts.
 */
export const saveConceptServerFn = createServerFn({ method: 'POST' })
  .inputValidator(SaveConceptInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<RecallConcept>> => {
    try {
      await nodeFacade.init()

      // Find or create the topic by name
      const topicResult = await nodeFacade.evaluateQuery({
        filters: [
          {
            type: 'supertag',
            supertagId: SYSTEM_SUPERTAGS.RECALL_TOPIC,
            includeInherited: false,
          },
          {
            type: 'content',
            query: data.topicName,
            caseSensitive: false,
          },
        ],
        limit: 1,
      })

      let topicId: string
      if (topicResult.nodes.length > 0) {
        // Use existing topic — pick the first exact content match
        const exactMatch = topicResult.nodes.find(
          (n: AssembledNode) => n.content?.toLowerCase() === data.topicName.toLowerCase(),
        )
        topicId = exactMatch?.id ?? topicResult.nodes[0]!.id
      } else {
        // Create new topic
        topicId = await nodeFacade.createNode({
          content: data.topicName,
          supertagId: SYSTEM_SUPERTAGS.RECALL_TOPIC,
        })
      }

      // Create the concept node under the topic
      const conceptId = await nodeFacade.createNode({
        content: data.title,
        supertagId: SYSTEM_SUPERTAGS.RECALL_CONCEPT,
        ownerId: topicId,
      })

      await setConceptProperties(conceptId, {
        summary: data.summary,
        whyItMatters: data.whyItMatters,
        bloomsLevel: data.bloomsLevel,
        source: data.source,
        relatedConceptIds: data.relatedConceptIds,
      })

      await nodeFacade.save()

      // Assemble and return the created concept
      const conceptNode = await nodeFacade.assembleNode(conceptId)
      if (!conceptNode) {
        return { success: false, error: 'Failed to assemble created concept' }
      }

      const concept = nodeToRecallConcept(conceptNode, data.topicName)
      return { success: true, data: concept }
    } catch (error) {
      console.error('[saveConceptServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })

/**
 * Create a concept under an existing topic (manual creation from Topic Detail).
 */
export const createManualConceptServerFn = createServerFn({ method: 'POST' })
  .inputValidator(CreateManualConceptInputSchema)
  .handler(async ({ data }): Promise<ServerResponse<RecallConcept>> => {
    try {
      await nodeFacade.init()

      // Verify the topic exists
      const topicNode = await nodeFacade.assembleNode(data.topicId)
      if (!topicNode) {
        return { success: false, error: 'Topic not found' }
      }

      const topicName = topicNode.content ?? 'Unknown Topic'

      // Create concept node
      const conceptId = await nodeFacade.createNode({
        content: data.title,
        supertagId: SYSTEM_SUPERTAGS.RECALL_CONCEPT,
        ownerId: data.topicId,
      })

      await setConceptProperties(conceptId, {
        summary: data.summary,
        whyItMatters: data.whyItMatters,
        bloomsLevel: data.bloomsLevel,
        source: data.source,
        relatedConceptIds: data.relatedConceptIds,
      })

      await nodeFacade.save()

      // Assemble and return
      const conceptNode = await nodeFacade.assembleNode(conceptId)
      if (!conceptNode) {
        return { success: false, error: 'Failed to assemble created concept' }
      }

      const concept = nodeToRecallConcept(conceptNode, topicName)
      return { success: true, data: concept }
    } catch (error) {
      console.error('[createManualConceptServerFn] Error:', error)
      return { success: false, error: String(error) }
    }
  })
