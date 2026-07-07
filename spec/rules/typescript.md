---
id: typescript
scope: domain-typing
principle: Fail-fast
enforcement: lint
gate: .oxlintrc.json
guards: observation (compiler as pre-paid evidence)
---

# TypeScript rule

Invalidated by: policy decisions about typing discipline. Canonical home of the content cached in `.claude/rules/typescript-rules.md` (the cache MUST be updated in the same commit as this file).

**Core principle: make invalid states unrepresentable.** Catch logic errors at compile time, not runtime.

## Patterns (apply where appropriate)

1. **Discriminated unions** for polymorphic variants (commands, events, states, query filters): `z.discriminatedUnion('mode', [ExecuteSchema, TerminalSchema])`. The query filter union in `libs/nxus-db/src/types/query.ts` is the house exemplar.
2. **Zod schema-first at validation boundaries** (server functions, API inputs, file parsing); derive types with `z.infer<typeof Schema>`.
3. **Result types** where callers need explicit error paths: `{ success: true; data: T } | { success: false; error: E }` (mandatory shape for server fns — [server-functions.md](server-functions.md)).
4. **Type guards** (`x is SomeType`) to narrow discriminated unions.
5. **Branded constants** via `as const satisfies` for type-safe constant maps; branded string types where two string domains must not mix (exemplar: `FieldSystemId` vs `FieldContentName`, `libs/nxus-db/src/schemas/node-schema.ts:82-97`).
6. **Literal unions** (`'a' | 'b' | 'c'`) over `string` when values are known.
7. **Validate at the parse layer** — ensure shape once at the data boundary, never re-validate downstream.
8. **Required = no default**: params without a `defaultValue` are implicitly required.

## Forbidden

- `any` — use `unknown` and narrow.
- Non-null assertions (`!`) without proof in adjacent code.
- Unsafe `as Type` assertions — validate instead.
- `object` or `{}` types — too broad.

## Enforcement (honest)

Only two fragments are machine-enforced: `typescript/no-explicit-any` (warn) and `typescript/no-unnecessary-type-assertion` (error) via oxlint (`.oxlintrc.json:3-6`). `pnpm typecheck` exists but everything else above is prose + review.

DRIFT: typecheck not gating, tests unlinted, rule violated in-repo
- canonical: `pnpm typecheck` gates CI; the forbidden list holds repo-wide.
- current: CI typecheck commented out (`.github/workflows/ci.yml:29-42`); tests excluded from oxlint (`.oxlintrc.json:36-42`); known violations include unsafe `as` and empty-object types in the editor (`apps/nxus-editor/src/hooks/use-outline-sync.ts:116-117`, `services/outline.server.ts:58`).
- impact: the rule reads stronger than reality; agents inherit violations as local precedent.
- closes: fix `libs/nxus-db/src/reactive/__tests__/automation.test.ts`, enable the CI job, lint tests, burn down cited violations.

**Drift mode:** this rule drifts through unenforced clauses accumulating violations. Detection: `pnpm typecheck` + `pnpm lint` locally, review for the forbidden list; new violations require a `DRIFT:` block or a fix, never silence.
