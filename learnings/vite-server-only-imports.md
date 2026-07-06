# Vite bundles server-only imports into the client — `.server.ts` is not a boundary

- **Date**: recorded 2026-07-06 (discovered during early `@nxus/db` integration, pre-2026-02)
- **Substrate**: Vite + TanStack Start (`createServerFn`)
- **Symptom**: importing anything from `@nxus/db/server` (which pulls in `better-sqlite3`) at the top of a file that any client code transitively imports breaks the client bundle — Node.js-only modules end up in browser code.

## The discovery

Vite resolves the module graph at build time by following **top-level imports**, with no knowledge of runtime semantics:

1. A top-level `import { evaluateQuery } from '@nxus/db/server'` drags `better-sqlite3` into every bundle that reaches the importing file — even if the symbol is only used inside a `createServerFn` handler.
2. **The `.server.ts` filename suffix does nothing.** It is a human convention, not a Vite boundary.
3. **Re-exports don't help either.** `export { evaluateQuery } from '@nxus/db/server'` inside a `.server.ts` file still bundles better-sqlite3 into the client — Vite follows the re-export chain identically.
4. The only reliable boundary is a **dynamic `import()` inside the server-fn handler**, which Vite code-splits and which only executes on the server:

```typescript
export const evaluateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(Schema)
  .handler(async (ctx) => {
    const { initDatabaseWithBootstrap, evaluateQuery } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()
    return evaluateQuery(db, ctx.data.definition)
  })
```

Type-only imports (`import type`) from server packages are safe — they are erased before bundling.

The same mechanism bites any module with Node-only side effects at load time (`googleapis`, `node-pty`, `node:fs`): the import chain, not the call site, decides what lands in the client bundle.

## Takeaway

Never top-level-import `@nxus/db/server` (or any Node-only package) from code a client bundle can reach; the only safe pattern is `await import(...)` inside the `createServerFn` handler, plus `import type` for types. (Normative pattern: `spec/rules/server-functions.md`.)
