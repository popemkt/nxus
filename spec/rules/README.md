# Rules Index

> **TEMPORARY — hand-authored.** This index will become GENERATED from rule-file frontmatter (see [generated-registries.md](generated-registries.md)); once the generator exists this file must never be hand-edited. Until then: adding/changing a rule MUST update this table in the same commit.

Invalidated by: nothing (derivable from `spec/rules/*.md` frontmatter) — which is why it must be generated.

One rule per file. Format: frontmatter (`id`/`scope`/`principle`/`enforcement`/`gate`/`guards`) + body stating the rule, why it exists, and its drift mode. Enforcement is reported honestly: `lint`/`ci` only where a machine actually gates it today; everything else is `prose`. `principle` links a rule to the six derived principles (layer 1); `guards` links it to the typed model in the layer-0 [harness model](harness-model.md) — the node, process, or invariant (`I1`–`I6`) the rule keeps true. A rule that can fill neither field gets deleted.

| Rule | Scope | Principle | Guards (typed model) | Enforcement | Gate |
|---|---|---|---|---|---|
| [harness-model](harness-model.md) | meta | — (layer 0) | — | prose | — |
| [spec-first-change](spec-first-change.md) | workflow | Single source of truth | I4 (generation consumes specification) | prose | — |
| [drift](drift.md) | docs | Traceability | I6 (verdict updates record, not spec) | prose | — |
| [placement](placement.md) | docs | Separation of concerns | record | prose | — |
| [learnings](learnings.md) | docs | Traceability | record | prose | — |
| [testing](testing.md) | tests | Traceability | observation, I5 | ci | `.github/workflows/ci.yml` |
| [dev-entrypoints](dev-entrypoints.md) | workflow | Single source of truth | runtime-world | prose | `package.json` |
| [db-layer-authoritative](db-layer-authoritative.md) | architecture | Separation of concerns | runtime-world | prose | — |
| [no-duplicate-concepts](no-duplicate-concepts.md) | architecture | Minimizing accidental complexity | validation (affordability) | prose | — |
| [typescript](typescript.md) | domain-typing | Fail-fast | observation (compiler as pre-paid evidence) | lint | `.oxlintrc.json` |
| [server-functions](server-functions.md) | runtime | Separation of concerns | runtime-world | lint | `.oxlintrc.json` |
| [generated-registries](generated-registries.md) | docs | Single source of truth | record | prose | `scripts/agent-hub-sync.mjs` |

Known holes the Guards column exposes (recorded, not hidden): no rule guards **elicitation** or the **verdict**-production side of validation (elicitation is covered only by the `feature-intake` archon workflow — see the harness review note, G1).

`.claude/rules/*.md` are the sanctioned session-loaded cache of these rules — thin pointers plus operational minimum, updated in the same commit as the rule they cache (`spec/README.md`).
