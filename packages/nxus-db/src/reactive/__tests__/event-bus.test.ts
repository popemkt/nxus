/**
 * event-bus.test.ts - Unit tests for the mutation event bus
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventBus } from '../event-bus.js'
import type { EventBus, MutationEvent, MutationListener } from '../types.js'

describe('EventBus', () => {
  let eventBus: EventBus

  beforeEach(() => {
    eventBus = createEventBus()
  })

  afterEach(() => {
    eventBus.clear()
  })

  /**
   * Helper to create a valid MutationEvent
   */
  function createEvent(overrides: Partial<MutationEvent> = {}): MutationEvent {
    return {
      type: 'node:created',
      timestamp: new Date(),
      nodeId: 'test-node-1',
      ...overrides,
    }
  }

  describe('emit()', () => {
    it('delivers events to all subscribed listeners', () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()
      const listener3 = vi.fn()

      eventBus.subscribe(listener1)
      eventBus.subscribe(listener2)
      eventBus.subscribe(listener3)

      const event = createEvent()
      eventBus.emit(event)

      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener1).toHaveBeenCalledWith(event)
      expect(listener2).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledWith(event)
      expect(listener3).toHaveBeenCalledTimes(1)
      expect(listener3).toHaveBeenCalledWith(event)
    })

    it('delivers no events when there are no subscribers', () => {
      // This should not throw
      const event = createEvent()
      expect(() => eventBus.emit(event)).not.toThrow()
    })

    it('delivers multiple events in order', () => {
      const events: MutationEvent[] = []
      const listener = vi.fn((event: MutationEvent) => {
        events.push(event)
      })

      eventBus.subscribe(listener)

      const event1 = createEvent({ nodeId: 'node-1' })
      const event2 = createEvent({ nodeId: 'node-2' })
      const event3 = createEvent({ nodeId: 'node-3' })

      eventBus.emit(event1)
      eventBus.emit(event2)
      eventBus.emit(event3)

      expect(events).toHaveLength(3)
      expect(events[0].nodeId).toBe('node-1')
      expect(events[1].nodeId).toBe('node-2')
      expect(events[2].nodeId).toBe('node-3')
    })
  })

  describe('subscribe()', () => {
    it('returns a working unsubscribe function', () => {
      const listener = vi.fn()

      const unsubscribe = eventBus.subscribe(listener)
      expect(eventBus.listenerCount()).toBe(1)

      // Emit first event - listener should receive it
      eventBus.emit(createEvent({ nodeId: 'event-1' }))
      expect(listener).toHaveBeenCalledTimes(1)

      // Unsubscribe
      unsubscribe()
      expect(eventBus.listenerCount()).toBe(0)

      // Emit second event - listener should NOT receive it
      eventBus.emit(createEvent({ nodeId: 'event-2' }))
      expect(listener).toHaveBeenCalledTimes(1) // Still 1, not 2
    })

    it('allows the same listener to be subscribed multiple times', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener)
      eventBus.subscribe(listener)

      expect(eventBus.listenerCount()).toBe(2)

      eventBus.emit(createEvent())
      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('unsubscribe only removes the specific subscription', () => {
      const listener = vi.fn()

      const unsub1 = eventBus.subscribe(listener)
      eventBus.subscribe(listener)

      expect(eventBus.listenerCount()).toBe(2)

      unsub1()
      expect(eventBus.listenerCount()).toBe(1)

      eventBus.emit(createEvent())
      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('unsubscribe is idempotent - calling multiple times has no effect', () => {
      const listener = vi.fn()

      const unsubscribe = eventBus.subscribe(listener)
      expect(eventBus.listenerCount()).toBe(1)

      unsubscribe()
      expect(eventBus.listenerCount()).toBe(0)

      // Calling again should not throw or have any effect
      unsubscribe()
      expect(eventBus.listenerCount()).toBe(0)
    })
  })

  describe('filter by event types', () => {
    it('only delivers events matching the type filter', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, { types: ['node:created'] })

      eventBus.emit(createEvent({ type: 'node:created' }))
      eventBus.emit(createEvent({ type: 'node:updated' }))
      eventBus.emit(createEvent({ type: 'node:deleted' }))
      eventBus.emit(createEvent({ type: 'node:created' }))

      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('handles multiple types in the filter', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, { types: ['node:created', 'node:deleted'] })

      eventBus.emit(createEvent({ type: 'node:created' }))
      eventBus.emit(createEvent({ type: 'node:updated' }))
      eventBus.emit(createEvent({ type: 'node:deleted' }))
      eventBus.emit(createEvent({ type: 'property:set' }))

      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('empty types array delivers all events', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, { types: [] })

      eventBus.emit(createEvent({ type: 'node:created' }))
      eventBus.emit(createEvent({ type: 'node:updated' }))
      eventBus.emit(createEvent({ type: 'property:set' }))

      expect(listener).toHaveBeenCalledTimes(3)
    })
  })

  describe('filter by fieldIds', () => {
    it('only delivers events with matching fieldId', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, { fieldIds: ['field:status'] })

      eventBus.emit(createEvent({ type: 'property:set', fieldId: 'field:status' }))
      eventBus.emit(createEvent({ type: 'property:set', fieldId: 'field:priority' }))
      eventBus.emit(createEvent({ type: 'property:set', fieldId: 'field:status' }))
      eventBus.emit(createEvent({ type: 'node:created' })) // No fieldId

      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('handles multiple fieldIds in the filter', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, { fieldIds: ['field:status', 'field:priority'] })

      eventBus.emit(createEvent({ type: 'property:set', fieldId: 'field:status' }))
      eventBus.emit(createEvent({ type: 'property:set', fieldId: 'field:priority' }))
      eventBus.emit(createEvent({ type: 'property:set', fieldId: 'field:other' }))

      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('events without fieldId do not match fieldIds filter', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, { fieldIds: ['field:status'] })

      eventBus.emit(createEvent({ type: 'node:created' }))
      eventBus.emit(createEvent({ type: 'node:updated' }))

      expect(listener).toHaveBeenCalledTimes(0)
    })
  })

  describe('filter by nodeIds', () => {
    it('only delivers events for matching nodeIds', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, { nodeIds: ['node-1', 'node-2'] })

      eventBus.emit(createEvent({ nodeId: 'node-1' }))
      eventBus.emit(createEvent({ nodeId: 'node-2' }))
      eventBus.emit(createEvent({ nodeId: 'node-3' }))
      eventBus.emit(createEvent({ nodeId: 'node-1' }))

      expect(listener).toHaveBeenCalledTimes(3)
    })

    it('single nodeId filter works correctly', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, { nodeIds: ['node-1'] })

      eventBus.emit(createEvent({ nodeId: 'node-1' }))
      eventBus.emit(createEvent({ nodeId: 'node-2' }))

      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('filter by supertagIds', () => {
    it('only delivers events with matching supertagId', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, { supertagIds: ['supertag:task'] })

      eventBus.emit(
        createEvent({ type: 'supertag:added', supertagId: 'supertag:task' }),
      )
      eventBus.emit(
        createEvent({ type: 'supertag:added', supertagId: 'supertag:project' }),
      )
      eventBus.emit(
        createEvent({ type: 'supertag:removed', supertagId: 'supertag:task' }),
      )

      expect(listener).toHaveBeenCalledTimes(2)
    })

    it('events without supertagId do not match supertagIds filter', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, { supertagIds: ['supertag:task'] })

      eventBus.emit(createEvent({ type: 'node:created' }))
      eventBus.emit(createEvent({ type: 'property:set', fieldId: 'field:status' }))

      expect(listener).toHaveBeenCalledTimes(0)
    })
  })

  describe('multiple filters combine with AND logic', () => {
    it('combines types and nodeIds filters with AND', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, {
        types: ['property:set'],
        nodeIds: ['node-1'],
      })

      // Matches both: type AND nodeId
      eventBus.emit(createEvent({ type: 'property:set', nodeId: 'node-1' }))

      // Matches type but not nodeId
      eventBus.emit(createEvent({ type: 'property:set', nodeId: 'node-2' }))

      // Matches nodeId but not type
      eventBus.emit(createEvent({ type: 'node:created', nodeId: 'node-1' }))

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('combines types and fieldIds filters with AND', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, {
        types: ['property:set'],
        fieldIds: ['field:status'],
      })

      // Matches both
      eventBus.emit(createEvent({ type: 'property:set', fieldId: 'field:status' }))

      // Matches type but not field
      eventBus.emit(createEvent({ type: 'property:set', fieldId: 'field:other' }))

      // Matches field but not type
      eventBus.emit(createEvent({ type: 'property:added', fieldId: 'field:status' }))

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('combines all three filters: types, nodeIds, and fieldIds', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, {
        types: ['property:set'],
        nodeIds: ['node-1'],
        fieldIds: ['field:status'],
      })

      // Matches all three
      eventBus.emit(
        createEvent({
          type: 'property:set',
          nodeId: 'node-1',
          fieldId: 'field:status',
        }),
      )

      // Missing type
      eventBus.emit(
        createEvent({
          type: 'property:added',
          nodeId: 'node-1',
          fieldId: 'field:status',
        }),
      )

      // Missing nodeId
      eventBus.emit(
        createEvent({
          type: 'property:set',
          nodeId: 'node-2',
          fieldId: 'field:status',
        }),
      )

      // Missing fieldId
      eventBus.emit(
        createEvent({ type: 'property:set', nodeId: 'node-1', fieldId: 'field:other' }),
      )

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('combines supertagIds with other filters', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, {
        types: ['supertag:added'],
        nodeIds: ['node-1'],
        supertagIds: ['supertag:task'],
      })

      // Matches all
      eventBus.emit(
        createEvent({
          type: 'supertag:added',
          nodeId: 'node-1',
          supertagId: 'supertag:task',
        }),
      )

      // Wrong supertag
      eventBus.emit(
        createEvent({
          type: 'supertag:added',
          nodeId: 'node-1',
          supertagId: 'supertag:project',
        }),
      )

      // Wrong node
      eventBus.emit(
        createEvent({
          type: 'supertag:added',
          nodeId: 'node-2',
          supertagId: 'supertag:task',
        }),
      )

      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('clear()', () => {
    it('removes all listeners', () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      eventBus.subscribe(listener1)
      eventBus.subscribe(listener2)

      expect(eventBus.listenerCount()).toBe(2)

      eventBus.clear()

      expect(eventBus.listenerCount()).toBe(0)

      eventBus.emit(createEvent())
      expect(listener1).not.toHaveBeenCalled()
      expect(listener2).not.toHaveBeenCalled()
    })

    it('clear is idempotent', () => {
      eventBus.subscribe(vi.fn())
      eventBus.clear()
      eventBus.clear()

      expect(eventBus.listenerCount()).toBe(0)
    })

    it('allows new subscriptions after clear', () => {
      const listener1 = vi.fn()
      const listener2 = vi.fn()

      eventBus.subscribe(listener1)
      eventBus.clear()
      eventBus.subscribe(listener2)

      eventBus.emit(createEvent())

      expect(listener1).not.toHaveBeenCalled()
      expect(listener2).toHaveBeenCalledTimes(1)
    })
  })

  describe('async listeners', () => {
    it('handles async listeners without blocking emit', async () => {
      let asyncResolved = false
      const asyncListener: MutationListener = async (_event) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        asyncResolved = true
      }

      const syncListener = vi.fn()

      eventBus.subscribe(asyncListener)
      eventBus.subscribe(syncListener)

      eventBus.emit(createEvent())

      // Sync listener should be called immediately
      expect(syncListener).toHaveBeenCalledTimes(1)

      // Async listener has not resolved yet
      expect(asyncResolved).toBe(false)

      // Wait for async listener to complete
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(asyncResolved).toBe(true)
    })

    it('async listener errors are caught and logged', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const failingAsyncListener: MutationListener = async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        throw new Error('Async failure')
      }

      const successListener = vi.fn()

      eventBus.subscribe(failingAsyncListener)
      eventBus.subscribe(successListener)

      eventBus.emit(createEvent())

      // Other listeners still called
      expect(successListener).toHaveBeenCalledTimes(1)

      // Wait for async error to be caught
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[EventBus] Async listener error')

      consoleErrorSpy.mockRestore()
    })

    it('multiple async listeners run concurrently', async () => {
      const callOrder: number[] = []

      const slowListener: MutationListener = async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        callOrder.push(1)
      }

      const fastListener: MutationListener = async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        callOrder.push(2)
      }

      eventBus.subscribe(slowListener)
      eventBus.subscribe(fastListener)

      eventBus.emit(createEvent())

      await new Promise((resolve) => setTimeout(resolve, 30))

      // Fast listener should complete before slow one (concurrent execution)
      expect(callOrder).toEqual([2, 1])
    })
  })

  describe('errors in one listener do not affect others', () => {
    it('sync listener throwing error does not prevent other listeners', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const failingListener: MutationListener = () => {
        throw new Error('Sync failure')
      }

      const listener1 = vi.fn()
      const listener2 = vi.fn()
      const listener3 = vi.fn()

      eventBus.subscribe(listener1)
      eventBus.subscribe(failingListener)
      eventBus.subscribe(listener2)
      eventBus.subscribe(listener3)

      eventBus.emit(createEvent())

      // All other listeners should still be called
      expect(listener1).toHaveBeenCalledTimes(1)
      expect(listener2).toHaveBeenCalledTimes(1)
      expect(listener3).toHaveBeenCalledTimes(1)

      expect(consoleErrorSpy).toHaveBeenCalled()
      expect(consoleErrorSpy.mock.calls[0][0]).toContain('[EventBus] Sync listener error')

      consoleErrorSpy.mockRestore()
    })

    it('multiple failing listeners do not affect working listeners', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const failingListener1: MutationListener = () => {
        throw new Error('Failure 1')
      }
      const failingListener2: MutationListener = () => {
        throw new Error('Failure 2')
      }

      const successListener = vi.fn()

      eventBus.subscribe(failingListener1)
      eventBus.subscribe(successListener)
      eventBus.subscribe(failingListener2)

      eventBus.emit(createEvent())

      expect(successListener).toHaveBeenCalledTimes(1)
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2)

      consoleErrorSpy.mockRestore()
    })
  })

  describe('listenerCount()', () => {
    it('returns 0 for empty event bus', () => {
      expect(eventBus.listenerCount()).toBe(0)
    })

    it('tracks subscriptions correctly', () => {
      const unsub1 = eventBus.subscribe(vi.fn())
      expect(eventBus.listenerCount()).toBe(1)

      const unsub2 = eventBus.subscribe(vi.fn())
      expect(eventBus.listenerCount()).toBe(2)

      unsub1()
      expect(eventBus.listenerCount()).toBe(1)

      unsub2()
      expect(eventBus.listenerCount()).toBe(0)
    })
  })

  describe('edge cases', () => {
    it('handles listener that unsubscribes itself', () => {
      const events: string[] = []

      let unsubscribe: () => void
      const selfUnsubscribingListener: MutationListener = (event) => {
        events.push(event.nodeId)
        unsubscribe()
      }

      unsubscribe = eventBus.subscribe(selfUnsubscribingListener)

      const otherListener = vi.fn((event: MutationEvent) => {
        events.push(`other-${event.nodeId}`)
      })
      eventBus.subscribe(otherListener)

      eventBus.emit(createEvent({ nodeId: 'event-1' }))
      eventBus.emit(createEvent({ nodeId: 'event-2' }))

      // Self-unsubscribing listener should only receive first event
      expect(events).toContain('event-1')
      expect(events).not.toContain('event-2')

      // Other listener should receive both
      expect(otherListener).toHaveBeenCalledTimes(2)
    })

    it('handles undefined filter gracefully', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, undefined)

      eventBus.emit(createEvent())

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('handles empty filter object', () => {
      const listener = vi.fn()

      eventBus.subscribe(listener, {})

      eventBus.emit(createEvent())

      expect(listener).toHaveBeenCalledTimes(1)
    })

    it('event object is passed by reference (not cloned)', () => {
      let receivedEvent: MutationEvent | null = null
      const listener = (event: MutationEvent) => {
        receivedEvent = event
      }

      eventBus.subscribe(listener)

      const originalEvent = createEvent()
      eventBus.emit(originalEvent)

      expect(receivedEvent).toBe(originalEvent) // Same reference
    })
  })
})
