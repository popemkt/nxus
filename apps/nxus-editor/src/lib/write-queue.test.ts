/**
 * write-queue.test.ts — INV-7 ordering clause: per-node writes execute in
 * issue order, failures don't poison the chain, multi-key writes barrier
 * on every touched node, and temp→server id migration keeps pre-remap
 * writes ahead of post-remap ones.
 */

import { describe, expect, it } from 'vitest'
import { createWriteQueueRegistry } from './write-queue.js'

/** A task that records its start order and resolves when released. */
function gate(log: string[], name: string) {
  let release!: () => void
  const released = new Promise<void>((r) => {
    release = r
  })
  const task = async () => {
    log.push(`start:${name}`)
    await released
    log.push(`end:${name}`)
    return name
  }
  return { task, release }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('createWriteQueueRegistry', () => {
  it('INV8-B1: runs same-node writes strictly in issue order', async () => {
    const q = createWriteQueueRegistry()
    const log: string[] = []
    const a = gate(log, 'a')
    const b = gate(log, 'b')

    const pa = q.enqueue('n1', a.task)
    const pb = q.enqueue('n1', b.task)
    await tick()

    // b must not start while a is in flight
    expect(log).toEqual(['start:a'])
    b.release() // releasing b early must not let it overtake
    await tick()
    expect(log).toEqual(['start:a'])

    a.release()
    await Promise.all([pa, pb])
    expect(log).toEqual(['start:a', 'end:a', 'start:b', 'end:b'])
  })

  it('INV8-B2: runs writes for different nodes concurrently', async () => {
    const q = createWriteQueueRegistry()
    const log: string[] = []
    const a = gate(log, 'a')
    const b = gate(log, 'b')

    const pa = q.enqueue('n1', a.task)
    const pb = q.enqueue('n2', b.task)
    await tick()
    expect(log).toEqual(['start:a', 'start:b'])

    a.release()
    b.release()
    await Promise.all([pa, pb])
  })

  it('INV8-B3: a rejected write surfaces to its caller but does not block the next', async () => {
    const q = createWriteQueueRegistry()
    const failing = q.enqueue('n1', () => Promise.reject(new Error('boom')))
    const next = q.enqueue('n1', async () => 'ok')

    await expect(failing).rejects.toThrow('boom')
    await expect(next).resolves.toBe('ok')
  })

  it('INV8-B4: multi-key writes barrier on every touched node', async () => {
    const q = createWriteQueueRegistry()
    const log: string[] = []
    const a = gate(log, 'a') // on n1
    const swap = gate(log, 'swap') // on n1 + n2
    const b = gate(log, 'b') // on n2, issued after swap

    const pa = q.enqueue('n1', a.task)
    const pswap = q.enqueue(['n1', 'n2'], swap.task)
    const pb = q.enqueue('n2', b.task)
    await tick()

    // swap waits for a; b waits for swap
    expect(log).toEqual(['start:a'])
    a.release()
    await tick()
    expect(log).toEqual(['start:a', 'end:a', 'start:swap'])
    swap.release()
    await tick()
    expect(log.slice(3)).toEqual(['end:swap', 'start:b'])
    b.release()
    await Promise.all([pa, pswap, pb])
  })

  it('deduplicates repeated keys in one multi-key write', async () => {
    const q = createWriteQueueRegistry()
    const result = await q.enqueue(['n1', 'n1'], async () => 'once')
    expect(result).toBe('once')
  })

  it('INV8-B5: migrate re-keys the chain — post-remap writes wait for pre-remap ones', async () => {
    const q = createWriteQueueRegistry()
    const log: string[] = []
    const pre = gate(log, 'pre')

    const ppre = q.enqueue('temp-1', pre.task)
    q.migrate('temp-1', 'server-1')
    const post = gate(log, 'post')
    const ppost = q.enqueue('server-1', post.task)
    await tick()

    expect(log).toEqual(['start:pre'])
    pre.release()
    await tick()
    expect(log).toEqual(['start:pre', 'end:pre', 'start:post'])
    post.release()
    await Promise.all([ppre, ppost])
    // temp key chain is gone
    const fresh = gate(log, 'fresh')
    void q.enqueue('temp-1', fresh.task)
    await tick()
    expect(log.at(-1)).toBe('start:fresh')
    fresh.release()
  })

  it('INV8-B6: migrate merges when both keys already have chains', async () => {
    const q = createWriteQueueRegistry()
    const log: string[] = []
    const onTemp = gate(log, 'onTemp')
    const onServer = gate(log, 'onServer')
    const after = gate(log, 'after')

    const p1 = q.enqueue('temp-1', onTemp.task)
    const p2 = q.enqueue('server-1', onServer.task)
    q.migrate('temp-1', 'server-1')
    const p3 = q.enqueue('server-1', after.task)
    await tick()

    onTemp.release()
    await tick()
    // 'after' must wait for BOTH prior chains
    expect(log).not.toContain('start:after')
    onServer.release()
    await tick()
    expect(log).toContain('start:after')
    after.release()
    await Promise.all([p1, p2, p3])
  })

  it('cleans up settled tails (no unbounded growth)', async () => {
    const q = createWriteQueueRegistry()
    await q.enqueue('n1', async () => undefined)
    await q.enqueue('n2', async () => undefined)
    await tick()
    expect(q.size()).toBe(0)
  })
})
