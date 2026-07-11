import { afterEach, describe, expect, it } from 'vitest'
import { SYSTEM_FIELDS } from '../schemas/node-schema.js'
import {
  createNode,
  getSystemNode,
  setProperty,
} from '../services/node.service.js'
import { evaluateQuery } from '../services/query-evaluator.service.js'
import { seedGraph, type SeededGraph } from './seed-graph.js'
import { readTreeBFS } from './tree-read.js'

interface TimedSeed {
  graph: SeededGraph
  seedMs: number
}

let liveGraphs: SeededGraph[] = []

function cleanupGraphs(): void {
  for (const graph of liveGraphs.splice(0)) {
    graph.cleanup()
  }
}

function timedSeed(nodeCount: number): TimedSeed {
  const graph = seedGraph({ nodeCount })
  liveGraphs.push(graph)
  return { graph, seedMs: graph.counts.seedMs }
}

function measureMs(run: () => void): number {
  const start = performance.now()
  run()
  return performance.now() - start
}

async function measureMsAsync(run: () => Promise<void>): Promise<number> {
  const start = performance.now()
  await run()
  return performance.now() - start
}

function measureSupertagQuery(graph: SeededGraph): number {
  return measureMs(() => {
    evaluateQuery(graph.db, {
      filters: [{ type: 'supertag', supertagId: graph.supertagSystemIds[0]!, includeInherited: false }],
      limit: 500,
    })
  })
}

describe.skipIf(process.env.NXUS_PERF !== '1')('env-gated @nxus/db performance budgets', () => {
  afterEach(() => {
    cleanupGraphs()
  })

  it('keeps 10k API-level costs within deliberately loose absolute budgets', async () => {
    const { graph, seedMs } = timedSeed(10_000)
    const rootId = graph.rootIds[0]!
    const fullTreeMs = await measureMsAsync(async () => {
      await readTreeBFS(graph.db, rootId)
    })
    const supertagQueryMs = measureSupertagQuery(graph)
    const createNodeMs = measureMs(() => {
      const nodeId = createNode(graph.db, { content: 'budget leaf', ownerId: rootId })
      setProperty(graph.db, nodeId, SYSTEM_FIELDS.ORDER, 10_000_000)
    })

    expect(seedMs).toBeLessThan(60_000)
    expect(fullTreeMs).toBeLessThan(5_000)
    expect(supertagQueryMs).toBeLessThan(100)
    expect(createNodeMs).toBeLessThan(100)
  }, 120_000)

  it('keeps full-tree read growth sub-quadratic from 10k to 20k', async () => {
    const ten = timedSeed(10_000)
    const twenty = timedSeed(20_000)

    const tenReadMs = await measureMsAsync(async () => {
      await readTreeBFS(ten.graph.db, ten.graph.rootIds[0]!)
    })
    const twentyReadMs = await measureMsAsync(async () => {
      await readTreeBFS(twenty.graph.db, twenty.graph.rootIds[0]!)
    })
    const ratio = twentyReadMs / Math.max(tenReadMs, 1)

    expect(ratio).toBeLessThan(3.5)
  }, 180_000)

  it.skipIf(process.env.NXUS_PERF_50K !== '1')('smokes 50k seed, tree read, and query with scaled budgets', async () => {
    const { graph, seedMs } = timedSeed(50_000)
    const rootId = graph.rootIds[0]!
    const fullTreeMs = await measureMsAsync(async () => {
      await readTreeBFS(graph.db, rootId)
    })
    const queryMs = measureSupertagQuery(graph)

    expect(seedMs).toBeLessThan(300_000)
    expect(fullTreeMs).toBeLessThan(25_000)
    expect(queryMs).toBeLessThan(5_000)

    const fieldNode = getSystemNode(graph.db, graph.fieldSystemIds[0]!)
    expect(fieldNode).not.toBeNull()
  }, 360_000)
})
