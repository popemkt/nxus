---
id: spec-first-change
scope: workflow
principle: Single source of truth
enforcement: prose
gate: —
---

# Spec-first change rule

Invalidated by: policy decisions about how changes flow through this repository.

The spec is the artifact of record; code is a materialization. Therefore:

1. **Spec edits precede code edits.** A change that alters observable behavior, the data model, an invariant, or an architectural boundary MUST land its spec edit in the same PR, and the spec edit MUST be written before (or with) the code — never as a follow-up.
2. **Routing:** functional changes (what nxus does) edit `spec/product/`; technical changes (how it does it) edit `spec/tech/`; workflow/policy changes edit `spec/rules/`. Placement is decided by the invalidation question in [placement.md](placement.md).
3. **Diverging code never merges silently.** If code must merge while contradicting the spec (prototype, hotfix, staged migration), the contradiction MUST be recorded as a `DRIFT:` block ([drift.md](drift.md)) in the owning spec file *in the same PR*. The reviewer's question is not "does the code match the spec?" but "is every mismatch recorded?"
4. Pure refactors (no observable change, no invariant touched) need no spec edit — but MUST fix any `path:line` citations they move.

Why: without this ordering the spec decays into documentation-after-the-fact, which is exactly the state the pre-spec `docs/` tree reached (multiple contradictory app lists, a removed `table` mode still mandated by session-loaded rules). Spec-first is the only mechanism that keeps `spec/` reimplementation-complete.

**Drift mode:** violations are commits that change behavior without touching `spec/`. Detection is human/agent review today (no CI diff-coupling check exists). When found, the remedy is a retroactive spec edit or `DRIFT:` block — not deletion of the offending code.
