# Architecture

Invalidated by: implementation decisions about monorepo layout, app/port topology, module boundaries, or the server-function transport.

Scope: repo shape, dependency rules, the app registry, the gateway/proxy design, the server-function pattern, and open consolidation decisions. Storage modes and the `nodeFacade` contract live in [persistence.md](./persistence.md); build/test/dev entrypoints live in [toolchain.md](./toolchain.md); per-app product briefs live in [../product/apps/](../product/apps/).

## 1. Monorepo shape

Nx monorepo (Nx 22.x, pnpm workspaces) with three top-level source directories:

| dir         | contains                                                                                                            | status |
| ----------- | ------------------------------------------------------------------------------------------------------------------- | ------ |
| `apps/`     | Runnable TanStack Start applications. Thin where a paired lib exists (workbench, calendar apps are ~5-file shells). | active |
| `libs/`     | Shared libraries: `@nxus/db`, `@nxus/ui`, `@nxus/workbench`, `@nxus/calendar`, `@nxus/mastra`.                      | active |
| `packages/` | **Legacy. Dead. MUST NOT gain new code.**                                                                           | dead   |

`packages/` reality: `packages/_commands/` is a self-described "NOT TYPE-SAFE" Vite-glob command registry (`packages/_commands/index.ts:27-30`) with zero dependents and no `package.json` (not a real workspace member despite `pnpm-workspace.yaml:4`). `packages/repos/*` are 5 phantom gitlinks (mode `160000`, no `.gitmodules`) that break fresh clones. Both are excluded from Nx (`.nxignore:1-2`) and from every app's Vite watch.

DRIFT: packages/ directory still exists

- canonical: `packages/` is deleted (or reduced to repo-config only); `pnpm-workspace.yaml` no longer lists it.
- current: `packages/_commands` dead code + 5 phantom gitlinks under `packages/repos/` remain tracked.
- impact: broken fresh clones (uninitializable gitlinks); misleading surface for agents.
- closes: `git rm` the gitlinks and `_commands`, drop the workspace entry.

## 2. Dependency direction rules

The dependency graph MUST be a DAG in this direction:

```
apps/*  →  libs/*  →  (external deps)
```

1. **Apps depend on libs; libs MUST NOT depend on apps.** No `apps/**` import may appear anywhere under `libs/**`.
2. **Libs MUST NOT depend on other feature libs' internals.** Allowed lib→lib edges: anything → `@nxus/ui`; anything → `@nxus/db` (types) or `@nxus/db/server` (server-only, see §5). `@nxus/workbench`, `@nxus/calendar`, `@nxus/mastra` MUST NOT import each other.
3. **Apps MUST NOT import each other.** Cross-app reach-through is DRIFT (e.g. the editor's seed helper imports core's seed logic by relative path, `apps/nxus-editor/src/services/ensure-seeded.server.ts:27-29`).
4. **Node.js-only code MUST NOT reach client bundles.** Enforced boundary: `@nxus/db/server` (better-sqlite3, drizzle) is server-only; the only sanctioned crossing is the dynamic-import pattern in §5. Lint gate: `no-restricted-imports` override in `.oxlintrc.json:7-35` (currently not applied to test files — see toolchain.md).
5. **Paired lib/shell pattern**: when an app has substantial reusable feature code, the code lives in a lib (`libs/nxus-workbench`, `libs/nxus-calendar`) and the app is a routing/config shell. New feature apps SHOULD follow this. (recall violates it — app-resident feature code; accepted as harmless drift, see [../product/apps/recall.md](../product/apps/recall.md).)

## 3. Module boundary policy

