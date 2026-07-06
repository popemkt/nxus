# Nxus Spec — Reading Path & Placement Rules

Invalidated by: policy decisions about how this repository documents itself.

Nxus is developed **spec-as-source**: the human-readable specs in this tree are the artifact of record; the codebase is one materialization of them. Code cited as `path:line` is *evidence* for a claim; the claim itself is normative and survives refactors that move the evidence.

## The reimplementability property

The specs under `spec/` MUST together be **reimplementation-complete**: a competent agent, given only `spec/` (product + tech + rules), could discard the codebase and rebuild nxus with the same observable behavior, data model, and invariants. Anything required to rebuild the system that is not written here is a spec bug. Anything written here that the code contradicts is either a spec bug or a recorded `DRIFT:` block — never silent.

## Reading path

Read in this order — each layer narrows the previous:

1. **Product** — what the system is and does, independent of implementation.
   - [product/vision.md](product/vision.md) — what nxus IS, north star, non-goals, the app constellation.
   - [product/data-model.md](product/data-model.md) — nodes/fields/supertags/references/queries: the core contract and its invariants.
   - [product/editor.md](product/editor.md) — outline editor functional behavior (the flagship surface).
   - [product/apps/](product/apps/) — one brief per satellite app (core, gateway, workbench, calendar, recall).
2. **Tech** — how the current materialization implements the product.
   - [tech/architecture.md](tech/architecture.md) — monorepo shape, app registry (the ONLY home of the app/port/path table), boundaries, gateway proxy.
   - [tech/persistence.md](tech/persistence.md) — SQLite schema, architecture modes and facade, bootstrap, migrations.
   - [tech/reactivity.md](tech/reactivity.md) — event bus, live queries, computed fields, automations.
   - [tech/editor-sync.md](tech/editor-sync.md) — editor persistence contract (undo, sync, ordering).
   - [tech/toolchain.md](tech/toolchain.md) — build/test/lint/dev entrypoints, e2e strategy.
3. **Rules** — workflow and coding policy, one rule per file: [rules/](rules/) (index: [rules/README.md](rules/README.md) — generated target, currently a hand-maintained placeholder).
4. **Code** — the materialization. e2e specs under `e2e/` are the behavioral proof layer; when spec and e2e disagree, one of them is wrong and the disagreement MUST become a `DRIFT:` block.

`AGENTS.md` at the repo root is a thin router into this tree (CLAUDE.md symlinks to it). `.claude/rules/*.md` are a sanctioned session-loaded *cache* of `spec/rules/` content — thin, true, and updated in the same commit as the rule they cache.

## Placement rule

Every piece of documentation lives where its *invalidator* says. Ask one question — **"what invalidates this text?"** — and place accordingly:

| What invalidates this text? | It belongs in | Nature |
|---|---|---|
| A **product** decision (what nxus should be/do) | `spec/product/` | Normative |
| An **implementation** decision (how we build it) | `spec/tech/` | Normative |
| A **workflow/policy** decision (how we work) | `spec/rules/` | Normative |
| A **substrate discovery** (tool/infra quirk we learned, e.g. Vite/ESM behavior) | `learnings/` | Substrate knowledge |
| **Nothing** — it is mechanically derivable from code (registries, indexes) | Generated artifact — never hand-written | Generated |
| Nothing yet — exploratory thinking with no paired implementation | `docs/notes/` (dated) | Non-normative |
| Nothing ever — historical record | `docs/archived/` | Frozen |

Corollaries:

- One concept, one home. Files MUST link to the owning file rather than restate its content.
- A fact with two hand-written homes is a drift generator; either generate it or consolidate it.

## Document layers

| Layer | Location | Authority | May contradict code? |
|---|---|---|---|
| Spec | `spec/product/`, `spec/tech/`, `spec/rules/` | Normative — MUST/SHOULD/MAY language | Only via an explicit `DRIFT:` block |
| Substrate learnings | `learnings/` | Advisory — hard-won facts about tools/infra | n/a (describes the substrate, not nxus) |
| Notes | `docs/notes/` | Non-normative, dated, exploratory | Yes — never cite as authority |
| Archive | `docs/archived/` | Frozen history; never updated, never cited as current | Yes — by design |
| Generated | `spec/rules/README.md` (placeholder until generator exists) and future registries | Derived from source; hand-edits are discarded once generated | No — regenerate instead |

## Conventions (all spec files)

- First line after the title: `Invalidated by: <product|implementation|policy> decisions about <X>.`
- Normative keywords MUST / SHOULD / MAY.
- Cite current-code evidence as `path:line`.
- Known spec↔code divergence is recorded as a searchable block:

  ```
  DRIFT: <searchable title>
  - canonical: <what spec says should be true>
  - current: <what code does> (file:line)
  - impact: <risk>
  - closes: <what would close it>
  ```

- Dense over polished. No marketing prose.
