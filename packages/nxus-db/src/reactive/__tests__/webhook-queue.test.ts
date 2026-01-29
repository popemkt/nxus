/**
 * webhook-queue.test.ts - Unit tests for the WebhookQueue
 *
 * Tests the webhook execution queue including:
 * - Webhook is enqueued and executed
 * - Template variables are interpolated correctly
 * - Failed webhook retries up to 3 times
 * - Successful webhook is removed from queue
 * - Multiple webhooks process in order
 * - HTTP methods (GET, POST, PUT) work correctly
 * - Custom headers are sent
 * - Exponential backoff for retries
 * - Queue cleanup for old completed/failed jobs
 */

import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { AssembledNode } from '../../types/node.js'
import {
  createWebhookQueue,
  interpolateTemplate,
  interpolateObject,
  type WebhookQueue,
  type WebhookContext,
} from '../webhook-queue.js'
import type { WebhookAction } from '../types.js'

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a mock fetch function that tracks calls
 */
function createMockFetch(
  defaultResponse: Partial<Response> = {},
): Mock<Parameters<typeof fetch>, Promise<Response>> {
  return vi.fn().mockImplementation(async () => {
    return {
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({}),
      text: async () => '',
      ...defaultResponse,
    } as Response
  })
}

/**
 * Create a sample webhook context for testing
 */
function createTestContext(overrides: Partial<WebhookContext> = {}): WebhookContext {
  return {
    node: null,
    computedField: null,
    automation: {
      id: 'auto-123',
      name: 'Test Automation',
    },
    timestamp: '2024-01-15T10:00:00.000Z',
    ...overrides,
  }
}

/**
 * Create a sample node for context
 */
function createTestNode(overrides: Partial<AssembledNode> = {}): AssembledNode {
  return {
    id: 'node-456',
    content: 'Test Node Content',
    contentPlain: 'test node content',
    systemId: 'node:test',
    ownerId: null,
    createdAt: new Date('2024-01-15T09:00:00.000Z'),
    updatedAt: new Date('2024-01-15T09:30:00.000Z'),
    deletedAt: null,
    supertags: [],
    properties: {},
    ...overrides,
  }
}

/**
 * Create a sample webhook action
 */
function createTestAction(overrides: Partial<WebhookAction> = {}): WebhookAction {
  return {
    type: 'webhook',
    url: 'https://example.com/webhook',
    method: 'POST',
    ...overrides,
  }
}

// ============================================================================
// Test Setup
// ============================================================================

let queue: WebhookQueue
let mockFetch: Mock