- **One concept, one home.** A capability (node CRUD, theming, search) has exactly one owning module; other modules import it. Duplicated implementations are DRIFT and get a decision record (§6).
- **Data access goes through the mode-agnostic surface.** Feature code MUST NOT know which backend (`node` SQLite vs `graph` SurrealDB) it runs on. The canonical access path is `nodeFacade` (`libs/nxus-db/src/services/facade.ts`); backend selection reads `process.env.ARCHITECTURE_TYPE` (`facade.ts:38-39`). Mode checks (`isNodeArchitecture()`, `isGraphArchitecture()` from `apps/nxus-core/src/config/feature-flags.ts:11`) are allowed in the data layer only. `table` mode is REMOVED — any document claiming three modes is wrong. Full contract + facade-bypass DRIFT: [persistence.md](./persistence.md).
- **Exports**: named exports only, no default exports. Components `export function X`; stores `export const useXxxStore` in `*.store.ts`; hooks `use-*.ts`; server functions `*.server.ts` with `ServerFn` suffix.
- **Imports**: `@/*` alias for intra-app src imports; `@nxus/*` package names across packages. No deep imports into another package's `src/`.
- **Styling**: `cn()` from `@nxus/ui` for className merging; CVA for variants.

## 4. App registry (canonical table)

**This table is the sole authoritative home for app/port/basePath data.** Every other occurrence (README, AGENTS.md, gateway config, `mini-apps.ts`) is a downstream copy and MUST be reconciled to this table. Drift-checking is implemented: `scripts/check-app-registry.mjs` parses this table and fails CI (lint job, `.github/workflows/ci.yml`) when `apps/*/package.json` dev-script ports, `apps/*/vite.config.ts` base paths, or the gateway route map disagree with it. Generation of the table itself remains planned — edits happen here first, the check keeps the copies honest.

| app            | package               | port | basePath     | role                                                                                             |
| -------------- | --------------------- | ---- | ------------ | ------------------------------------------------------------------------------------------------ |
| nxus-core      | `@nxus/core-app`      | 3000 | `/core`      | hub: app/tool registry (~65 manifests), command palette, terminal, inbox + automations, settings |
| nxus-gateway   | `@nxus/gateway`       | 3001 | `/`          | launcher landing page + dev reverse proxy (one-origin entry point)                               |
| nxus-workbench | `@nxus/workbench-app` | 3002 | `/workbench` | shell for `@nxus/workbench`: node browser, inspector, 2D/3D graph, query builder                 |
| nxus-calendar  | `@nxus/calendar-app`  | 3003 | `/calendar`  | shell for `@nxus/calendar`: nodes-as-events calendar, Google 2-way sync                          |
| nxus-recall    | `@nxus/recall-app`    | 3004 | `/recall`    | FSRS spaced repetition + AI question generation via `@nxus/mastra`                               |
| nxus-editor    | `@nxus/editor-app`    | 3005 | `/editor`    | Tana-style outline editor: supertags, fields, inline queries, backlinks                          |

Evidence: ports in `apps/*/package.json` dev scripts (`vite dev --port 300X`); basePaths in gateway route map `apps/nxus-gateway/vite.config.ts:16-22`.

Base-path contract per app: Vite `base: '/<path>/'` + TanStack router `basepath: '/<path>'` + gateway route entry MUST agree (core: `apps/nxus-core/vite.config.ts:10`, `src/router.tsx:33`, gateway `vite.config.ts:17`).

DRIFT: app registry duplicated across code and docs

- canonical: this table; code copies derive from one shared constant (future: generated).
- current: independent lists in `apps/nxus-gateway/src/config/mini-apps.ts:9-50` (5 apps, paths), gateway `vite.config.ts:16-22` (paths→ports), core base path in 3 places, plus stale counts in README/AGENTS-lineage docs (3–4 apps).
- impact: adding an app requires ≥4 coordinated edits with no consistency check; docs already disagree with reality.
- closes: generated registry (decision DR-3, §6) consumed by gateway config + docs, drift-checked in CI.

## 5. Server functions

The server-function pattern (naming, result envelope, and the CRITICAL dynamic-import rule for `@nxus/db/server`) is owned by [../rules/server-functions.md](../rules/server-functions.md). Architecture-level facts that stay here:

- Belt-and-braces bundling guards: apps additionally exclude `better-sqlite3`/`node-pty` via `optimizeDeps.exclude` + `rollupOptions.external` (e.g. `apps/nxus-core/vite.config.ts:42-54`).
- The dynamic-import rule solves _bundling_, not _abstraction_: a handler that dynamically imports the raw sync SQLite API still bypasses `nodeFacade` and breaks under `ARCHITECTURE_TYPE=graph` — facade-bypass DRIFT is owned by [persistence.md](./persistence.md).

