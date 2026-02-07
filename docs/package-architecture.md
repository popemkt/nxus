# Nxus Package Architecture

> **Status**: Implemented
> **Last Updated**: 2026-02-07

## Overview

Nxus is organized as an Nx monorepo with applications in `apps/` and shared libraries in `libs/`. A gateway app serves as the landing page, routing users to individual mini-apps that each run as standalone TanStack Start applications.

```
                                 ┌─────────────────────┐
                                 │    nxus-gateway     │  (Landing page)
                                 │  - Mini-app listing │
                                 │  - No DB dependency │
                                 └──────────┬──────────┘
                                            │ links to
                        ┌───────────────────┼───────────────────┐
                        ▼                                       ▼
              ┌──────────────────┐                   ┌──────────────────┐
              │    nxus-core     │  (App manager)    │ nxus-workbench   │  (App shell)
              │  - App gallery   │                   │  - Mounts lib    │
              │  - Commands      │                   │  - Standalone    │
              │  - Settings      │                   └────────┬─────────┘
              └──────────┬───────┘                            │ depends on
                         │ depends on                         │
           ┌─────────────┤                    ┌───────────────┤
           ▼             ▼                    ▼               ▼
  ┌──────────────┐ ┌──────────────┐  ┌──────────────────┐ ┌─────────────┐
  │   nxus-db    │ │   nxus-ui    │  │  nxus-workbench  │ │  nxus-ui    │
  │  - Schemas   │ │  - shadcn/ui │  │  - Node browser  │ │             │
  │  - DB client │ │  - Utilities │  │  - Node inspector│ │             │
  │  - Bootstrap │ └──────────────┘  │  - Server fns    │ └─────────────┘
  └──────────────┘        ▲          └────────┬─────────┘
         ▲                │                   │ depends on
         │                └───────────────────┘
         └────────────────────────────────────┘
```

**Key principles**:
- No circular dependencies. Dependencies flow downward only.
- Apps are runnable; libs are reusable.
- Each app runs on its own port with a unique base path.

## Applications (`apps/`)

### @nxus/gateway

Gateway landing page — the entry point to the Nxus ecosystem.

**Purpose**: Provide a clean landing page that lists all available mini-apps with navigation links.

**Port**: 3001 | **Base Path**: `/`

**Contains**:
- Mini-app manifest (`src/config/mini-apps.ts`) — static list of registered apps
- Landing page with app cards linking to each mini-app

**Dependencies**: `@nxus/ui` only (no database)

### nxus-core

Main application for app management, commands, and settings.

**Purpose**: The primary Nxus application with app gallery, command palette, and data management.

**Port**: 3000 | **Base Path**: `/core`

**Contains**:
- Route definitions (`/`, `/settings`, etc.)
- App-specific components (command palette, terminal, etc.)
- Data seeding scripts (`db:seed`, `db:export`)
- App manifests and configuration

**Dependencies**: `@nxus/db`, `@nxus/ui`

### @nxus/workbench-app

Standalone workbench application for node browsing and graph exploration.

**Purpose**: A thin TanStack Start shell that mounts the `@nxus/workbench` library as a standalone app.

**Port**: 3002 | **Base Path**: `/workbench`

**Contains**:
- Root layout with theme support
- Index route mounting `NodeWorkbenchRoute` from `@nxus/workbench`

**Dependencies**: `@nxus/workbench`, `@nxus/db`, `@nxus/ui`

## Libraries (`libs/`)

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

**Dependencies**: `@nxus/ui`, `better-sqlite3`, `drizzle-orm`, `surrealdb`, `zod`

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

**Dependencies**: `@nxus/db`, `@nxus/ui`, `@tanstack/react-query`, `@tanstack/react-start`

**Usage**:
```tsx
// Route component
import { NodeWorkbenchRoute } from '@nxus/workbench'

// Server functions
import { getNodeServerFn, nodeToItem } from '@nxus/workbench/server'
```

### @nxus/calendar

Calendar integration library.

**Purpose**: Provide calendar UI and scheduling functionality.

**Dependencies**: `@nxus/db`, `@nxus/ui`

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

### 1. Create the app shell

Create a new TanStack Start app in `apps/`:

```bash
mkdir -p apps/my-mini-app/src/routes
```

Set up `package.json`, `vite.config.ts`, `tsconfig.json`, router, root layout, and styles following the pattern in `apps/nxus-workbench/`.

### 2. Add database access (optional)

