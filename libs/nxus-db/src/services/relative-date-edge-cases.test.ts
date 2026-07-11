/**
 * relative-date-edge-cases.test.ts - Adversarial edge cases for relative-date
 * keyword resolution (commit 6730400, extends relative-date.test.ts without
 * editing it).
 *
 * Covers: DST-boundary day windows, month arithmetic across short months,
 * year-boundary week/month windows, minimal rolling windows, midnight-exact
 * keyword resolution, and the evaluator's guard for a malformed 'relative'
 * filter with no relative range attached.
 *
 * DST tests stub `process.env.TZ` to 'America/New_York' for the duration of
 * a single `it()` (Node re-reads TZ per Date computation — verified: this
 * process's default zone is Asia/Saigon, which never observes DST, so
 * exercising the DST-boundary arithmetic requires forcing a zone that does).
 * The stub is restored in `afterEach` unconditionally so it can never leak
 * into other test files sharing this fork.
 */

import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import * as schema from '../schemas/item-schema.js'
import { clearSystemNodeCache, createNode } from './node.service.js'
import { evaluateTemporalFilter, resolveRelativeDateRange } from './query-evaluator.service.js'
import type { RelativeDateRange, TemporalFilter } from '../types/query.js'

function d(y: number, m: number, day: number, h = 0, min = 0): Date {
  return new Date(y, m, day, h, min)
}

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * ONE_HOUR_MS

describe('resolveRelativeDateRange — DST boundaries', () => {
  const originalTZ = process.env.TZ

  beforeEach(() => {
    process.env.TZ = 'America/New_York'
  })

  afterEach(() => {
    if (originalTZ === undefined) delete process.env.TZ
    else process.env.TZ = originalTZ
  })

  it("'today' on the US spring-forward day (2026-03-08, 2am->3am) is still [midnight, next midnight) — a 23-hour day, not corrupted", () => {
    const now = d(2026, 2, 8, 12, 0) // noon on the DST day itself
    const window = resolveRelativeDateRange({ kind: 'keyword', keyword: 'today' }, now)

    expect(window.start.getTime()).toBe(d(2026, 2, 8).getTime())
    expect(window.end.getTime()).toBe(d(2026, 2, 9).getTime())
    // The wall-clock day is 23 hours long across the spring-forward — proves
    // the window is computed via calendar-day arithmetic (setDate), not a
    // fixed 24h millisecond offset that would drift into the next day.
    expect(window.end.getTime() - window.start.getTime()).toBe(23 * ONE_HOUR_MS)
  })

  it("'yesterday' resolved the day after spring-forward covers exactly the 23-hour DST day, no drift", () => {
    const now = d(2026, 2, 9, 9, 0) // the day after
    const window = resolveRelativeDateRange({ kind: 'keyword', keyword: 'yesterday' }, now)

    expect(window.start.getTime()).toBe(d(2026, 2, 8).getTime())
    expect(window.end.getTime()).toBe(d(2026, 2, 9).getTime())
    expect(window.end.getTime() - window.start.getTime()).toBe(23 * ONE_HOUR_MS)
  })

  it("'today' on the US fall-back day (2026-11-01, 2am->1am) is a 25-hour day, still [midnight, next midnight)", () => {
    const now = d(2026, 10, 1, 12, 0) // noon on the DST day itself
    const window = resolveRelativeDateRange({ kind: 'keyword', keyword: 'today' }, now)

    expect(window.start.getTime()).toBe(d(2026, 10, 1).getTime())
    expect(window.end.getTime()).toBe(d(2026, 10, 2).getTime())
    expect(window.end.getTime() - window.start.getTime()).toBe(25 * ONE_HOUR_MS)
  })

  it("rolling { direction: 'last', days: 1 } from the day after fall-back covers exactly the 25-hour DST day", () => {
    const now = d(2026, 10, 2, 9, 0)
    const window = resolveRelativeDateRange({ kind: 'rolling', direction: 'last', days: 1 }, now)

    expect(window.start.getTime()).toBe(d(2026, 10, 1).getTime())
    expect(window.end.getTime()).toBe(d(2026, 10, 2).getTime())
    expect(window.end.getTime() - window.start.getTime()).toBe(25 * ONE_HOUR_MS)
  })

  it('thisWeek spanning the spring-forward Sunday still starts Monday at local midnight, unaffected by the mid-week DST shift', () => {
    // 2026-03-08 is a Sunday; the ISO week is Mon 2026-03-02 .. Mon 2026-03-09.
    const now = d(2026, 2, 8, 15, 0)
    const window = resolveRelativeDateRange({ kind: 'keyword', keyword: 'thisWeek' }, now)

    expect(window.start.getTime()).toBe(d(2026, 2, 2).getTime())
    expect(window.end.getTime()).toBe(d(2026, 2, 9).getTime())
    // A week containing a spring-forward day is 24*7 - 1 hours, not exactly 7*24h.
    expect(window.end.getTime() - window.start.getTime()).toBe(7 * ONE_DAY_MS - ONE_HOUR_MS)
  })
})

