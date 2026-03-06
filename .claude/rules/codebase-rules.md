---
trigger: always_on
glob:
description: Codebase conventions for nxus monorepo (apps/ and libs/)
---

# Codebase Rules

## Monorepo Structure

This is an Nx monorepo with three top-level directories:
- `apps/` — Runnable TanStack Start applications (nxus-gateway, nxus-core, nxus-workbench)
- `libs/` — Shared libraries (nxus-ui, nxus-db, nxus-workbench, nxus-calendar)
- `packages/` — Legacy CLI commands and repo configs only

## Exports
- Named exports only, no default exports
- Components: `export function ComponentName`
- Stores: `export const useXxxStore`

## File Naming
- Stores: `*.store.ts`
- Hooks: `use-*.ts`
- Server functions: `*.server.ts`

## Server Functions

### Naming & Return Types
- Name with `ServerFn` suffix: `executeCommandServerFn`
- Return `{ success: true; data } | { success: false; error: string }`

### Basic Pattern (same package)
```typescript
// For server functions defined in the SAME app (nxus-core)
export const xyzServerFn = createServerFn({ method: 'POST' })
  .inputValidator(ZodSchema)
  .handler(async (ctx) => {
    const input = ctx.data  // validated input
  })

// GET without input:
export const xyzServerFn = createServerFn({ method: 'GET' }).handler(async () => {})
```

### External Package Pattern (CRITICAL)
When using database functions from `@nxus/db/server`, you MUST use dynamic imports to prevent Node.js-only code (better-sqlite3) from being bundled into the client.

**Architecture:**
- `@nxus/db`: Pure types and schemas (client-safe) — in `libs/nxus-db`
- `@nxus/db/server`: Pure functions requiring Node.js (evaluateQuery, createNode, etc.) — in `libs/nxus-db`
- Apps (`apps/nxus-core`, `apps/nxus-workbench`): TanStack `createServerFn` wrappers with dynamic imports

```typescript
// ❌ BAD: Top-level import from @nxus/db/server
import { evaluateQuery } from '@nxus/db/server'
// This bundles better-sqlite3 into client code!

// ✅ GOOD: Create local server function with dynamic import
// File: src/services/query/query.server.ts
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const evaluateQueryServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ definition: z.any(), limit: z.number().optional() }))
  .handler(async (ctx) => {
    // Dynamic import INSIDE handler - only runs on server
    const { initDatabaseWithBootstrap, evaluateQuery } = await import('@nxus/db/server')
    const db = await initDatabaseWithBootstrap()
    return evaluateQuery(db, ctx.data.definition)
  })
```

Then import from the local wrapper:
```typescript
// In hooks or components
import { evaluateQueryServerFn } from '@/services/query/query.server'
```

### When to Use Each Pattern

| Scenario | Pattern |
|----------|---------|
| Server function in same app's `.server.ts` file | Basic pattern (top-level imports OK within handler) |
| Pure functions from `@nxus/db/server` | **Dynamic import inside handler required** |
| Type-only imports from external packages | Safe (use `import type`) |

### Existing Wrappers
- `src/services/query/query.server.ts` - TanStack server functions wrapping `@nxus/db/server` pure functions

### Why This Matters
Without dynamic imports, Vite follows the import chain at build time:
`@nxus/db/server` → `better-sqlite3` → **client bundle breaks**

**NOTE**: Simple re-exports from `.server.ts` files DON'T work. Even with:
```typescript
// ❌ This STILL bundles better-sqlite3 into client!
// File: xyz.server.ts
export { evaluateQuery } from '@nxus/db/server'
```
Vite follows top-level imports at build time regardless of the `.server.ts` suffix. Dynamic imports inside handlers are the only solution.

## Styling
- Use `cn()` for className merging, never string concatenation
- Use CVA for component variants

## Imports
- Use `@/*` path alias for src imports

## Database
- All features must work across architecture modes: `table`, `node`, `graph`
- Abstract data access behind mode-agnostic interfaces - don't leak mode-specific logic into feature code
- Use `isTableArchitecture()`, `isNodeArchitecture()`, `isGraphArchitecture()` from `feature-flags.ts` in data layer only
