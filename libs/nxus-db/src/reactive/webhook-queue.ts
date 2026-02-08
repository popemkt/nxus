/**
 * webhook-queue.ts - Async job queue for webhook execution
 *
 * This module implements a reliable webhook execution queue with:
 * - In-memory job queue with configurable retry support
 * - Template interpolation for URL, headers, and body
 * - Exponential backoff for failed requests
 * - Error logging for debugging
 *
 * Template variables supported:
 * - {{ node.id }} - Node ID
 * - {{ node.content }} - Node content
 * - {{ node.systemId }} - Node system ID
 * - {{ computedField.value }} - Computed field value (for threshold triggers)
 * - {{ computedField.id }} - Computed field ID
 * - {{ automation.id }} - Automation ID
 * - {{ automation.name }} - Automation name
 * - {{ timestamp }} - Current ISO timestamp
 */

import type { WebhookAction } from './types.js'
import type { AssembledNode } from '../types/node.js'

// ============================================================================
// Types
// ============================================================================

/**
 * Context for template interpolation
 */
export interface WebhookContext {
  node?: AssembledNode | null
  computedField?: {
    id: string
    value: number | null
  } | null
  automation: {
    id: string
    name: string
  }
  timestamp: string
}

/**
 * Webhook job in the queue
 */
export interface WebhookJob {
  id: string
  automationId: string
  action: WebhookAction
  context: WebhookContext
  attempts: number
  maxAttempts: number
  createdAt: Date
  nextRetryAt: Date | null
  lastError: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
}

/**
 * Result of a webhook execution attempt
 */
export interface WebhookResult {
  success: boolean
  statusCode?: number
  error?: string
  responseBody?: unknown
}

/**
 * Webhook queue configuration
 */
export interface WebhookQueueConfig {
  maxAttempts: number // Default: 3
  baseDelayMs: number // Base delay for exponential backoff (default: 1000ms)
  maxDelayMs: number // Maximum delay between retries (default: 30000ms)
  processIntervalMs: number // How often to check for pending jobs (default: 100ms)
}

/**
 * Webhook queue interface
 */
export interface WebhookQueue {
  /**
   * Enqueue a webhook for execution
   * @param automationId - ID of the automation that triggered this webhook
   * @param action - Webhook action configuration
   * @param context - Context for template interpolation
   * @returns Job ID
   */
  enqueue(automationId: string, action: WebhookAction, context: WebhookContext): string

  /**
   * Process pending webhooks (call this to trigger processing)
   * Returns number of jobs processed
   */
  processQueue(): Promise<number>

  /**
   * Get all pending jobs (for debugging)
   */
  getPendingJobs(): WebhookJob[]

  /**
   * Get job by ID
   */
  getJob(jobId: string): WebhookJob | null

  /**
   * Get number of pending jobs
   */
  pendingCount(): number

  /**
   * Clear all jobs (for testing)
   */
  clear(): void

  /**
   * Start automatic processing loop
   */
  startProcessing(): void

  /**
   * Stop automatic processing loop
   */
  stopProcessing(): void

  /**
   * Check if processing is active
   */
  isProcessing(): boolean

  /**
   * Set custom fetch function (for testing)
   */
  setFetch(fetchFn: typeof fetch): void
}

// ============================================================================
// Template Interpolation
// ============================================================================

/**
 * Interpolate template variables in a string
 * Supports: {{ node.id }}, {{ node.content }}, {{ computedField.value }}, etc.
 */
export function interpolateTemplate(template: string, context: WebhookContext): string {
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (match, path: string) => {
    const value = getNestedValue(context, path.trim())
    if (value === undefined || value === null) {
      return '' // Replace with empty string if not found
    }
    return String(value)
  })
}

/**
 * Get nested value from object by dot-notation path
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Interpolate template variables in an object (recursive)
 */
export function interpolateObject(
  obj: Record<string, unknown>,
  context: WebhookContext,
): Record<string, unknown> {
  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = interpolateTemplate(value, context)
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = interpolateObject(value as Record<string, unknown>, context)
    } else if (Array.isArray(value)) {
      result[key] = value.map((item) => {
        if (typeof item === 'string') {
          return interpolateTemplate(item, context)
        } else if (typeof item === 'object' && item !== null) {
          return interpolateObject(item as Record<string, unknown>, context)
        }
        return item
      })
    } else {
      result[key] = value
    }
  }

  return result
}

// ============================================================================
// Factory
// ============================================================================

const DEFAULT_CONFIG: WebhookQueueConfig = {
  maxAttempts: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  processIntervalMs: 100,
}

/**
 * Generate a unique job ID
 */
