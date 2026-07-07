---
id: harness-model
scope: meta
principle: — (layer 0 — the six principles derive from this model)
enforcement: prose
gate: —
guards: —
---

# Harness model (layer 0)

Invalidated by: a change in the typed model (`1d`) of the harness-model essay — not by tooling.

**The typed model is the all-encompassing source of truth.** The canonical form is the harness-model essay's `1d` card (external: `_playground/wip/harness-model-graphs.html` in the draiver worktree); the tower, the cast, the world sketch, the stabilizers, and the matrix principles are all lenses that project from it. This file is a normative compression for this repo; where they disagree, `1d` wins.

## The typed loop (compressed from 1d)

An agent saying "done" can fail exactly two ways — the wrong thing was built (intent→spec) or the right thing was built wrong (spec→code). Those are the two probabilistic membranes; everything below exists because of them.

- **Actors** (agency, authority, refusal): Intent Holder, Agent, Validator.
- **Processes** (consume inputs, produce outputs): Elicitation, Generation, Observation, Validation.
- **Artifacts / record**: Specification, Code, Evidence, Verdict, Record.
- **Environment / Phenomenon**: Runtime World, Exhibited Behavior.
- **Typed edges**: participates, consumes, produces, executes-in, exhibits, observed-as, yields, updates-record.

Invariants (checkable):

- I1 — node kinds (Actor, Process, Artifact, Environment, Phenomenon) are disjoint.
- I2 — every process consumes at least one input and produces at least one output.
- I3 — only actors participate in processes; artifacts do not act.
- I4 — Generation must consume Specification and produce Code; Observation must consume Behavior and produce Evidence.
- I5 — Validation must consume Specification plus Evidence and produce exactly one Verdict.
- I6 — a Verdict may update the Record; it never automatically rewrites the Specification. (`DRIFT:` blocks are this repo's I6 artifact: durable negative verdicts on the code–spec binding.)

## The `guards:` field

Every rule in `spec/rules/` declares `guards:` — the typed-model element(s) it keeps true: a node (`specification`, `code`, `evidence`, `verdict`, `record`, `runtime-world`, `behavior`), a process (`elicitation`, `generation`, `observation`, `validation`), or an invariant (`I1`–`I6`). `principle:` links a rule to the six derived principles (layer 1); `guards:` links it to the typed model (layer 0). A rule that can fill neither field is arbitrary and gets deleted. The rules index crossed with `guards:` is this repo's harness matrix; empty cells are recorded holes, not vibes.

## Derived lenses (non-normative)

The essay derives cross-cutting obligations from the loop (currently: durable record, capable agent, predictable world, legible work — explicitly "more to come", so they are NOT a tagging vocabulary here). Likewise the six nxus principles are projections: single source of truth and traceability serve the Record; determinism serves the Runtime World's comparability; fail-fast serves Observation (loud evidence at the boundary); separation of concerns and minimal complexity keep Validation affordable (I5). When the essay's lens set evolves, nothing in this repo needs re-tagging — only this section's parenthetical.

## Connecting to the source of truth

The essay is hand-authored HTML today. The intended end-state (per [generated-registries](generated-registries.md) logic, applied to the model itself): extract `1d` into a small versioned data artifact (nodes, kinds, edges, invariants), have the essay render from it, and let consuming repos vendor that artifact — then a check can validate every `guards:` value against the ontology instead of prose. Until that exists, this compression is the local reference and drift between it and the essay is recorded as `DRIFT:`.
