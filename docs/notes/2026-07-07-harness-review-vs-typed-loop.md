# Harness review: nxus vs the typed-loop model — 2026-07-07

> **Addendum (same day):** the intent holder flagged the stabilizer framing as the weak link — stabilizers are explicitly "more to come" in the essays and must not become a tagging vocabulary. The implemented design (spec/rules/harness-model.md) therefore roots `guards:` in the **typed model itself** (nodes, processes, invariants I1–I6), and demotes stabilizers to a non-normative derived lens. §3's stabilizer-derivation table stands as analysis, not as the vocabulary.
>
> **Gap status (closed same day):** G1 → durable sign-off in feature-intake (`d9b4c09`); G2 → `scripts/check-spec-first.mjs` in CI (`3cd378d`); G3 → `Gates:` commit-trailer convention in AGENTS.md (`4baa99e`); G4 (lite) → `scripts/check-app-registry.mjs` in CI (`6fd9ceb`); G5 → two `check`-kind items now exist (the two scripts above); the hook cell remains empty, recorded in the rules index.

Date: 2026-07-07
Verdict: the nxus harness is a correct *materialization layer* but its principle layer is rooted one level too low. The typed loop (harness-model-graphs.html, 1d) is the right axiom set; the six nxus principles are derivable from its stabilizers and should be re-rooted as such. Everything else is gap-filling, listed below.

Sources reviewed: `_playground/wip/harness-model-graphs.html` (tower → cast → world → 1d typed model), `harness-matrix-demo.html` (5 principles × 10 kinds), `harness-model-graphs-companion-2026-06-16.md`.

## 1. The framework, distilled (what I take as axioms)

- Two failure modes only: **wrong thing built** (intent→spec membrane) and **right thing built wrong** (spec→code membrane). Every harness artifact exists to guard one of these, or it is decoration.
- Three actors: Intent Holder (wants, never crosses), Agent (crosses both hops, unproven), Validator (watches, exists *because* the translator is unproven).
- Typed loop: Elicitation → Specification; Generation → Code; Code executes-in Runtime World, exhibits Behavior; Observation → Evidence; Validation consumes Specification + Evidence → exactly one Verdict; Verdict updates Record (I5, I6).
- Four **derived stabilizers** (obligations, not ontology): Durable record, Capable agent, Predictable world, Legible work.
- The matrix (5 principles × 10 kinds) is a **completeness check**: every harness item is placed by which principle(s) it serves and what kind of thing it is; empty cells are visible.

The deep property: this framework gives a *derivation chain*. Loop → membranes → stabilizers → obligations → concrete items. An item that cannot name its ancestor in the chain is arbitrary and should be deleted. That is the "correct by construction" you asked for — construction *is* derivation.

## 2. Mapping: what nxus already instantiates

