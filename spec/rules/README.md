# Rules Index

> **TEMPORARY — hand-authored.** This index will become GENERATED from rule-file frontmatter (see [generated-registries.md](generated-registries.md)); once the generator exists this file must never be hand-edited. Until then: adding/changing a rule MUST update this table in the same commit.

Invalidated by: nothing (derivable from `spec/rules/*.md` frontmatter) — which is why it must be generated.

One rule per file. Format: frontmatter (`id`/`scope`/`principle`/`enforcement`/`gate`) + body stating the rule, why it exists, and its drift mode. Enforcement is reported honestly: `lint`/`ci` only where a machine actually gates it today; everything else is `prose`.

| Rule | Scope | Principle | Enforcement | Gate |
|---|---|---|---|---|
| [spec-first-change](spec-first-change.md) | workflow | Single source of truth | prose | — |
| [drift](drift.md) | docs | Traceability | prose | — |
| [placement](placement.md) | docs | Separation of concerns | prose | — |
| [learnings](learnings.md) | docs | Traceability | prose | — |
| [testing](testing.md) | tests | Traceability | ci | `.github/workflows/ci.yml` |
| [dev-entrypoints](dev-entrypoints.md) | workflow | Single source of truth | prose | `package.json` |
| [db-layer-authoritative](db-layer-authoritative.md) | architecture | Separation of concerns | prose | — |
| [no-duplicate-concepts](no-duplicate-concepts.md) | architecture | Minimizing accidental complexity | prose | — |
| [typescript](typescript.md) | domain-typing | Fail-fast | lint | `.oxlintrc.json` |
| [server-functions](server-functions.md) | runtime | Separation of concerns | lint | `.oxlintrc.json` |
| [generated-registries](generated-registries.md) | docs | Single source of truth | prose | `scripts/agent-hub-sync.mjs` |

`.claude/rules/*.md` are the sanctioned session-loaded cache of these rules — thin pointers plus operational minimum, updated in the same commit as the rule they cache (`spec/README.md`).
