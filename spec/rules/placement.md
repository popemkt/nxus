---
id: placement
scope: docs
principle: Separation of concerns
enforcement: prose
gate: —
---

# Placement rule

Invalidated by: policy decisions about where documentation lives.

Every piece of documentation is placed by answering ONE question: **"what invalidates this text?"** The full invalidator → directory table is owned by [../README.md](../README.md); this rule makes it binding:

1. Text invalidated by a **product** decision → `spec/product/`. By an **implementation** decision → `spec/tech/`. By a **workflow/policy** decision → `spec/rules/`. By a **substrate discovery** → `learnings/` (see [learnings.md](learnings.md)).
2. Text invalidated by **nothing** (derivable from code: registries, indexes, port tables) MUST be generated, never hand-written — see [generated-registries.md](generated-registries.md).
3. **Exploratory text** — thinking with no paired implementation or decision yet — goes to `docs/notes/`, dated (`YYYY-MM-DD-<slug>.md`), and is explicitly non-normative. It MUST NOT use MUST/SHOULD language. When the exploration becomes a decision, its durable content moves into `spec/` and the note is left behind (or archived) as history.
4. Historical/superseded documents are frozen in `docs/archived/` — never edited, never cited as canonical.
5. A document that mixes invalidators MUST be split. Mixed docs are how the pre-spec tree rotted: one file held product claims, stale port tables, and roadmap fossils, and no single decision could invalidate it cleanly.

Corollary — **no orphan normative text**: normative claims outside `spec/` (in README, code comments, `.claude/rules/`) are either caches of a `spec/` home (updated in the same commit as their source, per `spec/README.md`) or misplaced.

**Drift mode:** this rule drifts when normative text accumulates outside `spec/` or when `docs/notes/` content gets cited as if canonical. Detection is review-time; the remedy is moving text to its invalidator-determined home, recording `DRIFT:` if the move is deferred.
