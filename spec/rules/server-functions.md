---
id: server-functions
scope: runtime
principle: Separation of concerns
enforcement: lint
gate: .oxlintrc.json
guards: runtime-world
---

# Server functions rule

Invalidated by: implementation decisions about the app↔server boundary. Canonical home of the server-function content cached in `.claude/rules/codebase-rules.md` (cache updated in the same commit as this file).

All app↔database traffic goes through TanStack `createServerFn` wrappers. Three obligations:

## 1. Naming and shape

- Suffix `ServerFn`: `executeCommandServerFn`. Files: `*.server.ts`.
- Input validated with a Zod schema via `.inputValidator(...)` ([typescript.md](typescript.md) pattern 2); `POST` for mutations, `GET` for reads.
- Return the result envelope: `{ success: true; data } | { success: false; error: string }`.

## 2. Dynamic-import pattern for `@nxus/db/server` (CRITICAL)

`@nxus/db` (types/schemas) is client-safe; `@nxus/db/server` (Node-only: better-sqlite3, service functions) is not. Vite follows **top-level** imports at build time regardless of `.server.ts` suffix — even a bare re-export bundles better-sqlite3 into the client and breaks the build (substrate fact; see [learnings.md](learnings.md)). Therefore:

```typescript
export const evaluateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ definition: QueryDefinitionSchema, limit: z.number().optional() }))
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, evaluateQuery } = await import('@nxus/db/server') // inside handler ONLY
    const db = await initDatabaseWithBootstrap()
    return evaluateQuery(db, ctx.data.definition)
  })
```

- Top-level `import ... from '@nxus/db/server'` (or `@nxus/workbench/server`) is forbidden outside handler bodies. `import type` is safe.
- Components/hooks import only the local `.server.ts` wrapper, never `@nxus/db/server` directly.
- Handlers delegate domain logic downward per [db-layer-authoritative.md](db-layer-authoritative.md); the wrapper owns validation + envelope only.

## 3. Enforcement (honest)

The import ban is **lint-enforced** via `no-restricted-imports` (`.oxlintrc.json:7-34`) — but only for `apps/**/src/{routes,components,lib}/**`. Server-fn files themselves, `libs/**`, e2e, and all tests (`.oxlintrc.json:36-42`) are outside the fence. Naming and envelope are prose + review.

DRIFT: envelope and fence coverage incomplete
- canonical: every server fn returns the result envelope; the import fence covers all client-reachable code.
- current: many editor server fns implement only the success arm — unexpected errors propagate as thrown exceptions instead of `{ success: false; error }` (e.g. `getWorkspaceRootServerFn`, `apps/nxus-editor/src/services/outline.server.ts:263-291`, has no failure path); fence limited to three app subtrees; tests unlinted.
- impact: callers can't handle errors uniformly; a mis-placed import in `apps/**/src/hooks/` or `libs/**` client code bundles better-sqlite3 undetected.
- closes: normalize envelopes; extend the override globs (hooks, services, libs client code) and lint tests.

**Drift mode:** this rule drifts via new server fns skipping the envelope or new client subtrees escaping the fence. Detection: lint for the fence (where covered); review for naming/envelope; violations get fixed or `DRIFT:`-recorded.