function generateJobId(): string {
  return `wh_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

/**
 * Calculate exponential backoff delay
 */
function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
): number {
  // Exponential backoff: baseDelay * 2^(attempt-1) with jitter
  const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1)
  const jitter = Math.random() * 0.3 * exponentialDelay // 0-30% jitter
  const delay = Math.min(exponentialDelay + jitter, maxDelayMs)
  return Math.floor(delay)
}

/**
 * Create a new webhook queue instance
 */
export function createWebhookQueue(config: Partial<WebhookQueueConfig> = {}): WebhookQueue {
  const fullConfig: WebhookQueueConfig = { ...DEFAULT_CONFIG, ...config }
  const jobs = new Map<string, WebhookJob>()
  let processingInterval: ReturnType<typeof setInterval> | null = null
  let processingPromise: Promise<number> | null = null

  // Allow custom fetch for testing
  let fetchFn: typeof fetch = globalThis.fetch

  /**
   * Execute a single webhook
   */
  async function executeWebhook(job: WebhookJob): Promise<WebhookResult> {
    const { action, context } = job

    try {
      // Interpolate URL
      const url = interpolateTemplate(action.url, context)

      // Interpolate headers
      const headers: Record<string, string> = {}
      if (action.headers) {
        for (const [key, value] of Object.entries(action.headers)) {
          headers[key] = interpolateTemplate(value, context)
        }
      }

      // Set default content-type for POST/PUT with body
      if ((action.method === 'POST' || action.method === 'PUT') && action.body) {
        if (!headers['Content-Type'] && !headers['content-type']) {
          headers['Content-Type'] = 'application/json'
        }
      }

      // Interpolate body
      let body: string | undefined
      if (action.body && (action.method === 'POST' || action.method === 'PUT')) {
        const interpolatedBody = interpolateObject(action.body, context)
        body = JSON.stringify(interpolatedBody)
      }

      // Execute request
      const response = await fetchFn(url, {
        method: action.method,
        headers,
        body,
      })

      // Parse response body if possible
      let responseBody: unknown
      try {
        const contentType = response.headers.get('content-type')
        if (contentType?.includes('application/json')) {
          responseBody = await response.json()
        } else {
          responseBody = await response.text()
        }
      } catch {
        responseBody = undefined
      }

      // Check if successful (2xx status codes)
      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          responseBody,
        }
      } else {
        return {
          success: false,
          statusCode: response.status,
          error: `HTTP ${response.status}: ${response.statusText}`,
          responseBody,
        }
      }
    } catch (error) {
      // Network error or other exception
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error occurred'
      return {
        success: false,
        error: errorMessage,
      }
    }
  }

  /**
   * Process a single job
   */
  async function processJob(job: WebhookJob): Promise<void> {
    // Skip if not ready for retry
    if (job.nextRetryAt && new Date() < job.nextRetryAt) {
      return
    }

    // Mark as processing
    job.status = 'processing'
    job.attempts += 1

    const result = await executeWebhook(job)

    if (result.success) {
      job.status = 'completed'
      job.lastError = null
      console.log(
        `[WebhookQueue] Webhook completed successfully for automation ${job.automationId} (job ${job.id})`,
      )
    } else {
      job.lastError = result.error || `HTTP ${result.statusCode}`

      if (job.attempts >= job.maxAttempts) {
        // Max retries exceeded
        job.status = 'failed'
        console.error(
          `[WebhookQueue] Webhook failed after ${job.attempts} attempts for automation ${job.automationId} (job ${job.id}): ${job.lastError}`,
        )
      } else {
        // Schedule retry
        job.status = 'pending'
        const delay = calculateBackoffDelay(
          job.attempts,
          fullConfig.baseDelayMs,
          fullConfig.maxDelayMs,
        )
        job.nextRetryAt = new Date(Date.now() + delay)
        console.warn(
          `[WebhookQueue] Webhook attempt ${job.attempts}/${job.maxAttempts} failed for automation ${job.automationId} (job ${job.id}): ${job.lastError}. Retrying in ${delay}ms`,
        )
      }
    }
  }

  return {
    enqueue(
      automationId: string,
      action: WebhookAction,
      context: WebhookContext,
    ): string {
      const jobId = generateJobId()
      const job: WebhookJob = {
        id: jobId,
        automationId,
        action,
        context,
        attempts: 0,
        maxAttempts: fullConfig.maxAttempts,
        createdAt: new Date(),
        nextRetryAt: null,
        lastError: null,
        status: 'pending',
      }
      jobs.set(jobId, job)
      return jobId
    },

    async processQueue(): Promise<number> {
      // If already processing, share the same promise so concurrent callers
      // await the same run instead of silently returning 0
      if (processingPromise) {
        return processingPromise
      }

      processingPromise = (async () => {
        let processedCount = 0

        try {
          const pendingJobs = Array.from(jobs.values()).filter(
            (job) => job.status === 'pending',
          )

          for (const job of pendingJobs) {
            await processJob(job)
            processedCount++
          }

          // Clean up completed/failed jobs older than 1 hour
          const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
          for (const [id, job] of jobs) {
            if (
              (job.status === 'completed' || job.status === 'failed') &&
              job.createdAt < oneHourAgo
            ) {
              jobs.delete(id)
            }
          }
        } finally {
          processingPromise = null
        }

        return processedCount
      })()

      return processingPromise
    },

    getPendingJobs(): WebhookJob[] {
      return Array.from(jobs.values()).filter((job) => job.status === 'pending')
    },

    getJob(jobId: string): WebhookJob | null {
      return jobs.get(jobId) || null
    },

    pendingCount(): number {
      return Array.from(jobs.values()).filter((job) => job.status === 'pending')
        .length
    },

    clear(): void {
      jobs.clear()
    },

    startProcessing(): void {
      if (processingInterval) {
        return // Already running
      }

      processingInterval = setInterval(() => {
        this.processQueue().catch((error) => {
          console.error('[WebhookQueue] Error processing queue:', error)
        })
      }, fullConfig.processIntervalMs)
    },

    stopProcessing(): void {
      if (processingInterval) {
        clearInterval(processingInterval)
        processingInterval = null
      }
    },

    isProcessing(): boolean {
      return processingInterval !== null
    },

    setFetch(fn: typeof fetch): void {
      fetchFn = fn
    },
  }
}

/**
 * Default singleton instance
 */
export const webhookQueue = createWebhookQueue()
