---
trigger: always_on
glob:
description: Codebase conventions for nxus-core
---

# Codebase Rules

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
When importing server functions from **external packages** (e.g., `@nxus/workbench/server`, `@nxus/db/server`), you MUST use dynamic imports to prevent Node.js-only code from being bundled into the client.

```typescript
// ❌ BAD: Top-level import from external package
import { someServerFn } from '@nxus/workbench/server'
// This bundles better-sqlite3 into client code!

// ✅ GOOD: Create local wrapper with dynamic import
// File: src/services/xyz/xyz.server.ts
import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

export const someServerFn = createServerFn({ method: 'POST' })
  .inputValidator(z.object({ /* ... */ }))
  .handler(async (ctx) => {
    // Dynamic import INSIDE handler - only runs on server
    const { someServerFn: fn } = await import('@nxus/workbench/server')
    return fn({ data: ctx.data })
  })
```

Then import from the local wrapper:
```typescript
// In hooks or components
import { someServerFn } from '@/services/xyz/xyz.server'
```

### When to Use Each Pattern

| Scenario | Pattern |
|----------|---------|
| Server function in same app's `.server.ts` file | Basic pattern (top-level imports OK) |
| Server function from `@nxus/workbench/server` | **Dynamic import wrapper required** |
| Server function from `@nxus/db/server` | **Dynamic import wrapper required** |
| Type-only imports from external packages | Safe (use `import type`) |

### Existing Wrappers
- `src/services/query/query.server.ts` - Wraps query and node mutation functions from `@nxus/workbench/server`

### Why This Matters
Without dynamic imports, Vite follows the import chain at build time:
`@nxus/workbench/server` → `@nxus/db/server` → `better-sqlite3` → **client bundle breaks**

**NOTE**: Simple re-exports from `.server.ts` files DON'T work. Even with:
```typescript
// ❌ This STILL bundles better-sqlite3 into client!
// File: xyz.server.ts
export { someServerFn } from '@nxus/workbench/server'
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
