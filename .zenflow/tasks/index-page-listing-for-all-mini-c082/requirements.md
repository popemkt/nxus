# PRD: Gateway App & Nx Convention Restructuring

## Problem Statement

`nxus-core` currently acts as both the gateway (entry point listing all mini-apps) and a feature-rich development tool (app registry, command palette, workbench, inbox, settings). This conflation of responsibilities means:

1. **No clean entry point**: There's no lightweight landing page that serves as a portal to all mini-apps.
2. **Tight coupling**: Adding a new mini-app requires modifying nxus-core's routing and imports.
3. **Non-standard structure**: All packages live in `packages/` instead of following Nx's `apps/` + `libs/` convention, which hurts discoverability and tooling support.

## Goals

1. Create a new `nxus-gateway` app as the root entry point (`/`) — a lightweight portal listing all available mini-apps with navigation links.
2. Make `nxus-core` standalone, accessible under `/core`, no longer responsible for being the gateway.
3. Restructure the monorepo to follow Nx conventions: `apps/` for deployable shells, `libs/` for shared libraries.
4. Treat `nxus-workbench` as a mini-app with its own app shell, accessible under its own route from the gateway.

## Non-Goals

- Module Federation / runtime micro-frontend loading (apps are metadata-driven, not federated).
- Changing the internal implementation of existing mini-apps — only their mounting and routing.
- Modifying the 40+ tool manifests or database schema.
- Implementing independent deployment per mini-app (all apps still build from the monorepo).

---

## Architecture Decisions

### Decision 1: Nx Convention Restructuring

**Move from `packages/*` to `apps/` + `libs/` layout.**

Current structure:
```
packages/
  nxus-core/          # App (gateway + tool manager + workbench host)
  nxus-db/            # Library (database layer)
  nxus-ui/            # Library (shared UI components)
  nxus-workbench/     # Library (node workbench components)
  _commands/          # Utility
  repos/              # Placeholder
```

Target structure:
```
apps/
  nxus-gateway/       # NEW: Lightweight portal/launcher (root /)
  nxus-core/          # MOVED: Dev tool manager app (under /core)
  nxus-workbench/     # NEW app shell: Workbench app (under /workbench)
libs/
  nxus-db/            # MOVED: Database layer
  nxus-ui/            # MOVED: Shared UI components
  nxus-workbench/     # MOVED: Workbench component library (the actual logic)
packages/
  _commands/          # KEEP: CLI utilities (not an app or lib)
  repos/              # KEEP: Placeholder repos
```

**Rationale**: Nx convention says apps are thin shells (~20% of code) that wire libraries together, while libs hold the actual logic (~80%). This maps cleanly to our architecture:
- `apps/nxus-workbench` = thin shell that mounts `libs/nxus-workbench`'s `NodeWorkbenchRoute`
- `apps/nxus-core` = thin shell with routes, providers, layout — delegates to libs for logic
- `libs/nxus-workbench` = the actual workbench components, hooks, server functions

**Note on naming**: Having both `apps/nxus-workbench` and `libs/nxus-workbench` follows the Nx pattern where the app is just a thin wrapper around the library. The npm package names will differ (`@nxus/workbench-app` vs `@nxus/workbench`). If this is confusing, the app can be named `apps/workbench-app` or `apps/workbench-shell` instead.

### Decision 2: Gateway App Design

**`nxus-gateway` is a minimal TanStack Start app** that serves as the root entry point.

It will:
- Serve at `/` (the root route)
- Display a clean index page listing all available mini-apps (nxus-core, nxus-workbench, and any future apps)
- Each mini-app card shows: name, description, icon, and a link to navigate to it
- The list of mini-apps is **statically configured** (not database-driven) since these are Nx workspace apps, not the 40+ tool manifests
- Minimal dependencies: `@nxus/ui` for shared components/theming, no database dependency

**What the gateway does NOT do**:
- No command palette, terminal, inbox, or settings
- No database queries
- No tool health checks
- No complex state management

### Decision 3: nxus-core Becomes Standalone

`nxus-core` moves to `apps/nxus-core/` and becomes accessible at `/core`.

Changes:
- All existing routes (`/`, `/apps/:appId`, `/inbox`, `/settings`) get prefixed under `/core`
  - `/core` — app gallery (currently `/`)
  - `/core/apps/:appId` — app detail (currently `/apps/:appId`)
  - `/core/inbox` — inbox (currently `/inbox`)
  - `/core/settings` — settings (currently `/settings`)
- The `/nodes` route is **removed** from nxus-core (workbench gets its own app)
- Remove `@nxus/workbench` dependency from nxus-core
- nxus-core retains: command palette, terminal panel, configure modal, inbox modal, theme support

### Decision 4: Workbench as a Mini-App

`nxus-workbench` library stays in `libs/nxus-workbench/` (the component library with all the logic).

A new thin app shell `apps/nxus-workbench/` is created:
- Serves at `/workbench`
- Mounts `NodeWorkbenchRoute` from `libs/nxus-workbench`
- Has its own `__root.tsx` with minimal providers (QueryClientProvider, theme)
- Dependencies: `@nxus/workbench` (lib), `@nxus/ui`, `@nxus/db`