```typescript
// my-mini-app/src/server/data.server.ts
import { createServerFn } from '@tanstack/react-start'

export const getItemsServerFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { initDatabaseWithBootstrap, getNodesBySupertagWithInheritance, SYSTEM_SUPERTAGS } =
    await import('@nxus/db/server')
  const db = await initDatabaseWithBootstrap()
  return getNodesBySupertagWithInheritance(db, SYSTEM_SUPERTAGS.ITEM)
})
```

### 3. Add workbench UI (optional)

```tsx
// my-mini-app/src/routes/nodes.tsx
import { NodeWorkbenchRoute } from '@nxus/workbench'

export function NodesRoute() {
  return <NodeWorkbenchRoute {...props} />
}
```

### 4. Register in gateway

Add the new app to `apps/nxus-gateway/src/config/mini-apps.ts`:

```typescript
{
  id: 'my-mini-app',
  name: 'My Mini App',
  description: 'Description of what this app does.',
  icon: 'cube',
  path: '/my-app',
  port: 3003,
}
```

### 5. Configure base path

In your app's `router.tsx`, set the TanStack Router `basePath`:

```typescript
export function createRouter() {
  return createTanStackRouter({
    routeTree,
    basePath: '/my-app',
  })
}
```

### 6. Add dev script

Add a dev script to the root `package.json`:

```json
"dev:my-app": "nx run @nxus/my-mini-app:dev"
```

And include it in the main `dev` script's `--projects` list.

## File Structure

```
apps/
├── nxus-gateway/                # Gateway landing page (port 3001)
│   ├── src/
│   │   ├── config/mini-apps.ts  # Mini-app registry
│   │   ├── routes/              # Landing page routes
│   │   ├── router.tsx
│   │   └── styles.css
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
│
├── nxus-core/                   # Main application (port 3000, /core)
│   ├── src/
│   │   ├── routes/              # App routes
│   │   ├── components/          # App-specific components
│   │   ├── services/            # App services
│   │   ├── hooks/               # React hooks
│   │   ├── lib/                 # Pure utilities
│   │   ├── types/               # TypeScript types
│   │   └── data/                # JSON data files
│   ├── scripts/                 # DB seeding scripts
│   ├── package.json
│   └── ARCHITECTURE.md
│
└── nxus-workbench/              # Workbench app shell (port 3002, /workbench)
    ├── src/
    │   ├── routes/              # Mounts @nxus/workbench
    │   ├── router.tsx
    │   └── styles.css
    ├── package.json
    └── tsconfig.json

libs/
├── nxus-ui/
│   ├── src/
│   │   ├── components/          # shadcn/ui components
│   │   ├── lib/utils.ts         # cn() utility
│   │   └── index.ts             # Barrel export
│   └── package.json
│
├── nxus-db/
│   ├── src/
│   │   ├── schemas/             # Drizzle schemas
│   │   ├── services/            # Node operations
│   │   ├── client/              # DB initialization
│   │   ├── types/               # TypeScript types
│   │   ├── index.ts             # Types-only export
│   │   └── server.ts            # Full server export
│   └── package.json
│
├── nxus-workbench/
│   ├── src/
│   │   ├── components/          # Node UI components
│   │   ├── server/              # Server functions
│   │   ├── index.ts             # Component export
│   │   └── route.tsx            # Main workbench route
│   └── package.json
│
└── nxus-calendar/
    ├── src/                     # Calendar components
    └── package.json

packages/
├── _commands/                   # CLI command definitions
└── repos/                       # Repository configurations
```

## Commands

### Development

```bash
# Start all apps (gateway + core + workbench)
pnpm dev

# Start individual apps
pnpm dev:gateway    # http://localhost:3001/
pnpm dev:core       # http://localhost:3000/core
pnpm dev:workbench  # http://localhost:3002/workbench

# Build all packages
nx run-many -t build

# Type check all packages
nx run-many -t typecheck
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

## Multi-App Routing

Each app runs on its own port and has a unique base path configured in its TanStack Router:

| App | Port | Base Path | URL |
|-----|------|-----------|-----|
| Gateway | 3001 | `/` | `http://localhost:3001/` |
| Core | 3000 | `/core` | `http://localhost:3000/core` |
| Workbench | 3002 | `/workbench` | `http://localhost:3002/workbench` |

In development, each app runs independently. The gateway provides a landing page with links to each app. Each app includes a "home" link that navigates back to the gateway at `/`.
