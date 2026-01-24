# Nxus Package Architecture

> **Status**: Implemented
> **Last Updated**: 2026-01-24

## Overview

Nxus is organized as a monorepo with four packages that follow a clean dependency hierarchy. This architecture enables code reuse across mini-apps while maintaining clear separation of concerns.

```
                    ┌─────────────────────┐
                    │     nxus-core       │  (Main application)
                    │  - Route definitions│
                    │  - App-specific UI  │
                    │  - Data seeding     │
                    └──────────┬──────────┘
                               │ depends on
            ┌──────────────────┼──────────────────┐
            ▼                  ▼                  ▼
  ┌──────────────────┐ ┌──────────────────┐ ┌─────────────┐
  │  nxus-workbench  │ │     nxus-db      │ │   nxus-ui   │
  │  - Node browser  │ │  - Schemas       │ │ - shadcn/ui │
  │  - Node inspector│ │  - DB clients    │ │ - Utilities │
  │  - Server fns    │ │  - Node service  │ └─────────────┘
  └────────┬─────────┘ │  - Bootstrap     │        ▲
           │           └──────────────────┘        │
           │ depends on        ▲                   │
           └───────────────────┴───────────────────┘
```

**Key principle**: No circular dependencies. Dependencies flow downward only.

## Packages

### @nxus/ui

Shared UI components built on shadcn/ui.

**Purpose**: Provide reusable, styled UI primitives that can be used across all packages.

**Exports**:
- Button, Card, Input, Badge, etc. (shadcn components)
- `cn()` utility for className merging
- Animation components (DecodeText, GlitchText)

**Dependencies**: None (only peer deps: react, tailwindcss)

**Usage**:
```tsx
import { Button, Card, cn } from '@nxus/ui'
```

### @nxus/db

Database layer with schemas, types, and operations.

**Purpose**: Provide a unified database interface for all mini-apps. Handles node-based data storage with SQLite (master data) and SurrealDB (graph relationships).

**Entry Points**:
- `@nxus/db` - Types and schemas only (safe for browser)
- `@nxus/db/server` - Full database access (Node.js only)

**Exports**:
- Schemas: `nodes`, `nodeProperties`, `ephemeralDb`
- Types: `AssembledNode`, `PropertyValue`, `Item`, `Tag`, `ItemCommand`
- Services: `createNode`, `findNode`, `setProperty`, `getNodesBySupertagWithInheritance`
- Bootstrap: `bootstrapSystemNodes`, `initDatabaseWithBootstrap`
- Constants: `SYSTEM_SUPERTAGS`, `SYSTEM_FIELDS`

**Dependencies**:
- `@nxus/ui` (for potential future shared types)
- `better-sqlite3`, `drizzle-orm`, `surrealdb`, `zod`

**Usage**:
```typescript
// Client-side (types only)
import type { AssembledNode, Item } from '@nxus/db'

// Server-side (full access)
import { createNode, findNode, SYSTEM_SUPERTAGS } from '@nxus/db/server'
```

### @nxus/workbench

Node management UI components and server functions.

**Purpose**: Provide a complete workbench for browsing, inspecting, and managing nodes. Can be mounted as a route in any Nxus mini-app.

**Entry Points**:
- `@nxus/workbench` - React components
- `@nxus/workbench/server` - Server functions and adapters

**Exports**:
- Components: `NodeWorkbenchRoute`, `NodeBrowser`, `NodeInspector`, `SupertagSidebar`
- Shared components: `NodeBadge`, `NodeLink`, `SupertagChip`
- Server functions: `getNodeServerFn`, `searchNodesServerFn`, `getAllItemsFromNodesServerFn`
- Legacy adapters: `nodeToItem`, `nodeToTag`, `nodeToCommand`, `nodesToItems`

**Dependencies**:
- `@nxus/db` - Database operations
- `@nxus/ui` - UI components
- `@tanstack/react-query`, `@tanstack/react-start`

**Usage**:
```tsx
// Route component
import { NodeWorkbenchRoute } from '@nxus/workbench'

// Server functions
import { getNodeServerFn, nodeToItem } from '@nxus/workbench/server'
```

### nxus-core

Main application that integrates all packages.

**Purpose**: The primary Nxus application with routes, app-specific features, and data seeding.

**Contains**:
- Route definitions (`/`, `/nodes`, `/settings`, etc.)
- App-specific components (command palette, terminal, etc.)
- Data seeding scripts (`db:seed`, `db:export`)
- App manifests and configuration

**Dependencies**:
- `@nxus/db` - Database layer
- `@nxus/ui` - UI components
- `@nxus/workbench` - Node management UI

## Data Flow

### Bootstrap Flow

On first run or when data is missing:

```
1. App starts
2. First data query triggers auto-bootstrap
   └── initDatabaseWithBootstrap() in @nxus/db
       └── bootstrapSystemNodes() creates core schema
           - System supertags (Item, Command, Tag, Field, Supertag)
           - System fields (path, icon, description, etc.)
3. User runs `pnpm db:seed` (or "DB: Sync JSON" command)
   └── scripts/db-seed.ts loads app manifests
       - Apps, commands, tags from JSON files
```

### Read Path

```
UI Component
    ↓ query
Server Function (@nxus/workbench/server)
    ↓ calls
Node Service (@nxus/db/server)
    ↓ queries
SQLite (nodes, nodeProperties tables)
    ↓ assembles
AssembledNode (with properties, supertags)
    ↓ returns
UI Component
```

### Legacy Adapter Flow

For backward compatibility with Item/Tag/Command types:

```
Nodes (new architecture)
    ↓ nodeToItem(), nodeToTag(), nodeToCommand()
Legacy Types (Item, Tag, ItemCommand)
    ↓ used by
Existing UI Components (app cards, command palette)
```

## Creating a Mini-App

A mini-app can use `@nxus/db` directly for data operations without depending on the full workbench:

```typescript
// mini-app/src/server/data.server.ts
import {
  initDatabaseWithBootstrap,
  getNodesBySupertagWithInheritance,
  SYSTEM_SUPERTAGS,
} from '@nxus/db/server'

export async function getItems() {
  const db = initDatabaseWithBootstrap()
  return getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)
}
```

If the mini-app needs node browsing UI:

```tsx
// mini-app/src/routes/nodes.tsx
import { NodeWorkbenchRoute } from '@nxus/workbench'
import { getAllNodesServerFn, getSupertagsServerFn } from '@nxus/workbench/server'

export function NodesRoute() {
  // Fetch data and render workbench
  return <NodeWorkbenchRoute {...props} />
}
```

## File Structure

```
packages/
├── nxus-ui/
│   ├── src/
│   │   ├── components/      # shadcn/ui components
│   │   ├── lib/utils.ts     # cn() utility
│   │   └── index.ts         # Barrel export
│   ├── package.json
│   └── README.md
│
├── nxus-db/
│   ├── src/
│   │   ├── schemas/         # Drizzle schemas
│   │   ├── services/        # Node operations
│   │   ├── client/          # DB initialization
│   │   ├── types/           # TypeScript types
│   │   ├── index.ts         # Types-only export
│   │   └── server.ts        # Full server export
│   ├── examples/
│   ├── package.json
│   └── README.md
│
├── nxus-workbench/
│   ├── src/
│   │   ├── components/      # Node UI components
│   │   ├── server/          # Server functions
│   │   ├── index.ts         # Component export
│   │   └── route.tsx        # Main workbench route
│   ├── package.json
│   └── README.md
│
└── nxus-core/
    ├── src/
    │   ├── routes/          # App routes
    │   ├── components/      # App-specific components
    │   ├── services/        # App services (re-exports)
    │   └── data/            # JSON data files
    ├── scripts/             # DB seeding scripts
    ├── package.json
    └── README.md
```

## Package.json Dependencies

### @nxus/ui
```json
{
  "dependencies": {
    "class-variance-authority": "...",
    "clsx": "...",
    "framer-motion": "...",
    "tailwind-merge": "..."
  },
  "peerDependencies": {
    "react": ">=18",
    "react-dom": ">=18"
  }
}
```

### @nxus/db
```json
{
  "dependencies": {
    "better-sqlite3": "...",
    "drizzle-orm": "...",
    "surrealdb": "...",
    "uuidv7": "...",
    "zod": "..."
  }
}
```

### @nxus/workbench
```json
{
  "dependencies": {
    "@nxus/db": "workspace:*",
    "@nxus/ui": "workspace:*",
    "@tanstack/react-query": "...",
    "@tanstack/react-start": "..."
  }
}
```

### nxus-core
```json
{
  "dependencies": {
    "@nxus/db": "workspace:*",
    "@nxus/ui": "workspace:*",
    "@nxus/workbench": "workspace:*"
  }
}
```

## Commands

### Development

```bash
# Start development server
pnpm dev

# Build all packages
nx run-many -t build

# Type check all packages
nx run-many -t typecheck

# Run tests
pnpm -r test
```

### Database

```bash
# Bootstrap system nodes + seed app data
pnpm db:seed

# Export SQLite to JSON
pnpm db:export

# Just bootstrap (no app data)
pnpm bootstrap-nodes
```

## Migration Notes

When adding a new mini-app:

1. Create package in `packages/` directory
2. Add `@nxus/db` as dependency for database access
3. Optionally add `@nxus/ui` for UI components
4. Optionally add `@nxus/workbench` for node management UI
5. Use `initDatabaseWithBootstrap()` to ensure system nodes exist
6. Query nodes using the node service functions

The `@nxus/db` package handles all database operations including:
- Creating/updating nodes
- Setting properties
- Querying by supertag (with inheritance)
- Graph relationships (via SurrealDB)