| Typed-model element | nxus materialization | Status |
|---|---|---|
| Specification (artifact) | `spec/product/`, `spec/tech/` | ✅ shipped, spec-as-source regime |
| Record (durable) | `spec/`, `learnings/`, `docs/notes/`, git history | ✅ |
| Code–spec binding membrane | `spec/rules/spec-first-change.md` (spec changes in same commit), `DRIFT:` blocks | ✅ partial — see gap G2 |
| Elicitation membrane | `.archon/workflows/feature-intake.yaml` | ⚠️ thin — see gap G1 |
| Evidence | typecheck/lint/unit/e2e outputs; e2e is the behavioral proof layer | ✅ produced, ❌ not retained (G3) |
| Verdict | commit + push after gates; `DRIFT:` when spec and code disagree | ⚠️ implicit — no verdict artifact (G3) |
| Predictable world | app/port registry (architecture.md), e2e DB isolation (`NXUS_DB_PATH`), seeded bootstrap | ✅ improved tonight |
| Capable agent | codebase-memory MCP, `learnings/`, `.claude/rules` caches, archon workflows | ✅ |
| Legible work | one-rule-per-file, conventional commits, small slices, honest enforcement column | ✅ |
| Encoded workflows (membranes as runnable graph) | `.archon/workflows/` | ⚠️ enforcement is still prose (README's honest note) |

`DRIFT:` deserves special mention: in loop terms it is a **durable negative Verdict on the code–spec binding that updates the Record instead of silently rewriting the Specification** — exactly invariant I6. It is the most model-faithful artifact in the repo.

## 3. The one structural critique: principles rooted one level too low

nxus's six principles (separation of concerns, SSOT, determinism, traceability, fail-fast, minimal complexity) are **generation-side quality principles**. They answer "what makes code good", not "why does the harness exist". They are real, but they are *theorems*, not axioms — each derives from a stabilizer:

| nxus principle | Derives from |
|---|---|
| Single source of truth | Durable record (one frozen reference) |
| Traceability (`path:line`, DRIFT) | Durable record + Legible work (evidence readable, verdicts recorded) |
| Determinism | Predictable world (runs comparable, evidence means something) |
| Fail-fast | Observation quality (invalid state → loud evidence at the boundary, not silent drift) |
| Separation of concerns | Legible work (small validatable units) |
| Minimal accidental complexity | Legible work (validation affordable) |

Notice: all six collapse into stabilizers. Nothing in the current principle set guards the **elicitation membrane** — the six principles are silent about "the wrong thing was built". That asymmetry is the tell that the root is misplaced.

**Best design** (recommendation): a two-layer principle system.

- **Layer 0 — the loop** (new `spec/rules/harness-model.md` or a section in `spec/README.md`): the two membranes, three actors, four stabilizers, invariants I1–I6. ~40 lines. This is the reasoning framework; it never changes with tooling.
- **Layer 1 — derived principles** (current six, kept): each annotated with its stabilizer ancestry, plus the missing elicitation-side principle (see G1).
- **Rule frontmatter gains `guards:`** — every rule in `spec/rules/` names the membrane or stabilizer it guards (`elicitation | code-spec-binding | durable-record | capable-agent | predictable-world | legible-work`). The existing `principle:` field keeps the layer-1 link; `guards:` adds the layer-0 link. A rule that can fill neither field gets deleted — that is the arbitrariness filter.
- **The matrix becomes generated**: `guards:` × a `kind:` field (spec/rule/workflow/check/test/hook/mcp/tool) reproduces the harness-matrix-demo grid mechanically from frontmatter. Empty cells = known holes, not vibes. This is SSOT applied to the harness itself.

## 4. Gaps (concrete, ordered)

- **G1 — Elicitation membrane under-guarded.** feature-intake.yaml exists but there is no encoded Intent-Holder sign-off step: nothing forces "spec draft → intent holder confirms → then generation". The framework's whole first membrane rests on one workflow file with prose enforcement. Fix: intake workflow ends with an explicit accept/veto gate whose output (the verdict) is committed with the spec (frontmatter `accepted: <date>` on product specs is enough).
- **G2 — Code–spec binding has no programmatic check.** spec-first-change is prose-enforced. The cheapest real check: CI script that fails when a commit touches `apps/|libs/` but not `spec/` and carries no `DRIFT:` or `spec-exempt:` marker. Moves the rule from prose → CI on the honest ladder.
- **G3 — No verdict record.** Gate results (typecheck/e2e counts) live in commit messages ad hoc. Minimal fix, not ceremony: a one-line `Gates:` trailer convention in commit messages (already done informally tonight) written into the commit rule — the Record then retains verdicts at zero extra cost. Do **not** build a verdict database; determinism makes evidence re-derivable, so heavyweight retention buys little (their model: evidence must *mean* something, not be hoarded).
- **G4 — Entrypoint registry is descriptive, not validated.** architecture.md lists ports/base-paths; nothing fails at boot on conflict. Reference repo validates config at boot (Zod, fail-fast before traffic). Fix when convenient: each app validates its port/base-path against a generated constant from the registry.
- **G5 — `hook` and `check` kinds are near-empty cells.** The matrix's kinds column exposes it: nxus has specs, rules, workflows, tests, MCP — but almost no hooks (session caches aside) and few standalone checks (`bootstrap-parity.test.ts` is the pattern to replicate). Known hole, record it, fill opportunistically.

## 5. What NOT to change

- Do not turn stabilizers into peer categories of rules (companion doc is explicit: derived obligations, not MECE node kinds). `guards:` frontmatter is a link, not a taxonomy migration.
- Do not build an ontology document that restates 1d in prose at length. Layer 0 stays ~40 lines; the HTML essay remains the canonical visual form.
- Do not add a verdict store (G3 minimal form only).
- Keep the honest-enforcement column — it is the repo's version of "the judge exists until the membranes stop lying": each rule's ladder position says how much the validator can be deleted for that rule.

## 6. Summary judgment

The reference repo's harness and nxus's harness converge on the same materializations (specs, rules, workflows, learnings, drift markers). What the typed-loop model adds is not more artifacts — it is the **derivation chain that makes the artifact set auditable for completeness and arbitrariness**. nxus is one frontmatter field (`guards:`) plus one 40-line layer-0 doc away from being fully reasoning-framework-backed; the elicitation membrane (G1) and the binding check (G2) are the two gaps that actually matter.
