# Requirements: Separate Node Application as Nx Packages

## Overview

Extract the node-based workbench and database layer from `nxus-core` into separate Nx packages to establish a foundation for future mini-apps. This enables clean separation of concerns where mini-apps can share database access and node operations while maintaining their own application-specific logic.

## Goals

1. **Create `nxus-db` package** - Core database layer supporting multiple database modes
2. **Create `nxus-workbench` package** - Node browser/inspector UI (the `/nodes` route)
3. **Keep `nxus-core` as the main app** - Contains AppManager (`/` route) and orchestrates mini-apps
4. **Enable future mini-apps** - Can import `nxus-db` for node access, optionally depend on workbench

## Package Architecture

```
packages/
├── nxus-db/                    # NEW: Core database package
│   ├── src/
│   │   ├── client.ts           # Database initialization (master DB)
│   │   ├── schemas/
│   │   │   ├── node-schema.ts  # Nodes + node_properties tables
│   │   │   ├── item-schema.ts  # Legacy items/commands (if clean separation possible)
│   │   │   └── index.ts        # Re-exports all schemas
│   │   ├── services/
│   │   │   ├── node.service.ts # Node CRUD operations
│   │   │   └── index.ts
│   │   ├── graph/              # SurrealDB graph client (projections)
│   │   │   ├── graph-client.ts
│   │   │   └── graph.service.ts
│   │   ├── types/              # Shared DB types
│   │   └── index.ts            # Public API exports
│   └── package.json
│
├── nxus-workbench/             # NEW: Node browser UI package
│   ├── src/
│   │   ├── components/
│   │   │   ├── NodeBrowser.tsx
│   │   │   ├── NodeInspector.tsx
│   │   │   ├── SupertagSidebar.tsx
│   │   │   └── ...
│   │   ├── routes/
│   │   │   └── nodes.tsx       # The /nodes route
│   │   ├── hooks/              # Workbench-specific hooks
│   │   ├── server/             # Server functions for nodes
│   │   │   └── nodes.server.ts
│   │   └── index.ts            # Public API
│   └── package.json
│
├── nxus-core/                  # MODIFIED: Main orchestration app
│   ├── src/
│   │   ├── routes/
│   │   │   ├── index.tsx       # AppManager (stays here)
│   │   │   ├── nodes.tsx       # Re-exports from @nxus/workbench
│   │   │   └── ...
│   │   ├── db/
│   │   │   └── ephemeral-items.ts  # Renamed: App-specific ephemeral DB
│   │   └── ...
│   └── package.json
│
└── [future-mini-app]/          # Example future mini-app
    ├── src/
    │   ├── db/
    │   │   └── ephemeral-[app].ts  # App's own ephemeral DB
    │   └── ...
    └── package.json
```

## Functional Requirements

### FR1: `nxus-db` Package

#### FR1.1: Database Client Management
- Provide a shared database client for the master SQLite database (`~/.popemkt/.nxus/nxus.db`)
- Support WAL mode and proper connection handling
- Expose Drizzle ORM instance for direct queries when needed

#### FR1.2: Node Schema & Operations
- Export node schema (`nodes`, `node_properties` tables)
- Provide `NodeService` with full CRUD operations:
  - `createNode`, `updateNode`, `deleteNode`
  - `getNodeById`, `getNodesBySupertag`, `queryNodes`
  - `assembleNode` (reconstruct full node with properties)
  - Supertag management functions
- Support system fields (extends, supertag, children, etc.)

#### FR1.3: Legacy Item Schema (Conditional)
- If clean API separation is achievable, include legacy item schema
- Export item/command schemas and basic query functions
- If coupling is too tight, exclude and document as deprecated

#### FR1.4: Graph Database Support
- Export SurrealDB graph client
- Provide projection-based queries (not raw graph operations)
- Graph service should work through node abstractions

#### FR1.5: Ephemeral Database Pattern
- Document the pattern for app-specific ephemeral databases
- Optionally provide a factory/helper for creating ephemeral DB instances
- Each mini-app manages its own ephemeral DB independently

### FR2: `nxus-workbench` Package