describe('resolveRelativeDateRange — month arithmetic across short months', () => {
  it('lastMonth from March 31 resolves to Feb 1 .. Mar 1 (Feb has no 31st)', () => {
    const now = d(2026, 2, 31) // March 31, 2026
    const window = resolveRelativeDateRange({ kind: 'keyword', keyword: 'lastMonth' }, now)

    expect(window.start.getTime()).toBe(d(2026, 1, 1).getTime()) // Feb 1
    expect(window.end.getTime()).toBe(d(2026, 2, 1).getTime()) // Mar 1
  })

  it('nextMonth from Jan 31 resolves to Feb 1 .. Mar 1 (no overflow into March)', () => {
    const now = d(2026, 0, 31) // Jan 31, 2026
    const window = resolveRelativeDateRange({ kind: 'keyword', keyword: 'nextMonth' }, now)

    expect(window.start.getTime()).toBe(d(2026, 1, 1).getTime()) // Feb 1
    expect(window.end.getTime()).toBe(d(2026, 2, 1).getTime()) // Mar 1
  })

  it('thisMonth from Jan 31 stays within January (no 31-day overflow into Feb)', () => {
    const now = d(2026, 0, 31)
    const window = resolveRelativeDateRange({ kind: 'keyword', keyword: 'thisMonth' }, now)

    expect(window.start.getTime()).toBe(d(2026, 0, 1).getTime())
    expect(window.end.getTime()).toBe(d(2026, 1, 1).getTime())
  })
})

describe('resolveRelativeDateRange — year boundary', () => {
  it('lastWeek/thisWeek/nextWeek around New Year (Jan 1 2026 is a Thursday) all resolve to Monday-aligned windows across the boundary', () => {
    const now = d(2026, 0, 1, 10, 0) // Thu Jan 1, 2026

    const thisWeek = resolveRelativeDateRange({ kind: 'keyword', keyword: 'thisWeek' }, now)
    expect(thisWeek.start.getTime()).toBe(d(2025, 11, 29).getTime()) // Mon Dec 29, 2025
    expect(thisWeek.end.getTime()).toBe(d(2026, 0, 5).getTime()) // Mon Jan 5, 2026

    const lastWeek = resolveRelativeDateRange({ kind: 'keyword', keyword: 'lastWeek' }, now)
    expect(lastWeek.start.getTime()).toBe(d(2025, 11, 22).getTime())
    expect(lastWeek.end.getTime()).toBe(d(2025, 11, 29).getTime())

    const nextWeek = resolveRelativeDateRange({ kind: 'keyword', keyword: 'nextWeek' }, now)
    expect(nextWeek.start.getTime()).toBe(d(2026, 0, 5).getTime())
    expect(nextWeek.end.getTime()).toBe(d(2026, 0, 12).getTime())
  })

  it('lastMonth from January crosses into the previous year (Dec 1 .. Jan 1)', () => {
    const now = d(2026, 0, 10)
    const window = resolveRelativeDateRange({ kind: 'keyword', keyword: 'lastMonth' }, now)

    expect(window.start.getTime()).toBe(d(2025, 11, 1).getTime())
    expect(window.end.getTime()).toBe(d(2026, 0, 1).getTime())
  })
})