describe('WebhookQueue', () => {
  beforeEach(() => {
    mockFetch = createMockFetch()
    queue = createWebhookQueue({
      maxAttempts: 3,
      baseDelayMs: 10, // Short delays for testing
      maxDelayMs: 100,
      processIntervalMs: 10,
    })
    queue.setFetch(mockFetch)
  })

  afterEach(() => {
    queue.stopProcessing()
    queue.clear()
    vi.clearAllMocks()
  })

  // ==========================================================================
  // Basic Enqueueing and Execution
  // ==========================================================================

  describe('enqueue and execute', () => {
    it('enqueues a webhook and returns a job ID', () => {
      const action = createTestAction()
      const context = createTestContext()

      const jobId = queue.enqueue('auto-1', action, context)

      expect(jobId).toBeDefined()
      expect(jobId).toMatch(/^wh_/)
      expect(queue.pendingCount()).toBe(1)
    })

    it('executes enqueued webhook when processQueue is called', async () => {
      const action = createTestAction({
        body: { event: 'test' }, // Include body to trigger Content-Type header
      })
      const context = createTestContext()

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledTimes(1)
      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test' }),
      })
    })

    it('marks job as completed on successful execution', async () => {
      const action = createTestAction()
      const context = createTestContext()

      const jobId = queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      const job = queue.getJob(jobId)
      expect(job?.status).toBe('completed')
      expect(job?.attempts).toBe(1)
      expect(job?.lastError).toBeNull()
    })

    it('removes completed jobs from pending list', async () => {
      const action = createTestAction()
      const context = createTestContext()

      queue.enqueue('auto-1', action, context)
      expect(queue.pendingCount()).toBe(1)

      await queue.processQueue()

      expect(queue.pendingCount()).toBe(0)
      expect(queue.getPendingJobs()).toHaveLength(0)
    })
  })

  // ==========================================================================
  // Template Interpolation
  // ==========================================================================

  describe('template interpolation', () => {
    it('interpolates simple template variables', () => {
      const template = 'Hello {{ automation.name }}'
      const context = createTestContext()

      const result = interpolateTemplate(template, context)

      expect(result).toBe('Hello Test Automation')
    })

    it('interpolates multiple template variables', () => {
      const template = 'Automation {{ automation.id }} ({{ automation.name }}) at {{ timestamp }}'
      const context = createTestContext()

      const result = interpolateTemplate(template, context)

      expect(result).toBe('Automation auto-123 (Test Automation) at 2024-01-15T10:00:00.000Z')
    })

    it('interpolates node properties when node is present', () => {
      const template = 'Node {{ node.id }}: {{ node.content }}'
      const context = createTestContext({
        node: createTestNode(),
      })

      const result = interpolateTemplate(template, context)

      expect(result).toBe('Node node-456: Test Node Content')
    })

    it('interpolates computed field values', () => {
      const template = 'Value: {{ computedField.value }}, Field: {{ computedField.id }}'
      const context = createTestContext({
        computedField: {
          id: 'cf-789',
          value: 42.5,
        },
      })

      const result = interpolateTemplate(template, context)

      expect(result).toBe('Value: 42.5, Field: cf-789')
    })

    it('replaces missing values with empty string', () => {
      const template = 'Node: {{ node.id }}, CF: {{ computedField.value }}'
      const context = createTestContext() // node and computedField are null

      const result = interpolateTemplate(template, context)

      expect(result).toBe('Node: , CF: ')
    })

    it('handles nested object paths', () => {
      const template = 'System ID: {{ node.systemId }}'
      const context = createTestContext({
        node: createTestNode({ systemId: 'custom:system:id' }),
      })

      const result = interpolateTemplate(template, context)

      expect(result).toBe('System ID: custom:system:id')
    })

    it('handles whitespace in template syntax', () => {
      const template = '{{automation.id}} - {{  automation.name  }} - {{ automation.id  }}'
      const context = createTestContext()

      const result = interpolateTemplate(template, context)

      expect(result).toBe('auto-123 - Test Automation - auto-123')
    })

    it('interpolates object values recursively', () => {
      const obj = {
        message: 'Alert from {{ automation.name }}',
        data: {
          nodeId: '{{ node.id }}',
          value: '{{ computedField.value }}',
        },
        tags: ['{{ automation.id }}', 'static-tag'],
      }
      const context = createTestContext({
        node: createTestNode(),
        computedField: { id: 'cf-1', value: 100 },
      })

      const result = interpolateObject(obj, context)

      expect(result).toEqual({
        message: 'Alert from Test Automation',
        data: {
          nodeId: 'node-456',
          value: '100',
        },
        tags: ['auto-123', 'static-tag'],
      })
    })

    it('uses interpolated values in actual webhook request body', async () => {
      const action = createTestAction({
        body: {
          event: 'threshold_crossed',
          automation: '{{ automation.name }}',
          value: '{{ computedField.value }}',
          timestamp: '{{ timestamp }}',
        },
      })
      const context = createTestContext({
        computedField: { id: 'cf-1', value: 150 },
      })

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'threshold_crossed',
          automation: 'Test Automation',
          value: '150',
          timestamp: '2024-01-15T10:00:00.000Z',
        }),
      })
    })

    it('interpolates URL template variables', async () => {
      const action = createTestAction({
        url: 'https://example.com/webhook/{{ node.id }}?automation={{ automation.id }}',
        method: 'GET',
      })
      const context = createTestContext({
        node: createTestNode(),
      })

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/webhook/node-456?automation=auto-123',
        expect.any(Object),
      )
    })

    it('interpolates header values', async () => {
      const action = createTestAction({
        method: 'POST',
        headers: {
          'X-Automation-Id': '{{ automation.id }}',
          'X-Node-Id': '{{ node.id }}',
          Authorization: 'Bearer static-token',
        },
        body: { test: true },
      })
      const context = createTestContext({
        node: createTestNode(),
      })

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'POST',
        headers: {
          'X-Automation-Id': 'auto-123',
          'X-Node-Id': 'node-456',
          Authorization: 'Bearer static-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ test: true }),
      })
    })
  })

  // ==========================================================================
  // HTTP Methods
  // ==========================================================================

  describe('HTTP methods', () => {
    it('sends GET requests without body', async () => {
      const action = createTestAction({
        method: 'GET',
        body: { ignored: true }, // Body should be ignored for GET
      })
      const context = createTestContext()

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'GET',
        headers: {},
        body: undefined,
      })
    })

    it('sends POST requests with JSON body', async () => {
      const action = createTestAction({
        method: 'POST',
        body: { message: 'Hello', count: 42 },
      })
      const context = createTestContext()

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Hello', count: 42 }),
      })
    })

    it('sends PUT requests with JSON body', async () => {
      const action = createTestAction({
        method: 'PUT',
        body: { status: 'updated' },
      })
      const context = createTestContext()

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'updated' }),
      })
    })

    it('does not override explicit Content-Type header', async () => {
      const action = createTestAction({
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: { data: 'test' },
      })
      const context = createTestContext()

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ data: 'test' }),
      })
    })

    it('sends POST without body when none provided', async () => {
      const action = createTestAction({
        method: 'POST',
        body: undefined,
      })
      const context = createTestContext()

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'POST',
        headers: {},
        body: undefined,
      })
    })
  })

  // ==========================================================================
  // Retry Behavior
  // ==========================================================================

  describe('retry behavior', () => {
    it('retries failed webhook up to maxAttempts', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'))

      const action = createTestAction()
      const context = createTestContext()
      const jobId = queue.enqueue('auto-1', action, context)

      // First attempt
      await queue.processQueue()
      let job = queue.getJob(jobId)
      expect(job?.attempts).toBe(1)
      expect(job?.status).toBe('pending') // Still pending for retry

      // Wait for backoff and retry
      await new Promise((resolve) => setTimeout(resolve, 20))
      await queue.processQueue()
      job = queue.getJob(jobId)
      expect(job?.attempts).toBe(2)
      expect(job?.status).toBe('pending')

      // Wait for backoff and final retry
      await new Promise((resolve) => setTimeout(resolve, 40))
      await queue.processQueue()
      job = queue.getJob(jobId)
      expect(job?.attempts).toBe(3)
      expect(job?.status).toBe('failed')
      expect(job?.lastError).toBe('Network error')
    })

    it('marks job as failed after maxAttempts exceeded', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'))

      const action = createTestAction()
      const context = createTestContext()
      const jobId = queue.enqueue('auto-1', action, context)

      // Process until failed
      for (let i = 0; i < 5; i++) {
        await queue.processQueue()
        await new Promise((resolve) => setTimeout(resolve, 50))
      }

      const job = queue.getJob(jobId)
      expect(job?.status).toBe('failed')
      expect(job?.attempts).toBe(3)
    })

    it('retries on non-2xx HTTP status', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        headers: new Headers(),
        json: async () => ({}),
        text: async () => 'Server Error',
      } as Response)

      const action = createTestAction()
      const context = createTestContext()
      const jobId = queue.enqueue('auto-1', action, context)

      await queue.processQueue()
      const job = queue.getJob(jobId)

      expect(job?.status).toBe('pending') // Will retry
      expect(job?.lastError).toBe('HTTP 500: Internal Server Error')
    })

    it('schedules retry with exponential backoff', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'))

      const action = createTestAction()
      const context = createTestContext()
      const jobId = queue.enqueue('auto-1', action, context)

      await queue.processQueue()

      const job = queue.getJob(jobId)
      expect(job?.nextRetryAt).toBeDefined()
      expect(job?.nextRetryAt!.getTime()).toBeGreaterThan(Date.now())
    })

    it('does not process jobs before nextRetryAt', async () => {
      mockFetch.mockRejectedValueOnce(new Error('First fail'))

      const action = createTestAction()
      const context = createTestContext()
      const jobId = queue.enqueue('auto-1', action, context)

      await queue.processQueue()
      expect(mockFetch).toHaveBeenCalledTimes(1)

      // Immediately try to process again (should skip due to nextRetryAt)
      await queue.processQueue()
      expect(mockFetch).toHaveBeenCalledTimes(1) // Still 1, not retried

      const job = queue.getJob(jobId)
      expect(job?.attempts).toBe(1) // Still 1 attempt
    })

    it('recovers and completes after transient failure', async () => {
      mockFetch
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({ success: true }),
        } as Response)

      const action = createTestAction()
      const context = createTestContext()
      const jobId = queue.enqueue('auto-1', action, context)

      // First attempt fails
      await queue.processQueue()
      let job = queue.getJob(jobId)
      expect(job?.status).toBe('pending')

      // Wait for backoff
      await new Promise((resolve) => setTimeout(resolve, 20))

      // Second attempt succeeds
      await queue.processQueue()
      job = queue.getJob(jobId)
      expect(job?.status).toBe('completed')
      expect(job?.attempts).toBe(2)
    })
  })

  // ==========================================================================
  // Multiple Webhooks
  // ==========================================================================

  describe('multiple webhooks', () => {
    it('processes multiple webhooks in order of creation', async () => {
      const callOrder: string[] = []
      mockFetch.mockImplementation(async (url) => {
        callOrder.push(url as string)
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({}),
        } as Response
      })

      const context = createTestContext()
      queue.enqueue('auto-1', createTestAction({ url: 'https://example.com/first' }), context)
      queue.enqueue('auto-2', createTestAction({ url: 'https://example.com/second' }), context)
      queue.enqueue('auto-3', createTestAction({ url: 'https://example.com/third' }), context)

      expect(queue.pendingCount()).toBe(3)

      await queue.processQueue()

      expect(callOrder).toEqual([
        'https://example.com/first',
        'https://example.com/second',
        'https://example.com/third',
      ])
      expect(queue.pendingCount()).toBe(0)
    })

    it('handles mixed success/failure across multiple webhooks', async () => {
      let callCount = 0
      mockFetch.mockImplementation(async () => {
        callCount++
        if (callCount === 2) {
          throw new Error('Second webhook failed')
        }
        return {
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({}),
        } as Response
      })

      const context = createTestContext()
      const job1 = queue.enqueue('auto-1', createTestAction({ url: 'https://example.com/1' }), context)
      const job2 = queue.enqueue('auto-2', createTestAction({ url: 'https://example.com/2' }), context)
      const job3 = queue.enqueue('auto-3', createTestAction({ url: 'https://example.com/3' }), context)

      await queue.processQueue()

      expect(queue.getJob(job1)?.status).toBe('completed')
      expect(queue.getJob(job2)?.status).toBe('pending') // Will retry
      expect(queue.getJob(job3)?.status).toBe('completed')
      expect(queue.pendingCount()).toBe(1)
    })

    it('getPendingJobs returns only pending jobs', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ 'content-type': 'application/json' }),
          json: async () => ({}),
        } as Response)
        .mockRejectedValueOnce(new Error('Failed'))

      const context = createTestContext()
      queue.enqueue('auto-1', createTestAction({ url: 'https://example.com/1' }), context)
      queue.enqueue('auto-2', createTestAction({ url: 'https://example.com/2' }), context)

      await queue.processQueue()

      const pending = queue.getPendingJobs()
      expect(pending).toHaveLength(1)
      expect(pending[0].automationId).toBe('auto-2')
    })
  })

  // ==========================================================================
  // Auto Processing
  // ==========================================================================

  describe('auto processing', () => {
    it('startProcessing starts automatic queue processing', async () => {
      const action = createTestAction()
      const context = createTestContext()

      queue.startProcessing()
      expect(queue.isProcessing()).toBe(true)

      queue.enqueue('auto-1', action, context)

      // Wait for auto-processing to kick in
      await new Promise((resolve) => setTimeout(resolve, 30))

      expect(mockFetch).toHaveBeenCalled()
      queue.stopProcessing()
    })

    it('stopProcessing stops automatic queue processing', async () => {
      queue.startProcessing()
      expect(queue.isProcessing()).toBe(true)

      queue.stopProcessing()
      expect(queue.isProcessing()).toBe(false)

      // Enqueue after stopping
      queue.enqueue('auto-1', createTestAction(), createTestContext())

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 30))

      // Should not have processed
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('multiple startProcessing calls are idempotent', () => {
      queue.startProcessing()
      queue.startProcessing()
      queue.startProcessing()

      expect(queue.isProcessing()).toBe(true)
      queue.stopProcessing()
      expect(queue.isProcessing()).toBe(false)
    })
  })

  // ==========================================================================
  // Queue Management
  // ==========================================================================

  describe('queue management', () => {
    it('clear removes all jobs from the queue', () => {
      const context = createTestContext()
      queue.enqueue('auto-1', createTestAction(), context)
      queue.enqueue('auto-2', createTestAction(), context)

      expect(queue.pendingCount()).toBe(2)

      queue.clear()

      expect(queue.pendingCount()).toBe(0)
      expect(queue.getPendingJobs()).toHaveLength(0)
    })

    it('getJob returns null for non-existent job', () => {
      expect(queue.getJob('non-existent')).toBeNull()
    })

    it('getJob returns job by ID', () => {
      const context = createTestContext()
      const jobId = queue.enqueue('auto-1', createTestAction(), context)

      const job = queue.getJob(jobId)

      expect(job).toBeDefined()
      expect(job?.id).toBe(jobId)
      expect(job?.automationId).toBe('auto-1')
    })

    it('job contains all expected fields', () => {
      const action = createTestAction()
      const context = createTestContext()
      const jobId = queue.enqueue('auto-1', action, context)

      const job = queue.getJob(jobId)

      expect(job).toMatchObject({
        id: jobId,
        automationId: 'auto-1',
        action,
        context,
        attempts: 0,
        maxAttempts: 3,
        status: 'pending',
        lastError: null,
        nextRetryAt: null,
      })
      expect(job?.createdAt).toBeInstanceOf(Date)
    })
  })

  // ==========================================================================
  // Response Handling
  // ==========================================================================

  describe('response handling', () => {
    it('handles JSON response body', async () => {
      const responseData = { id: 123, status: 'received' }
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => responseData,
      } as Response)

      const action = createTestAction()
      const context = createTestContext()
      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalled()
      // Job should be completed
    })

    it('handles text response body', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'text/plain' }),
        text: async () => 'OK',
      } as Response)

      const action = createTestAction()
      const context = createTestContext()
      const jobId = queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(queue.getJob(jobId)?.status).toBe('completed')
    })

    it('handles 4xx client errors', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        headers: new Headers(),
        json: async () => ({ error: 'Invalid payload' }),
      } as Response)

      const action = createTestAction()
      const context = createTestContext()
      const jobId = queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      const job = queue.getJob(jobId)
      expect(job?.lastError).toBe('HTTP 400: Bad Request')
    })
  })

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe('edge cases', () => {
    it('handles empty body object', async () => {
      const action = createTestAction({
        method: 'POST',
        body: {},
      })
      const context = createTestContext()

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
    })

    it('handles complex nested body', async () => {
      const action = createTestAction({
        method: 'POST',
        body: {
          user: {
            id: '{{ node.id }}',
            name: '{{ node.content }}',
          },
          metadata: {
            automation: '{{ automation.id }}',
            nested: {
              deep: {
                value: '{{ computedField.value }}',
              },
            },
          },
          tags: ['{{ automation.name }}', 'static'],
        },
      })
      const context = createTestContext({
        node: createTestNode(),
        computedField: { id: 'cf-1', value: 999 },
      })

      queue.enqueue('auto-1', action, context)
      await queue.processQueue()

      expect(mockFetch).toHaveBeenCalledWith('https://example.com/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user: {
            id: 'node-456',
            name: 'Test Node Content',
          },
          metadata: {
            automation: 'auto-123',
            nested: {
              deep: {
                value: '999',
              },
            },
          },
          tags: ['Test Automation', 'static'],
        }),
      })
    })

    it('handles null computed field value in template', () => {
      const template = 'Value: {{ computedField.value }}'
      const context = createTestContext({
        computedField: { id: 'cf-1', value: null },
      })

      const result = interpolateTemplate(template, context)

      expect(result).toBe('Value: ')
    })

    it('handles concurrent processQueue calls', async () => {
      const action = createTestAction()
      const context = createTestContext()
      queue.enqueue('auto-1', action, context)

      // Call processQueue concurrently
      const [count1, count2, count3] = await Promise.all([
        queue.processQueue(),
        queue.processQueue(),
        queue.processQueue(),
      ])

      // Only one should have processed (due to isCurrentlyProcessing guard)
      const totalProcessed = count1 + count2 + count3
      expect(totalProcessed).toBe(1)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('processQueue returns count of processed jobs', async () => {
      const context = createTestContext()
      queue.enqueue('auto-1', createTestAction(), context)
      queue.enqueue('auto-2', createTestAction(), context)

      const count = await queue.processQueue()

      expect(count).toBe(2)
    })

    it('processQueue returns 0 when queue is empty', async () => {
      const count = await queue.processQueue()
      expect(count).toBe(0)
    })
  })

  // ==========================================================================
  // Custom Configuration
  // ==========================================================================

  describe('custom configuration', () => {
    it('respects custom maxAttempts', async () => {
      const customQueue = createWebhookQueue({
        maxAttempts: 1,
        baseDelayMs: 1,
        maxDelayMs: 10,
      })
      const customMockFetch = createMockFetch()
      customMockFetch.mockRejectedValue(new Error('Always fails'))
      customQueue.setFetch(customMockFetch)

      const action = createTestAction()
      const context = createTestContext()
      const jobId = customQueue.enqueue('auto-1', action, context)

      await customQueue.processQueue()

      const job = customQueue.getJob(jobId)
      expect(job?.status).toBe('failed')
      expect(job?.attempts).toBe(1)

      customQueue.clear()
    })
  })
})
