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
- Name with `ServerFn` suffix: `executeCommandServerFn`
- Return `{ success: true; data } | { success: false; error: string }`
- Use this exact format (other patterns don't work):
```typescript
export const xyzServerFn = createServerFn({ method: 'POST' })
  .inputValidator(ZodSchema)
  .handler(async (ctx) => {
    const input = ctx.data  // validated input
  })

// GET without input:
export const xyzServerFn = createServerFn({ method: 'GET' }).handler(async () => {})
```

## Styling
- Use `cn()` for className merging, never string concatenation
- Use CVA for component variants

## Imports
- Use `@/*` path alias for src imports

## Database
- All features must work across architecture modes: `table`, `node`, `graph`
- Abstract data access behind mode-agnostic interfaces - don't leak mode-specific logic into feature code
- Use `isTableArchitecture()`, `isNodeArchitecture()`, `isGraphArchitecture()` from `feature-flags.ts` in data layer only
