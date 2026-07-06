---
id: drift
scope: docs
principle: Traceability
enforcement: prose
gate: —
---

# Drift rule

Invalidated by: policy decisions about how spec/code divergence is recorded.

Spec and code WILL diverge. The goal is not zero drift — it is **zero invisible drift**. Every known divergence between what a spec file claims and what the code does MUST be recorded, at the point in the spec where the claim is made, as a `DRIFT:` block:

```
DRIFT: <searchable title>
- canonical: <what the spec says should be true>
- current: <what the code does> (file:line)
- impact: <risk of the divergence>
- closes: <what change would close it>
```

Rules:

1. The marker is the literal string `DRIFT:` — searchable repo-wide (`grep -rn "DRIFT:" spec/`). Do not use `TODO`, `FIXME`, `NGH`, or prose hedging ("currently", "for now") as a substitute.
2. A `DRIFT:` block lives in the spec file that owns the canonical claim — never in code comments alone, never in a separate drift ledger.
3. **Closing drift:** the commit that makes code match spec MUST delete the block. A `DRIFT:` block describing already-fixed code is itself drift.
4. **Accepting drift:** if the team decides the *code* is right, the fix is a spec edit (change the canonical claim) plus deletion of the block — routed per [spec-first-change.md](spec-first-change.md).
5. In tests, `it.skip`/`test.skip` is a drift marker with the same obligations — see [testing.md](testing.md).

Why: intentional, visible drift is what lets a prototype-grade layer (e.g. the editor's fire-and-forget sync, `apps/nxus-editor/src/hooks/use-outline-sync.ts:40-48`) coexist with a canonical contract (`spec/tech/editor-sync.md`) without lying to the next reader.

**Drift mode:** this rule drifts when divergences are known but unrecorded, or when blocks outlive their closure. Both are found by review and by grepping `DRIFT:` during any spec edit; no automated staleness check exists yet.