### Decision 5: How Apps Are Served Together

Since we're NOT using Module Federation, we need a strategy for serving multiple TanStack Start apps under different paths. Options:

**Option A: Reverse proxy (recommended for production)**
A lightweight reverse proxy (e.g., Nitro/H3 server in the gateway, or nginx) routes:
- `/` → nxus-gateway
- `/core/*` → nxus-core
- `/workbench/*` → nxus-workbench

Each app runs as its own process on a different port during development.

**Option B: Single server with base path configuration**
Each TanStack Start app is configured with a `base` path in its Vite config. The gateway app's Nitro server proxies to the other apps. This is simpler but couples deployment.

**Recommendation**: Start with Option A. During development, use a simple script that starts all apps and a proxy. This keeps apps truly independent and aligns with micro-frontend principles.

---

## Functional Requirements

### FR-1: Gateway Index Page

- **FR-1.1**: Display a grid/list of all available mini-apps
- **FR-1.2**: Each mini-app card shows: icon, name, description, status indicator (running/not), and a navigation link
- **FR-1.3**: The list of mini-apps is configured in a static manifest file within the gateway app
- **FR-1.4**: Clicking a mini-app card navigates to that app's base URL (e.g., `/core`, `/workbench`)
- **FR-1.5**: Responsive layout that works on various screen sizes
- **FR-1.6**: Support dark/light theme (using `@nxus/ui` theme system)

### FR-2: nxus-core Standalone at /core

- **FR-2.1**: All existing nxus-core functionality works identically, just under `/core` prefix
- **FR-2.2**: App gallery (tool listing) serves as the index page at `/core`
- **FR-2.3**: App detail pages accessible at `/core/apps/:appId`
- **FR-2.4**: Inbox at `/core/inbox`, Settings at `/core/settings`
- **FR-2.5**: Command palette, terminal, and modals continue to work
- **FR-2.6**: No dependency on `@nxus/workbench` — the `/nodes` route is removed

### FR-3: Workbench App at /workbench

- **FR-3.1**: Node workbench accessible at `/workbench`
- **FR-3.2**: All existing workbench functionality preserved (node browser, graph view, query builder, inspector)
- **FR-3.3**: Theme support consistent with other apps

### FR-4: Monorepo Restructuring

- **FR-4.1**: Apps live in `apps/` directory
- **FR-4.2**: Libraries live in `libs/` directory
- **FR-4.3**: `pnpm-workspace.yaml` updated to include `apps/*` and `libs/*`
- **FR-4.4**: All `tsconfig` path aliases and project references updated
- **FR-4.5**: Nx project configuration updated for new paths
- **FR-4.6**: All imports continue to resolve correctly after restructuring

### FR-5: Development Experience

- **FR-5.1**: A single command to start all apps for local development (e.g., `nx run-many --target=dev`)
- **FR-5.2**: Each app can also be started independently for focused development
- **FR-5.3**: Hot module replacement works correctly for each app
- **FR-5.4**: Shared library changes propagate correctly to consuming apps

---

## Technical Constraints

- **TC-1**: TanStack Start (React Router) for all apps — consistent framework
- **TC-2**: Vite as build tool for all apps
- **TC-3**: pnpm workspace for package management
- **TC-4**: Existing database layer (`@nxus/db`) remains unchanged
- **TC-5**: Existing UI component library (`@nxus/ui`) remains unchanged
- **TC-6**: Server functions (TanStack `createServerFn`) pattern preserved

## Assumptions

- **A-1**: The gateway's mini-app list is static (hardcoded/configured), not database-driven. New mini-apps are added by updating the gateway's config, which is a developer action when adding a new app to the monorepo.
- **A-2**: All apps share the same database instance (SQLite/SurrealDB via `@nxus/db`).
- **A-3**: Theme preferences are shared across apps via localStorage (already the pattern with `nxus-theme` key).
- **A-4**: The `packages/_commands/` and `packages/repos/` directories remain in `packages/` since they don't fit the apps/libs pattern.
- **A-5**: During development, a reverse proxy or multi-process runner coordinates all apps.

## Open Questions

- **OQ-1**: Should the gateway have a "back to home" navigation that's consistent across all mini-apps, or does each app handle its own navigation independently? **Decision: Each app is independent but should include a small "home" link/icon that returns to the gateway.**
- **OQ-2**: Naming for the thin app shells — `apps/nxus-workbench` vs `apps/workbench-shell`? **Decision: Use `apps/nxus-workbench` for simplicity; the package.json name can differentiate (`@nxus/workbench-app`).**

---

## Success Criteria

1. Navigating to `/` shows the gateway with links to all mini-apps
2. Navigating to `/core` shows the existing app gallery with all current functionality
3. Navigating to `/workbench` shows the node workbench with all current functionality
4. The monorepo follows `apps/` + `libs/` Nx convention
5. `nx graph` correctly shows the dependency relationships
6. All existing features work without regression
7. Development workflow is smooth: single command starts everything, HMR works
