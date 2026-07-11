/**
 * relative-date.test.ts - Relative-date query keywords
 *
 * Two layers:
 * 1. resolveRelativeDateRange — pure resolver, every keyword/rolling window
 *    against a FIXED injected clock (determinism principle: no hidden now).
 * 2. evaluateTemporalFilter op:'relative' — evaluation-time resolution:
 *    the same definition returns different node sets under different clocks.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import { nodes } from '../schemas/node-schema.js'
import { eq } from 'drizzle-orm'
import { clearSystemNodeCache, createNode } from './node.service.js'
import {
  evaluateTemporalFilter,
  resolveRelativeDateRange,
} from './query-evaluator.service.js'
import type { RelativeDateRange, TemporalFilter } from '../types/query.js'

// Wednesday 2026-07-15 12:00 local — mid-week, mid-month, so every window
// has distinct edges.
const CLOCK = new Date(2026, 6, 15, 12, 0, 0)

function d(y: number, m: number, day: number): Date {
  return new Date(y, m, day)
}

describe('resolveRelativeDateRange', () => {
  const cases: Array<[RelativeDateRange, Date, Date]> = [
    [{ kind: 'keyword', keyword: 'today' }, d(2026, 6, 15), d(2026, 6, 16)],
    [{ kind: 'keyword', keyword: 'yesterday' }, d(2026, 6, 14), d(2026, 6, 15)],
    [{ kind: 'keyword', keyword: 'tomorrow' }, d(2026, 6, 16), d(2026, 6, 17)],
    // ISO Monday weeks: 2026-07-15 is a Wednesday → week is Mon 13th .. Mon 20th
    [{ kind: 'keyword', keyword: 'thisWeek' }, d(2026, 6, 13), d(2026, 6, 20)],
    [{ kind: 'keyword', keyword: 'lastWeek' }, d(2026, 6, 6), d(2026, 6, 13)],
    [{ kind: 'keyword', keyword: 'nextWeek' }, d(2026, 6, 20), d(2026, 6, 27)],
    [{ kind: 'keyword', keyword: 'thisMonth' }, d(2026, 6, 1), d(2026, 7, 1)],
    [{ kind: 'keyword', keyword: 'lastMonth' }, d(2026, 5, 1), d(2026, 6, 1)],
    [{ kind: 'keyword', keyword: 'nextMonth' }, d(2026, 7, 1), d(2026, 8, 1)],
    // Rolling windows exclude today (symmetric with lastWeek/nextWeek)
    [{ kind: 'rolling', direction: 'last', days: 7 }, d(2026, 6, 8), d(2026, 6, 15)],
    [{ kind: 'rolling', direction: 'next', days: 3 }, d(2026, 6, 16), d(2026, 6, 19)],
  ]

  it.each(cases)('%j resolves to correct [start, end)', (range, start, end) => {
    const window = resolveRelativeDateRange(range, CLOCK)
    expect(window.start.getTime()).toBe(start.getTime())
    expect(window.end.getTime()).toBe(end.getTime())
  })

  it('week starts Monday even when now is Sunday', () => {
    // Sunday 2026-07-19 belongs to the week starting Mon 13th
    const sunday = new Date(2026, 6, 19, 8, 0, 0)
    const window = resolveRelativeDateRange(
      { kind: 'keyword', keyword: 'thisWeek' },
      sunday,
    )
    expect(window.start.getTime()).toBe(d(2026, 6, 13).getTime())
    expect(window.end.getTime()).toBe(d(2026, 6, 20).getTime())
  })

  it('month windows handle year boundaries', () => {
    const january = new Date(2026, 0, 10)
    const last = resolveRelativeDateRange(
      { kind: 'keyword', keyword: 'lastMonth' },
      january,
    )
    expect(last.start.getTime()).toBe(d(2025, 11, 1).getTime())
    expect(last.end.getTime()).toBe(d(2026, 0, 1).getTime())
  })
})

describe("evaluateTemporalFilter op:'relative'", () => {
  let sqlite: Database.Database
  let db: BetterSQLite3Database<typeof schema>

  beforeEach(() => {
    sqlite = new Database(':memory:')
    db = drizzle(sqlite, { schema })
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS nodes (
        id TEXT PRIMARY KEY,
        content TEXT,
        content_plain TEXT,
        system_id TEXT UNIQUE,
        owner_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS node_properties (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        node_id TEXT NOT NULL,
        field_node_id TEXT NOT NULL,
        value TEXT,
        "order" INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `)
    clearSystemNodeCache()
  })

  afterEach(() => {
    sqlite.close()
  })

  /** Create a node and force its created_at to a specific instant. */
  function nodeCreatedAt(when: Date): string {
    const id = createNode(db, { content: `node@${when.toISOString()}` })
    db.update(nodes).set({ createdAt: when }).where(eq(nodes.id, id)).run()
    return id
  }

  function relativeFilter(range: RelativeDateRange): TemporalFilter {
    return {
      type: 'temporal',
      field: 'createdAt',
      op: 'relative',
      relative: range,
    } as TemporalFilter
  }

  it("'today' matches only nodes created within the injected clock's day", () => {
    const inWindow = nodeCreatedAt(new Date(2026, 6, 15, 9, 30))
    const before = nodeCreatedAt(new Date(2026, 6, 14, 23, 59))
    const after = nodeCreatedAt(new Date(2026, 6, 16, 0, 1))

    const candidates = new Set([inWindow, before, after])
    const result = evaluateTemporalFilter(
      db,
      relativeFilter({ kind: 'keyword', keyword: 'today' }),
      candidates,
      CLOCK,
    )

    expect(result).toEqual(new Set([inWindow]))
  })

  it('same definition, different clocks → different result sets', () => {
    const july15 = nodeCreatedAt(new Date(2026, 6, 15, 10, 0))
    const july16 = nodeCreatedAt(new Date(2026, 6, 16, 10, 0))
    const candidates = new Set([july15, july16])
    const filter = relativeFilter({ kind: 'keyword', keyword: 'today' })

    const onThe15th = evaluateTemporalFilter(db, filter, candidates, CLOCK)
    const onThe16th = evaluateTemporalFilter(
      db,
      filter,
      candidates,
      new Date(2026, 6, 16, 12, 0),
    )

    expect(onThe15th).toEqual(new Set([july15]))
    expect(onThe16th).toEqual(new Set([july16]))
  })

  it("rolling 'last 7 days' excludes today and the 8th day back", () => {
    const sixDaysAgo = nodeCreatedAt(new Date(2026, 6, 9, 12, 0))
    const today = nodeCreatedAt(new Date(2026, 6, 15, 8, 0))
    const eightDaysAgo = nodeCreatedAt(new Date(2026, 6, 7, 12, 0))

    const result = evaluateTemporalFilter(
      db,
      relativeFilter({ kind: 'rolling', direction: 'last', days: 7 }),
      new Set([sixDaysAgo, today, eightDaysAgo]),
      CLOCK,
    )

    expect(result).toEqual(new Set([sixDaysAgo]))
  })
})
