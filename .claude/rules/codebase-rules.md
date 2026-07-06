---
trigger: always_on
glob:
description: Codebase conventions for nxus monorepo (apps/ and libs/)
---

# Codebase Rules (session cache — canonical content lives in spec/)

Nx monorepo: `apps/` (runnable TanStack Start apps), `libs/` (shared `@nxus/*` libraries), `packages/` (legacy, do not add to). Full architecture: `spec/tech/architecture.md`.

## Exports
- Named exports only, no default exports
- Components: `export function ComponentName`
- Stores: `export const useXxxStore`

## File Naming
- Stores: `*.store.ts`
- Hooks: `use-*.ts`
- Server functions: `*.server.ts`

## Server Functions
- Name with `ServerFn` suffix; return `{ success: true; data } | { success: false; error: string }`.
- Node-only packages (`@nxus/db/server`, better-sqlite3, googleapis) MUST be dynamically imported *inside* handlers — `.server.ts` suffixes and re-exports do NOT protect the client bundle.
- Full pattern and rationale: `spec/rules/server-functions.md`; substrate why: `learnings/vite-server-only-imports.md`.

## Data Access
- Architecture modes are `node` (default) | `graph` (experimental) — there is no `table` mode.
- `nodeFacade` is the canonical access path; direct sync-SQLite imports are recorded DRIFT.
- Schema, modes, facade, bootstrap: `spec/tech/persistence.md`.

## Styling
- `cn()` for className merging (never string concatenation); CVA for variants.

## Imports
- Use `@/*` path alias for src imports.
