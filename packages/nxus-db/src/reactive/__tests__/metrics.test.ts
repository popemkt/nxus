/**
 * metrics.test.ts - Unit tests for reactive system metrics
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createReactiveMetrics, reactiveMetrics } from '../metrics.js'
import type { ReactiveMetrics } from '../metrics.js'

describe('ReactiveMetrics', () => {
  let metrics: ReactiveMetrics

  beforeEach(() => {
    metrics = createReactiveMetrics()
  })

  describe('getMetrics()', () => {
    it('returns initial metrics with zero values', () => {
      const snapshot = metrics.getMetrics()

      expect(snapshot.eventCount).toBe(0)
      expect(snapshot.evaluationCount).toBe(0)
      expect(snapshot.evaluationTimeMs).toBe(0)
      expect(snapshot.activeSubscriptions).toBe(0)
      expect(snapshot.skippedEvaluations).toBe(0)
      expect(snapshot.lastResetAt).toBeInstanceOf(Date)
    })

    it('returns a snapshot (copy) of metrics', () => {
      const snapshot1 = metrics.getMetrics()
      metrics.incrementEventCount()
      const snapshot2 = metrics.getMetrics()

      // snapshot1 should not be affected by later changes
      expect(snapshot1.eventCount).toBe(0)
      expect(snapshot2.eventCount).toBe(1)
    })
  })

  describe('incrementEventCount()', () => {
    it('increments event count by 1', () => {
      expect(metrics.getMetrics().eventCount).toBe(0)

      metrics.incrementEventCount()
      expect(metrics.getMetrics().eventCount).toBe(1)

      metrics.incrementEventCount()
      expect(metrics.getMetrics().eventCount).toBe(2)
    })

    it('handles many increments correctly', () => {
      for (let i = 0; i < 1000; i++) {
        metrics.incrementEventCount()
      }
      expect(metrics.getMetrics().eventCount).toBe(1000)
    })
  })

  describe('recordEvaluation()', () => {
    it('increments evaluation count', () => {
      expect(metrics.getMetrics().evaluationCount).toBe(0)

      metrics.recordEvaluation(10)
      expect(metrics.getMetrics().evaluationCount).toBe(1)

      metrics.recordEvaluation(5)
      expect(metrics.getMetrics().evaluationCount).toBe(2)
    })

    it('accumulates evaluation time', () => {
      expect(metrics.getMetrics().evaluationTimeMs).toBe(0)

      metrics.recordEvaluation(10.5)
      expect(metrics.getMetrics().evaluationTimeMs).toBe(10.5)

      metrics.recordEvaluation(5.3)
      expect(metrics.getMetrics().evaluationTimeMs).toBeCloseTo(15.8, 5)
    })

    it('handles zero duration', () => {
      metrics.recordEvaluation(0)

      expect(metrics.getMetrics().evaluationCount).toBe(1)
      expect(metrics.getMetrics().evaluationTimeMs).toBe(0)
    })

    it('handles many evaluations correctly', () => {
      for (let i = 0; i < 100; i++) {
        metrics.recordEvaluation(1)
      }

      expect(metrics.getMetrics().evaluationCount).toBe(100)
      expect(metrics.getMetrics().evaluationTimeMs).toBe(100)
    })
  })

  describe('setActiveSubscriptions()', () => {
    it('sets active subscription count', () => {
      expect(metrics.getMetrics().activeSubscriptions).toBe(0)

      metrics.setActiveSubscriptions(5)
      expect(metrics.getMetrics().activeSubscriptions).toBe(5)
    })

    it('allows setting to any value (increase or decrease)', () => {
      metrics.setActiveSubscriptions(10)
      expect(metrics.getMetrics().activeSubscriptions).toBe(10)

      metrics.setActiveSubscriptions(3)
      expect(metrics.getMetrics().activeSubscriptions).toBe(3)

      metrics.setActiveSubscriptions(0)
      expect(metrics.getMetrics().activeSubscriptions).toBe(0)
    })
  })

  describe('incrementSkippedEvaluations()', () => {
    it('increments skipped evaluations count', () => {
      expect(metrics.getMetrics().skippedEvaluations).toBe(0)

      metrics.incrementSkippedEvaluations()
      expect(metrics.getMetrics().skippedEvaluations).toBe(1)

      metrics.incrementSkippedEvaluations()
      expect(metrics.getMetrics().skippedEvaluations).toBe(2)
    })

    it('handles many skipped evaluations', () => {
      for (let i = 0; i < 500; i++) {
        metrics.incrementSkippedEvaluations()
      }
      expect(metrics.getMetrics().skippedEvaluations).toBe(500)
    })
  })

  describe('resetMetrics()', () => {
    it('resets all counters to zero', () => {
      // Populate all metrics
      metrics.incrementEventCount()
      metrics.incrementEventCount()
      metrics.recordEvaluation(50)
      metrics.recordEvaluation(25)
      metrics.incrementSkippedEvaluations()

      // Reset
      metrics.resetMetrics()

      const snapshot = metrics.getMetrics()
      expect(snapshot.eventCount).toBe(0)
      expect(snapshot.evaluationCount).toBe(0)
      expect(snapshot.evaluationTimeMs).toBe(0)
      expect(snapshot.skippedEvaluations).toBe(0)
    })

    it('does NOT reset activeSubscriptions (it is a gauge, not a counter)', () => {
      metrics.setActiveSubscriptions(10)

      metrics.resetMetrics()

      // activeSubscriptions should NOT be reset
      expect(metrics.getMetrics().activeSubscriptions).toBe(10)
    })

    it('updates lastResetAt timestamp', () => {
      const beforeReset = metrics.getMetrics().lastResetAt

      // Wait a tiny bit to ensure timestamp changes
      const start = Date.now()
      while (Date.now() - start < 2) {
        // busy wait
      }

      metrics.resetMetrics()

      const afterReset = metrics.getMetrics().lastResetAt
      expect(afterReset.getTime()).toBeGreaterThanOrEqual(beforeReset.getTime())
    })

    it('allows new metrics to be recorded after reset', () => {
      metrics.incrementEventCount()
      metrics.resetMetrics()
      metrics.incrementEventCount()

      expect(metrics.getMetrics().eventCount).toBe(1)
    })
  })

  describe('combined metrics workflow', () => {
    it('tracks a realistic workflow correctly', () => {
      // Simulate: 3 mutations, 2 subscriptions, smart invalidation skips 1 eval each time
      metrics.setActiveSubscriptions(2)

      // First mutation
      metrics.incrementEventCount()
      metrics.recordEvaluation(5)
      metrics.incrementSkippedEvaluations()

      // Second mutation
      metrics.incrementEventCount()
      metrics.recordEvaluation(3)
      metrics.incrementSkippedEvaluations()

      // Third mutation - both subscriptions affected
      metrics.incrementEventCount()
      metrics.recordEvaluation(4)
      metrics.recordEvaluation(6)

      const snapshot = metrics.getMetrics()
      expect(snapshot.eventCount).toBe(3)
      expect(snapshot.evaluationCount).toBe(4)
      expect(snapshot.evaluationTimeMs).toBe(18) // 5 + 3 + 4 + 6
      expect(snapshot.activeSubscriptions).toBe(2)
      expect(snapshot.skippedEvaluations).toBe(2)
    })
  })
})

describe('reactiveMetrics singleton', () => {
  afterEach(() => {
    // Reset singleton after each test
    reactiveMetrics.resetMetrics()
    reactiveMetrics.setActiveSubscriptions(0)
  })

  it('is available as a singleton export', () => {
    expect(reactiveMetrics).toBeDefined()
    expect(reactiveMetrics.getMetrics).toBeTypeOf('function')
    expect(reactiveMetrics.resetMetrics).toBeTypeOf('function')
  })

  it('tracks metrics globally', () => {
    reactiveMetrics.incrementEventCount()
    reactiveMetrics.incrementEventCount()

    expect(reactiveMetrics.getMetrics().eventCount).toBe(2)
  })
})