#### FR2.1: Node Browser UI
- `NodeBrowser` component - main browsing interface
- `NodeInspector` component - detailed node view
- `SupertagSidebar` component - hierarchical filtering
- Supporting UI components (`NodeBadge`, `NodeLink`, `SupertagChip`)

#### FR2.2: Route Export
- Export the `/nodes` route component
- Support integration into parent app's router

#### FR2.3: Server Functions
- Node data loading functions
- Server-side queries for workbench operations

#### FR2.4: Dependencies
- Depends on `@nxus/db` for all database operations
- Uses shared UI components from a common location (shadcn/ui)

### FR3: `nxus-core` Modifications

#### FR3.1: Import from New Packages
- Import `@nxus/db` for database access
- Import `@nxus/workbench` for the nodes route
- Re-export workbench route at `/nodes`

#### FR3.2: Ephemeral Database Rename
- Rename `ephemeral.db` concerns to `ephemeral-items` or similar
- Clearly scope ephemeral data to AppManager functionality

#### FR3.3: AppManager Stays
- The `/` route (AppManager with gallery/table/graph views) remains in nxus-core
- This is the "nxus item management app"

### FR4: Mini-App Support Pattern

#### FR4.1: Database Access Levels
Mini-apps can access the shared database at different levels:

1. **Projection Level** (recommended for most apps)
   - Query nodes through high-level service functions
   - Get projections of nodes as application-specific entities
   - No direct schema knowledge required

2. **Full Node Access** (for power apps)
   - Direct access to node service for complex operations
   - Can create/modify nodes and properties
   - Full supertag and relationship management

#### FR4.2: Ephemeral Data Isolation
- Each mini-app manages its own ephemeral SQLite database
- Located at `~/.popemkt/.nxus/ephemeral-[app-name].db`
- Schema defined within the mini-app package

#### FR4.3: Route Integration
- Mini-apps export their routes
- `nxus-core` imports and mounts at appropriate paths
- All apps merge into one unified application

## Non-Functional Requirements

### NFR1: Build Configuration
- Packages are **buildable** (internal library, not publishable to npm)
- Use Nx library generators with appropriate configuration
- TypeScript path aliases: `@nxus/db`, `@nxus/workbench`

### NFR2: No File-by-File Moves
- Use `nx generate @nx/workspace:move` or bulk operations
- Leverage git mv for history preservation where possible
- Update imports via automated tooling (e.g., `nx affected`)

### NFR3: Testing Strategy
- Add tests **during** the separation process
- Focus on public API tests for each new package
- Integration tests to verify cross-package functionality

### NFR4: Backward Compatibility
- Existing functionality must continue working
- The `/nodes` route behavior unchanged
- Database migrations (if any) must be non-breaking

## Out of Scope

1. **New features** - This is purely a restructuring task
2. **Performance optimization** - Focus on clean separation
3. **UI changes** - Components move as-is
4. **Database schema changes** - Use existing schemas

## Assumptions

1. The SurrealDB graph mode provides projections through the node service abstraction
2. Shared UI components (shadcn/ui) will remain in a common location or be duplicated initially
3. TanStack Router/Query patterns will work across package boundaries
4. Server functions can be exported and used from library packages

## Success Criteria

1. `nxus-db` package builds successfully and exports documented API
2. `nxus-workbench` package builds and renders the node browser
3. `nxus-core` continues to function with both routes (`/` and `/nodes`)
4. A simple example shows how a future mini-app would import `@nxus/db`
5. All existing functionality works as before
6. Clear documentation of the public APIs for each package

## Open Questions (Resolved)

| Question | Resolution |
|----------|------------|
| Single package vs two packages? | **Two packages**: `nxus-db` + `nxus-workbench` |
| Include legacy items? | Yes, if clean separation possible; otherwise exclude |
| Publishable vs buildable? | **Buildable** (internal only) |
| Tests before or after? | **During** the separation process |
| Graph DB in nxus-db? | Yes, with projection-based API |
| Ephemeral DB handling? | Each app manages its own; optionally provide helper pattern |

## Dependencies

- Nx 22.3.3 (current)
- pnpm workspaces
- TypeScript 5.7.2
- Drizzle ORM 0.45.1
- better-sqlite3 12.6.0
- SurrealDB 1.3.2