## 6. Gateway / one-origin design

**Canonical claim**: all mini-apps are served under one origin. The gateway (port 3001) fronts every app at its basePath; apps cooperate by serving under `base`/`basepath` (§4). Cross-app links are plain path links (`/editor`, `/core/...`).

**Mechanism** (current materialization): a custom Vite plugin `miniAppProxy` (`apps/nxus-gateway/vite.config.ts:15-95`) registers connect middleware via `configureServer` _before_ TanStack Start/Nitro SSR:

- Route map `:16-22` (a copy of the §4 registry).
- HTTP: raw `node:http` request pipe (`:46-67`); 502 JSON when upstream unreachable (`:60-65`).
- WebSocket/HMR: manual `upgrade` handshake replay over `net.connect` (`:71-92`).
- `/__health` liveness endpoint (`:28-35`) — answers before SSR and before upstreams are ready (e2e readiness implications: see toolchain.md).

The gateway has no server functions; it is pure static SSR + proxy.

DRIFT: one-origin claim is dev-only

- canonical: one origin holds in every environment (dev and production build/deploy).
- current: `configureServer` only runs under `vite dev`; a production gateway build serves the landing page but every app link 404s. No `routeRules`/reverse-proxy/deployment story exists in the repo.
- impact: the product's core topology assumption is untestable and false outside `pnpm dev`; any deploy silently breaks all navigation.
- closes: a production decision — nitro `routeRules`, an external reverse proxy (Caddy/nginx) generated from the §4 registry, or merging apps (see DR-1 longer-term).

DRIFT: proxy prefix matching lacks a path-boundary check

- canonical: a route matches only on exact path or `prefix + '/'`.
- current: `url.startsWith(prefix)` for both HTTP (`vite.config.ts:39-41`) and WS (`:73-75`) — `/calendar2` proxies to the calendar app.
- impact: wrong-upstream routing for any path sharing a registered prefix.
- closes: boundary-aware match; unit test per registry entry.

DRIFT: WS upgrade replay stringifies array headers

- canonical: upgrade replay preserves header semantics and validates the upstream 101.
- current: `Object.entries(req.headers).map(([k, v]) => \`${k}: ${v}\`)` (`vite.config.ts:80-85`) comma-joins array-valued headers; upstream response is piped unvalidated.
- impact: malformed replayed handshakes in edge cases (multi-value headers).
- closes: per-value header lines + 101 check, or replace the hand-rolled proxy with `http-proxy`-class middleware.

## 7. Consolidation decision records

### DR-1: Converge on a single node-API surface

**Status: implemented for node CRUD/search/query; remaining facade bypass outside this DR is recorded in persistence.md.**
Node CRUD/search/query server functions have one canonical hand-written home: `@nxus/node-api` (`libs/nxus-node-api`). Its generic CRUD server wrappers delegate into `operations.ts` (`libs/nxus-node-api/src/server/nodes.server.ts:13-20`, `:52-63`, `:72-94`, `:101-113`), its search/list/backlink wrappers delegate into the same facade-backed operations (`libs/nxus-node-api/src/server/search-nodes.server.ts:13-20`, `:44-49`, `:68-79`, `:85-90`), and its saved-query wrappers use `nodeFacade` behind dynamic imports (`libs/nxus-node-api/src/server/query.server.ts:36-57`, `:62-92`, `:97-157`).

The concrete access path is `nodeFacade`: `operations.ts` initializes and returns the facade (`libs/nxus-node-api/src/server/operations.ts:171-175`), then implements create/update/delete/search/list/backlinks/children through facade methods and facade query evaluation (`:193-240`, `:263-329`, `:362-382`). Editor-specific response adapters for default-child-supertag creation, inline query results, and grouped backlinks also live in the same package and use `nodeFacade` (`libs/nxus-node-api/src/server/operations.ts:384-507`, `:510-521`, `:524-629`).

