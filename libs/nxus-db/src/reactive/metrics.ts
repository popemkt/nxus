/**
 * metrics.ts - Performance metrics for the reactive query system
 *
 * This module provides observable metrics for monitoring and debugging
 * the reactive system's performance. It tracks:
 *
 * - Event counts (mutations emitted through the event bus)
 * - Query evaluation counts and cumulative time
 * - Active subscription counts
 * - Skipped evaluations (due to smart invalidation optimization)
 *
 * Metrics are collected via the singleton `reactiveMetrics` instance.
 * Services integrate with metrics by calling increment/record methods.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Snapshot of reactive system metrics
 */
export interface ReactiveMetricsSnapshot {
  /** Total number of mutation events emitted through the event bus */
  eventCount: number

  /** Total number of query re-evaluations performed */
  evaluationCount: number

  /** Cumulative time spent evaluating queries (milliseconds) */
  evaluationTimeMs: number

  /** Current number of active query subscriptions */
  activeSubscriptions: number

  /** Number of evaluations skipped due to smart invalidation */
  skippedEvaluations: number

  /** Timestamp when metrics were last reset */
  lastResetAt: Date
}

/**
 * Reactive metrics collector interface
 */
export interface ReactiveMetrics {
  /**
   * Get a snapshot of all current metrics
   */
  getMetrics(): ReactiveMetricsSnapshot

  /**
   * Reset all counters to zero (for testing)
   * Does not affect activeSubscriptions (that's a gauge, not a counter)
   */
  resetMetrics(): void

  /**
   * Increment the event counter (called by event bus on emit)
   * @internal
   */
  incrementEventCount(): void

  /**
   * Record a query evaluation
   * @param durationMs - Time taken for the evaluation in milliseconds
   * @internal
   */
  recordEvaluation(durationMs: number): void

  /**
   * Update the active subscription count (called by subscription service)
   * @param count - Current number of active subscriptions
   * @internal
   */
  setActiveSubscriptions(count: number): void

  /**
   * Increment the skipped evaluations counter (called when smart invalidation skips a query)
   * @internal
   */
  incrementSkippedEvaluations(): void
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Create a new ReactiveMetrics instance
 */
export function createReactiveMetrics(): ReactiveMetrics {
  let eventCount = 0
  let evaluationCount = 0
  let evaluationTimeMs = 0
  let activeSubscriptions = 0
  let skippedEvaluations = 0
  let lastResetAt = new Date()

  return {
    getMetrics(): ReactiveMetricsSnapshot {
      return {
        eventCount,
        evaluationCount,
        evaluationTimeMs,
        activeSubscriptions,
        skippedEvaluations,
        lastResetAt,
      }
    },

    resetMetrics(): void {
      eventCount = 0
      evaluationCount = 0
      evaluationTimeMs = 0
      skippedEvaluations = 0
      // Note: activeSubscriptions is a gauge, not reset
      lastResetAt = new Date()
    },

    incrementEventCount(): void {
      eventCount++
    },

    recordEvaluation(durationMs: number): void {
      evaluationCount++
      evaluationTimeMs += durationMs
    },

    setActiveSubscriptions(count: number): void {
      activeSubscriptions = count
    },

    incrementSkippedEvaluations(): void {
      skippedEvaluations++
    },
  }
}

// ============================================================================
// Singleton
// ============================================================================

/**
 * Singleton metrics instance for the reactive system
 *
 * Services should use this instance to record metrics:
 * - Event bus calls `incrementEventCount()` on each emit
 * - Query subscription service calls `recordEvaluation()` and `setActiveSubscriptions()`
 * - Smart invalidation calls `incrementSkippedEvaluations()` when skipping
 */
export const reactiveMetrics = createReactiveMetrics()