describe('resolveRelativeDateRange — rolling window minimal size and midnight-exact resolution', () => {
  it('rolling { direction: "last", days: 1 } is a single-day window: yesterday only', () => {
    const now = d(2026, 6, 15, 12, 0)
    const window = resolveRelativeDateRange({ kind: 'rolling', direction: 'last', days: 1 }, now)

    expect(window.start.getTime()).toBe(d(2026, 6, 14).getTime())
    expect(window.end.getTime()).toBe(d(2026, 6, 15).getTime())
    expect(window.end.getTime() - window.start.getTime()).toBe(ONE_DAY_MS)
  })

  it('rolling { direction: "next", days: 1 } is a single-day window: tomorrow only', () => {
    const now = d(2026, 6, 15, 12, 0)
    const window = resolveRelativeDateRange({ kind: 'rolling', direction: 'next', days: 1 }, now)

    expect(window.start.getTime()).toBe(d(2026, 6, 16).getTime())
    expect(window.end.getTime()).toBe(d(2026, 6, 17).getTime())
    expect(window.end.getTime() - window.start.getTime()).toBe(ONE_DAY_MS)
  })

  it("'today' resolved exactly AT midnight (now === startOfDay) still yields [that midnight, next midnight) — not the previous day", () => {
    const now = d(2026, 6, 15, 0, 0) // exactly midnight, zero seconds/ms
    const window = resolveRelativeDateRange({ kind: 'keyword', keyword: 'today' }, now)

    expect(window.start.getTime()).toBe(now.getTime())
    expect(window.end.getTime()).toBe(d(2026, 6, 16).getTime())
  })

  it("'yesterday' resolved exactly at midnight resolves to the prior calendar day, not the current one", () => {
    const now = d(2026, 6, 15, 0, 0)
    const window = resolveRelativeDateRange({ kind: 'keyword', keyword: 'yesterday' }, now)

    expect(window.start.getTime()).toBe(d(2026, 6, 14).getTime())
    expect(window.end.getTime()).toBe(now.getTime())
  })
})

describe("evaluateTemporalFilter op:'relative' — malformed filter guard", () => {
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

  it("op:'relative' with no `relative` range attached returns candidates UNCHANGED (schema forbids this shape at the type level, but the evaluator still guards it defensively)", () => {
    const a = createNode(db, { content: 'A' })
    const b = createNode(db, { content: 'B' })
    const candidates = new Set([a, b])

    // Deliberately construct the filter without `relative` — the type system
    // (TemporalFilterSchema) would reject this at a validation boundary, but
    // nothing stops a caller from building the object by hand and calling
    // the evaluator function directly, so the runtime guard must hold too.
    const filter = { type: 'temporal', field: 'createdAt', op: 'relative' } as unknown as TemporalFilter

    const result = evaluateTemporalFilter(db, filter, candidates)
    // The guard returns the candidateIds parameter itself (same reference) —
    // pin both the identity and the value so a future refactor that starts
    // copying/filtering the set is still caught by the value assertion.
    expect(result).toBe(candidates)
    expect(result).toEqual(new Set([a, b]))
  })

  it('an explicit `relative: undefined` on the filter object also falls through the guard unchanged', () => {
    const a = createNode(db, { content: 'A' })
    const candidates = new Set([a])
    const range: RelativeDateRange | undefined = undefined

    const filter: TemporalFilter = {
      type: 'temporal',
      field: 'createdAt',
      op: 'relative',
      relative: range,
    } as TemporalFilter

    const result = evaluateTemporalFilter(db, filter, candidates)
    expect(result).toEqual(candidates)
  })
})