The former workbench stack is now a compatibility layer that re-exports `@nxus/node-api/server` for CRUD/search/query (`libs/nxus-workbench/src/server/index.ts:7-25`, `:43-53`; shims at `libs/nxus-workbench/src/server/nodes.server.ts:1-8`, `query.server.ts:1-10`, `search-nodes.server.ts:1-8`). Editor server functions keep their exported names and response shapes but dynamically import `@nxus/node-api/server` inside handlers (`apps/nxus-editor/src/services/outline.server.ts:305-357`, `:424-455`; `apps/nxus-editor/src/services/search.server.ts:9-35`). Core's legacy graph search server function delegates to the same search operation (`apps/nxus-core/src/services/graph/graph.server.ts:567-589`). The editor still imports workbench's `QueryBuilder` (`apps/nxus-editor/src/components/outline/query-results.tsx:5`), so the app→lib dependency direction remains valid.

Longer-term option (not yet decided): merge the editor and workbench apps (the workbench app is a 5-file shell). The workbench graph-visualization endpoints remain local to `@nxus/workbench`; they are graph-rendering APIs, not the node CRUD/search/query surface covered by DR-1.

### DR-2: Theme system lives in `@nxus/ui`

**Status: implemented.**
The theme system is a shared UI capability and MUST have one hand-written implementation in `@nxus/ui`: the persisted `useTheme` store, `ThemeProvider`, palette constants, stored-theme applier, head bootstrap-script helper, and scrollbar manager. Apps MUST import these named exports instead of defining local palette unions, localStorage appliers, inline bootstrap bodies, or scroll handlers in `src/routes/__root.tsx`.

Contract:

- Persistence key remains `nxus-theme`; persisted state fields remain `state.colorMode` and `state.palette`.
- Default fallback remains `colorMode: 'dark'` and `palette: 'default'`.
- Theme application stamps `<html>` with the `dark` class when dark mode is active and with the palette class when the palette is not `default`; it does not stamp `data-theme`.
- The head bootstrap script applies the stored theme before first paint, or applies `dark` when there is no stored state and `prefers-color-scheme: dark` matches.
- Scrollbar visibility uses capture-phase `scroll`, sets `data-scrolling="true"` on the scrolled element, and removes it after 1s of inactivity; apps with legacy non-HTMLElement target fallback MUST pass that fallback as a `ThemeProvider` prop instead of forking the handler.

Evidence: shared implementation in `libs/nxus-ui/src/theme/theme.tsx:53`, `libs/nxus-ui/src/theme/theme.tsx:85`, `libs/nxus-ui/src/theme/theme.tsx:119`, `libs/nxus-ui/src/theme/theme.tsx:142`, and `libs/nxus-ui/src/theme/theme.tsx:166`; app consumption in `apps/nxus-gateway/src/routes/__root.tsx:3`, `apps/nxus-workbench/src/routes/__root.tsx:3`, `apps/nxus-calendar/src/routes/__root.tsx:3`, `apps/nxus-recall/src/routes/__root.tsx:3`, `apps/nxus-editor/src/routes/__root.tsx:3`, and `apps/nxus-core/src/routes/__root.tsx:5`.

### DR-3: App registry becomes generated

**Status: accepted, planned (blocked on tooling, see §4).**
The app/port/basePath list is hand-duplicated in ≥4 code locations and ≥3 docs (§4 DRIFT).
**Decision**: one machine-readable registry source; `mini-apps.ts`, the gateway route map, and the §4 table are generated or drift-checked from it in CI (the `agent-hub-sync` script, `scripts/agent-hub-sync.mjs`, already demonstrates the sync+check mechanism). Until implemented, §4 in this file is the single hand-maintained source.

### Related (owned elsewhere)

- Facade-vs-sync-API split and the graph-mode keep/delete decision: [persistence.md](./persistence.md).
- Dead-code sweep (workbench `reactive.server.ts`, gateway visuals, core `_examples/`, `getTagsServerFn` name collision at `apps/nxus-core/src/services/apps/apps.server.ts:77` vs `src/services/tag.server.ts:158`, `packages/_commands`): not a spec concern beyond §1/§3; tracked as cleanup work.
