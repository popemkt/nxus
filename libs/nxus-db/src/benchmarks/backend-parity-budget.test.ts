/**
 * backend-parity-budget.test.ts — env-gated (NXUS_PERF=1) performance
 * budgets run through the NodeBackend interface against BOTH backends.
 *
 * Purpose (spec/rules/testing.md purpose 3): the SQLite path has absolute
 * budgets in perf-budget.test.ts, but the graph backend had zero
 * performance observation — a Surreal regression (or a pathological
 * SurQL pattern) would ship invisibly. This suite measures the same four
 * API-level operations on each backend and asserts deliberately LOOSE
 * absolute ceilings (machine variance safe); the per-run numbers and the
 * surreal/sqlite ratio are logged for trend reading, not asserted.
 *
 * Scale via NXUS_BENCH_N (default 1000 nodes). Storage is in-memory for
 * both (better-sqlite3 :memory:, embedded in-memory surrealkv) — this
 * measures engine + backend-adapter cost, not disk.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { SYSTEM_FIELDS, SYSTEM_SUPERTAGS } from '../schemas/node-schema.js'
import {
  createTestSqliteBackend,
  createTestSurrealBackend,
  type TestBackendContext,
} from '../services/backends/backend-test-factories.js'

const N = Number(process.env.NXUS_BENCH_N ?? 1000)
const SAMPLE = Math.min(100, N)

// Loose ceilings, scaled from N (per-1k-node allowances). These exist to
// catch order-of-magnitude regressions, not to benchmark precisely.
const BUDGET = {
  seedMsPer1k: 60_000,
  queryMs: 5_000,
  assembleSampleMs: 15_000,
  childrenBatchMs: 5_000,
}

interface SeededBackend {
  ctx: TestBackendContext
  rootIds: string[]
  allIds: string[]
  seedMs: number
}

async function seedBackend(ctx: TestBackendContext): Promise<SeededBackend> {
  const { backend } = ctx
  const rootIds: string[] = []
  const allIds: string[] = []

  const start = performance.now()
  const rootCount = Math.max(1, Math.floor(N / 50))
  for (let r = 0; r < rootCount; r++) {
    const rootId = await backend.createNode({ content: `bench-root-${r}` })
    rootIds.push(rootId)
    allIds.push(rootId)
  }
  for (let i = allIds.length; i < N; i++) {
    const ownerId = rootIds[i % rootIds.length]!
    const nodeId = await backend.createNode({
      content: `bench-node-${i}`,
      ownerId,
      // every 5th node carries the #Item supertag (query target)
      ...(i % 5 === 0 ? { supertagId: SYSTEM_SUPERTAGS.ITEM } : {}),
    })
    if (i % 3 === 0) {
      await backend.setProperty(nodeId, SYSTEM_FIELDS.STATUS, 'active')
    }
    allIds.push(nodeId)
  }
  const seedMs = performance.now() - start

  return { ctx, rootIds, allIds, seedMs }
}

async function measureMs(run: () => Promise<unknown>): Promise<number> {
  const start = performance.now()
  await run()
  return performance.now() - start
}

type BenchRow = {
  seedMs: number
  queryMs: number
  assembleMs: number
  childrenMs: number
}

const results = new Map<string, BenchRow>()
let liveCleanups: Array<() => Promise<void>> = []

afterEach(async () => {
  for (const cleanup of liveCleanups.splice(0)) await cleanup()
})

describe.skipIf(process.env.NXUS_PERF !== '1')(
  'env-gated backend-parity performance budgets',
  () => {
    describe.each([
      ['sqlite', createTestSqliteBackend],
      ['surreal', createTestSurrealBackend],
    ] as const)('%s backend', (name, factory) => {
      it(`keeps ${name} API-level costs within loose ceilings at N=${N}`, async () => {
        const ctx = await factory()
        liveCleanups.push(ctx.cleanup)
        const seeded = await seedBackend(ctx)
        const { backend } = ctx

        const queryMs = await measureMs(() =>
          backend.evaluateQuery({
            filters: [
              {
                type: 'supertag',
                supertagId: SYSTEM_SUPERTAGS.ITEM,
                includeInherited: false,
              },
            ],
            limit: 500,
          }),
        )

        const sampleIds = seeded.allIds.filter(
          (_, i) => i % Math.ceil(seeded.allIds.length / SAMPLE) === 0,
        )
        const assembleMs = await measureMs(async () => {
          for (const id of sampleIds) await backend.assembleNode(id)
        })

        const childrenMs = await measureMs(() =>
          backend.getChildrenByParents(seeded.rootIds),
        )

        results.set(name, { seedMs: seeded.seedMs, queryMs, assembleMs, childrenMs })
        console.log(
          `[bench:${name}] N=${N} seed=${seeded.seedMs.toFixed(0)}ms ` +
            `query=${queryMs.toFixed(0)}ms assemble(${sampleIds.length})=${assembleMs.toFixed(0)}ms ` +
            `childrenBatch=${childrenMs.toFixed(0)}ms`,
        )
        const other = results.get(name === 'sqlite' ? 'surreal' : 'sqlite')
        if (other) {
          const mine = results.get(name)!
          console.log(
            `[bench:ratio surreal/sqlite] ` +
              (name === 'surreal'
                ? `seed=${(mine.seedMs / other.seedMs).toFixed(1)}x query=${(mine.queryMs / other.queryMs).toFixed(1)}x assemble=${(mine.assembleMs / other.assembleMs).toFixed(1)}x children=${(mine.childrenMs / other.childrenMs).toFixed(1)}x`
                : `seed=${(other.seedMs / mine.seedMs).toFixed(1)}x query=${(other.queryMs / mine.queryMs).toFixed(1)}x assemble=${(other.assembleMs / mine.assembleMs).toFixed(1)}x children=${(other.childrenMs / mine.childrenMs).toFixed(1)}x`),
          )
        }

        expect(seeded.seedMs).toBeLessThan((BUDGET.seedMsPer1k * N) / 1000)
        expect(queryMs).toBeLessThan(BUDGET.queryMs)
        expect(assembleMs).toBeLessThan(BUDGET.assembleSampleMs)
        expect(childrenMs).toBeLessThan(BUDGET.childrenBatchMs)
      })
    })
  },
)
