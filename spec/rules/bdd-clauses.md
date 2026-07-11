---
id: bdd-clauses
scope: spec + tests
principle: Traceability
enforcement: ci
gate: scripts/check-bdd-clauses.mjs (.github/workflows/ci.yml lint job)
guards: artifact, I5
---

# BDD behavior clauses

Invalidated by: policy decisions about the unit of specification and spec↔test traceability.

Prose specs say why; behavior clauses say exactly what is guaranteed, one testable sentence at a time. A **behavior clause** is a coded Given/When/Then statement inside a spec file; the code is the stable join key between the spec and the test that proves it. Clauses are the spec unit of record for guarantees — prose remains for rationale, architecture, and narrative, but a guarantee that matters is a coded clause, and a coded clause without a guarding test is a visible gap, not an aspiration.

1. **Clause format.** `- **<CODE>** — Given …, when …, then …` under a "Behavior clauses" heading in the owning spec file. One clause = one observable guarantee. MUST/MUST NOT language inside the then-part where strength matters.
2. **Code format.** `<PREFIX>-B<n>`, where PREFIX names the contract (an existing invariant id like `INV8`, or a surface like `REST`). Codes are append-only: never renumber, never reuse a retired code (mark it `(retired <date>: reason)` instead). Sub-splits extend (`REST-B4a`), they don't shift neighbors.
3. **Test marking.** The guarding test carries the code verbatim at the start of its title: `it('REST-B4: returns 404 (not a crash) for malformed percent-encoding…')`. One clause may be guarded by several tests (same code prefix); one test may guard one clause only — if a test proves two clauses, split the test or merge the clauses.
4. **Coverage discipline.** A clause with no guarding test MUST be marked `(unguarded)` at the end of the clause line — searchable, like `DRIFT:`. Do NOT write a test whose only purpose is to remove the marker without asserting the real behavior; an honest `(unguarded)` beats a hollow test (tests exist for verification, regression protection, and side-effect elimination — never for coverage optics).
5. **Where clauses live.** In the spec file that owns the behavior (`spec/tech/*` for contracts, `spec/product/*` for user-observable behavior), next to the prose they sharpen — not in a separate clause registry. The test lives wherever that behavior is naturally tested (unit or e2e).
6. **Migration is opportunistic.** Existing prose guarantees convert to clauses when a task touches them (spec-first-change applies); dedicated retrofit waves are allowed but MUST map existing tests to clauses rather than writing new tests for already-guarded behavior.

Precedents: `INV8-B1..B6` in [../tech/editor-sync.md](../tech/editor-sync.md) §6 guarded by `apps/nxus-editor/src/lib/write-queue.test.ts`; `REST-B1..B6` in [../tech/actions.md](../tech/actions.md) guarded by `libs/nxus-rest/src/index.test.ts`.

Gate: `pnpm clauses:check` (`scripts/check-bdd-clauses.mjs`, CI lint job) fails on any clause that is neither guarded by a same-code test title nor marked `(unguarded)`, and on any orphan test-title code with no spec clause.
