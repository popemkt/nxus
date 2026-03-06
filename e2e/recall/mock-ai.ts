/**
 * Mock AI responses for recall app E2E tests.
 *
 * The recall app has 3 server functions that call AI (Claude via AI SDK):
 * - generateConceptsServerFn — generates learning concepts for a topic
 * - generateQuestionServerFn — generates a review question for a concept
 * - evaluateAnswerServerFn — evaluates a student's answer
 *
 * These server functions are called via TanStack Start's RPC mechanism (POST to /_server).
 * We intercept at the browser network level and return mock responses for AI-related
 * calls, letting DB-backed calls (topics, concepts CRUD, review) pass through to the real server.
 *
 * Identification strategy:
 * - TanStack Start includes the function name in the URL query params (_serverFnName)
 * - As a fallback, we inspect the POST body for unique field patterns
 */
import type { Page } from '@playwright/test'

export const MOCK_CONCEPTS = [
  {
    title: 'CAP Theorem Fundamentals',
    summary:
      'The CAP theorem states that a distributed system can only guarantee two of three properties: Consistency, Availability, and Partition tolerance.',
    whyItMatters:
      'Understanding CAP helps architects make informed trade-offs when designing distributed systems.',
    bloomsLevel: 'analyze',
    relatedConceptTitles: ['Eventual Consistency', 'Network Partitions'],
  },
  {
    title: 'Eventual Consistency',
    summary:
      'A consistency model where replicas converge to the same state over time, prioritizing availability over immediate consistency.',
    whyItMatters:
      'Many modern databases use eventual consistency — knowing when it is acceptable is crucial for system design.',
    bloomsLevel: 'evaluate',
    relatedConceptTitles: ['CAP Theorem Fundamentals'],
  },
  {
    title: 'Network Partitions',
    summary:
      'A network partition occurs when nodes in a distributed system cannot communicate, forcing a choice between consistency and availability.',
    whyItMatters:
      'Partitions are inevitable in distributed systems — designing for them prevents catastrophic failures.',
    bloomsLevel: 'apply',
    relatedConceptTitles: [
      'CAP Theorem Fundamentals',
      'Eventual Consistency',
    ],
  },
]

export const MOCK_QUESTION = {
  questionText:
    'A social media platform needs to display user feeds across multiple regions. During a network partition between US and EU data centers, users in both regions continue posting. How would you apply the CAP theorem to decide whether to show potentially stale feeds or return errors?',
  questionType: 'application' as const,
  modelAnswer:
    'During a network partition, the CAP theorem forces a choice between consistency and availability. For a social media feed, availability is typically preferred — users should see content even if slightly stale. The system should favor AP (Availability + Partition tolerance), accepting eventual consistency. Once the partition heals, feeds converge. Critical operations like payments should favor CP instead.',
  hints: [
    'Think about what happens when two data centers cannot communicate.',
    'Consider which is worse for social media: seeing a slightly old feed, or seeing an error page.',
    'The answer depends on the type of operation — not all operations need the same guarantee.',
  ],
}

export const MOCK_EVALUATION = {
  rating: 'good' as const,
  score: 72,
  feedback:
    'Good understanding of the core trade-off! You correctly identified that availability is preferred for social media feeds. Consider elaborating on how eventual consistency works in practice and when CP would be the better choice.',
  strongPoints: [
    'Correctly identified the availability vs consistency trade-off',
    'Good intuition about user experience priorities',
  ],
  keyInsightsMissed: [
    'Could mention specific strategies like conflict resolution or CRDTs',
    'Did not distinguish between read and write operations during partitions',
  ],
}

/**
 * Determines if a server function request is an AI-related call based on URL and body.
 * Returns 'generateConcepts' | 'generateQuestion' | 'evaluateAnswer' | null.
 */
function identifyAIServerFn(
  url: string,
  postData: string | null,
):
  | 'generateConcepts'
  | 'generateQuestion'
  | 'evaluateAnswer'
  | null {
  // Strategy 1: Match on URL (TanStack Start includes _serverFnName in URL)
  if (
    url.includes('generateConceptsServerFn') ||
    url.includes('generateConcepts')
  ) {
    return 'generateConcepts'
  }
  if (
    url.includes('generateQuestionServerFn') ||
    url.includes('generateQuestion')
  ) {
    return 'generateQuestion'
  }
  if (
    url.includes('evaluateAnswerServerFn') ||
    url.includes('evaluateAnswer')
  ) {
    return 'evaluateAnswer'
  }

  // Strategy 2: Fall back to body inspection for unique field patterns
  if (!postData) return null

  // generateQuestionServerFn has adjacentConcepts field (unique to this function)
  if (
    postData.includes('"adjacentConcepts"') &&
    postData.includes('"conceptSummary"')
  ) {
    return 'generateQuestion'
  }

  // evaluateAnswerServerFn has modelAnswer field (unique to this function)
  if (
    postData.includes('"modelAnswer"') &&
    postData.includes('"userAnswer"')
  ) {
    return 'evaluateAnswer'
  }

  // generateConceptsServerFn has { topic: "..." } but NOT topicId/name
  // Be careful not to match createTopicServerFn which has { name: "..." }
  if (
    postData.includes('"topic"') &&
    !postData.includes('"topicId"') &&
    !postData.includes('"name"')
  ) {
    return 'generateConcepts'
  }

  return null
}

/**
 * Wraps a server function return value in the TanStack Start response envelope.
 *
 * TanStack Start's `createServerFn` client wrapper expects the response to be
 * `{ result: <handlerReturnValue>, context: {} }` — it extracts `.result` from
 * the deserialized response. Without this wrapper, `d.result` is `undefined`.
 *
 * When the response does NOT include the `x-tss-serialized` header, the client
 * falls back to plain JSON parsing (no seroval), so we can return plain JSON
 * as long as the shape matches.
 */
function wrapServerFnResponse(data: unknown): string {
  return JSON.stringify({ result: data, context: {} })
}

/**
 * Sets up route interception to mock AI server function responses.
 * DB-backed server functions (topics, concepts CRUD, review, stats) pass through normally.
 */
export async function mockAIServerFunctions(page: Page) {
  await page.route('**/recall/**', async (route) => {
    const request = route.request()
    const url = request.url()

    // Only intercept POST requests to the _server endpoint
    if (request.method() !== 'POST' || !url.includes('_server')) {
      await route.continue()
      return
    }

    const postData = request.postData()
    const fnType = identifyAIServerFn(url, postData)

    if (fnType === 'generateConcepts') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: wrapServerFnResponse({
          success: true,
          concepts: MOCK_CONCEPTS,
        }),
      })
    } else if (fnType === 'generateQuestion') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: wrapServerFnResponse({
          success: true,
          question: MOCK_QUESTION,
        }),
      })
    } else if (fnType === 'evaluateAnswer') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: wrapServerFnResponse({
          success: true,
          evaluation: MOCK_EVALUATION,
        }),
      })
    } else {
      // Not an AI function — pass through to real server
      await route.continue()
    }
  })
}
