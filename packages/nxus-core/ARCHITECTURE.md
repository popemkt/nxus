# Architecture

This document describes the architectural patterns and conventions used in the nxus-core package.

## Directory Structure

```
src/
├── lib/                  # Pure utilities (framework-agnostic, easily testable)
├── hooks/                # React state + lib composition
├── services/             # Zustand stores, server functions
├── components/           # React UI components
├── routes/               # TanStack Router route components
├── types/                # TypeScript type definitions
└── data/                 # Static data (app registry, etc.)
```

## Key Principles

### 1. Pure Functions in `lib/`

The `lib/` directory contains pure utility functions with **zero React dependencies**. These functions:

- Are easily unit-testable
- Have no side effects
- Can be reused across different contexts (hooks, server functions, tests)

**Example:** `lib/path-resolver.ts` contains `getOsDefaultWorkspacePath()` which takes OS info and returns a path string.

### 2. Hooks Compose Pure Functions

The `hooks/` directory contains React hooks that:

- Compose pure functions from `lib/` with React state
- Handle React-specific concerns (effects, state updates)
- Provide a clean API for components

**Example:** `hooks/use-install-path.ts` uses `getOsDefaultWorkspacePath()` from `lib/` and combines it with `useOsInfo()` and `useAppCheck()` state.

### 3. Services for External Concerns

The `services/` directory contains:

- **Zustand stores** (`app-state.ts`) for client-side state management
- **Server functions** (`*.server.ts`) for server-side operations

### 4. When to Add Complexity

Start with the simplest structure. Only add additional layers (e.g., `domain/`, `application/`) when:

- You have genuinely complex business logic that needs orchestration
- You're sharing logic across multiple platforms (React Native, CLI, etc.)
- Unit testing becomes difficult due to tight coupling

**Recommended approach:** Colocation over separation until you feel real pain.

## Real-World Examples

### Example 1: Path Resolution

**Problem:** OS-specific default paths were duplicated in `apps.$appId.tsx` and `app-actions-dialog.tsx`.

**Solution:**

- Created `lib/path-resolver.ts` with pure `getOsDefaultWorkspacePath(osInfo)` function
- Created `hooks/use-install-path.ts` to compose the pure function with React state
- Components now use the shared hook

**Benefits:** Single source of truth, easier to test, consistent behavior.

### Example 2: App Constants

**Problem:** App type icons, labels, and status variants were duplicated in `app-card.tsx` and `apps.$appId.tsx`.

**Solution:**

- Created `lib/app-constants.ts` with:
  - `APP_TYPE_ICONS` - Icon mapping for each app type
  - `APP_TYPE_LABELS_SHORT` / `APP_TYPE_LABELS_LONG` - Short and long labels
  - `STATUS_VARIANTS` - Badge variant mapping
- Created `lib/app-actions.ts` with `openApp(app)` utility
- Components import from centralized location

**Benefits:** Consistency across UI, easier to add new app types, type-safe constants.

## Query System

The query system provides Tana-like reactive queries over nodes. It enables filtering, sorting, and searching across the node-based architecture.

### Overview

```
@nxus/db (types & evaluation)
├── types/query.ts              # Query schema definitions
└── services/query-evaluator.ts # Backend query evaluation engine

@nxus/workbench (server API)
└── server/query.server.ts      # Server functions for query CRUD

@nxus/core (UI & hooks)
├── hooks/use-query.ts          # React hooks for query operations
├── stores/query.store.ts       # Zustand store for query builder state
└── components/features/query-builder/
    ├── query-builder.tsx       # Main query builder component
    ├── filter-chip.tsx         # Individual filter display
    ├── saved-queries-panel.tsx # Saved queries management
    └── filters/                # Filter type editors
```

### Query Definition Schema

A query consists of:
- **filters**: Array of filter conditions (AND by default)
- **sort**: Optional sort configuration (field + direction)
- **limit**: Optional result limit (default: 500)

### Filter Types

| Type | Description | Example Use |
|------|-------------|-------------|
| `supertag` | Match nodes by supertag (with optional inheritance) | `#Item`, `#Tool+` |
| `property` | Match by field value with operators | `status = installed` |
| `content` | Full-text search on node content | `contains "Claude"` |
| `temporal` | Date-based filtering | `created within 7 days` |
| `relation` | Relationship-based queries | `childOf`, `linksTo` |
| `hasField` | Check field existence | `has title`, `missing status` |
| `and/or/not` | Logical grouping | Complex boolean queries |

### Hooks

```tsx
// Evaluate an ad-hoc query with debouncing
const { nodes, totalCount, isLoading, isError } = useQueryEvaluation(definition, {
  debounceMs: 300, // Prevent excessive evaluations
})

// Manage saved queries
const { queries } = useSavedQueries()
const { createQuery } = useCreateQuery()
const { updateQuery } = useUpdateQuery()
const { deleteQuery } = useDeleteQuery()

// Execute a saved query
const { nodes } = useSavedQuery(queryId)
```

### Reactivity

Query results automatically update when:
1. Nodes are created, updated, or deleted
2. Node properties change
3. Query definition changes (with debounce)

This is achieved through TanStack Query cache invalidation - all node mutation hooks invalidate query caches automatically.

### Integration

The query builder integrates with the gallery via a floating panel:
1. Click "Advanced Filter" button in the HUD
2. Build query using filter chips
3. Results preview shows matching nodes
4. Save queries for reuse

Future mini-apps can use `useQueryEvaluation` directly without the visual builder.

## Server Function Import Patterns

When using TanStack Start server functions, there are important patterns to follow to avoid bundling Node.js-only code into the client.

### The Problem

Server functions created with `createServerFn` should only run on the server. However, if you import a server function from an **external package** at the top of a file, Vite's bundler will follow the import chain and may pull in Node.js-only dependencies (like `better-sqlite3`) into the client bundle.

```tsx
// ❌ BAD: Top-level import from external package
import { someServerFn } from '@nxus/workbench/server'

// This causes Vite to follow the import chain:
// @nxus/workbench/server → @nxus/db/server → better-sqlite3 ❌
```

### The Solution: Local Wrappers with Dynamic Imports

For server functions from **external packages**, create local wrapper functions that use **dynamic imports** inside the handler:

```tsx
// ✅ GOOD: Local wrapper with dynamic import
// packages/nxus-core/src/services/query/query.server.ts

import { createServerFn } from '@tanstack/react-start'

export const evaluateQueryServerFn = createServerFn({ method: 'POST' })
  .handler(async (ctx) => {
    // Dynamic import inside handler - only runs on server
    const { evaluateQueryServerFn: fn } = await import('@nxus/workbench/server')
    return fn({ data: ctx.data })
  })
```

Then import from the local wrapper:

```tsx
// In hooks or components
import { evaluateQueryServerFn } from '@/services/query/query.server'
```

### When This Pattern is Required

| Scenario | Pattern Required |
|----------|-----------------|
| Server function in same app's `.server.ts` file | No - top-level imports OK |
| Server function from external package | **Yes - use dynamic imports** |
| Types from external package | No - type-only imports are safe |

### Files Using This Pattern

- `packages/nxus-core/src/services/query/query.server.ts` - Wraps all query-related server functions from `@nxus/workbench/server`

### Vite Configuration

The following packages are configured in `vite.config.ts` to help with SSR:

```ts
optimizeDeps: {
  exclude: ['better-sqlite3', 'drizzle-orm/better-sqlite3', '@nxus/db', '@nxus/workbench'],
},
ssr: {
  noExternal: ['@nxus/db', '@nxus/workbench'],
}
```

This ensures these packages are treated as server-only and not pre-bundled for the client.
