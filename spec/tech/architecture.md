# Architecture

Invalidated by: implementation decisions about monorepo layout, app/port topology, module boundaries, or the server-function transport.

Scope: repo shape, dependency rules, the app registry, the gateway/proxy design, the server-function pattern, and open consolidation decisions. Storage modes and the `nodeFacade` contract live in [persistence.md](./persistence.md); build/test/dev entrypoints live in [toolchain.md](./toolchain.md); per-app product briefs live in [../product/apps/](../product/apps/).

## 1. Monorepo shape

Nx monorepo (Nx 22.x, pnpm workspaces) with three top-level source directories:

| dir | contains | status |
|---|---|---|
| `apps/` | Runnable TanStack Start applications. Thin where a paired lib exists (workbench, calendar apps are ~5-file shells). | active |
| `libs/` | Shared libraries: `@nxus/db`, `@nxus/ui`, `@nxus/workbench`, `@nxus/calendar`, `@nxus/mastra`. | active |
| `packages/` | **Legacy. Dead. MUST NOT gain new code.** | dead |

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

**This table is the sole authoritative home for app/port/basePath data.** Every other occurrence (README, AGENTS.md, gateway config, `mini-apps.ts`) is a downstream copy and MUST be reconciled to this table. Generation of this table (and drift-checking the copies in CI) from `apps/*/package.json` + gateway config is **planned, not implemented** — until then, edits happen here first.

| app | package | port | basePath | role |
|---|---|---|---|---|
| nxus-core | `@nxus/core-app` | 3000 | `/core` | hub: app/tool registry (~65 manifests), command palette, terminal, inbox + automations, settings |
| nxus-gateway | `@nxus/gateway` | 3001 | `/` | launcher landing page + dev reverse proxy (one-origin entry point) |
| nxus-workbench | `@nxus/workbench-app` | 3002 | `/workbench` | shell for `@nxus/workbench`: node browser, inspector, 2D/3D graph, query builder |
| nxus-calendar | `@nxus/calendar-app` | 3003 | `/calendar` | shell for `@nxus/calendar`: nodes-as-events calendar, Google 2-way sync |
| nxus-recall | `@nxus/recall-app` | 3004 | `/recall` | FSRS spaced repetition + AI question generation via `@nxus/mastra` |
| nxus-editor | `@nxus/editor-app` | 3005 | `/editor` | Tana-style outline editor: supertags, fields, inline queries, backlinks |

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
- The dynamic-import rule solves *bundling*, not *abstraction*: a handler that dynamically imports the raw sync SQLite API still bypasses `nodeFacade` and breaks under `ARCHITECTURE_TYPE=graph` — facade-bypass DRIFT is owned by [persistence.md](./persistence.md).

## 6. Gateway / one-origin design

**Canonical claim**: all mini-apps are served under one origin. The gateway (port 3001) fronts every app at its basePath; apps cooperate by serving under `base`/`basepath` (§4). Cross-app links are plain path links (`/editor`, `/core/...`).

**Mechanism** (current materialization): a custom Vite plugin `miniAppProxy` (`apps/nxus-gateway/vite.config.ts:15-95`) registers connect middleware via `configureServer` *before* TanStack Start/Nitro SSR:
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
**Status: accepted, not started.**
Node CRUD/search/query server functions exist in **three** parallel, drifting stacks: editor (`apps/nxus-editor/src/services/outline.server.ts` — create `:298`, update `:431`, delete `:443`, query `:503`, backlinks `:529`; search `apps/nxus-editor/src/services/search.server.ts:9`), workbench (`libs/nxus-workbench/src/server/{nodes,query,search-nodes}.server.ts`), and a third search in `apps/nxus-core/src/services/graph/graph.server.ts:568`. Spec-as-source cannot hold while one contract has three implementations.
**Decision**: extract a canonical node-API surface — either a new `@nxus/node-api` lib or bless `libs/nxus-workbench/src/server/` and move it out of the workbench lib — and delete the other stacks. The editor already imports workbench's `QueryBuilder` (`apps/nxus-editor/src/components/outline/query-results.tsx:5`), proving the dependency direction works. Longer-term option (not yet decided): merge the editor and workbench apps (the workbench app is a 5-file shell).
The consolidated surface MUST go through `nodeFacade` (see persistence.md), which simultaneously retires the editor's facade bypass.

### DR-2: Theme system moves to `@nxus/ui`
**Status: accepted, not started.**
An identical 19-palette `ThemePalette` union + localStorage (`nxus-theme`) applier + inline bootstrap script is copy-pasted into **all six** apps' `__root.tsx` (~1,000 lines total; e.g. `apps/nxus-recall/src/routes/__root.tsx:7-49`, gateway `__root.tsx:51-68`, core `__root.tsx:25-42`), and must additionally mirror core's `src/config/theme-options.ts`. Any palette change is a 7-file edit.
**Decision**: single `ThemeProvider` + palette constant + head-script helper exported from `@nxus/ui`; apps consume it; per-app copies deleted. `@nxus/ui` is already a universal dependency, so this adds no new edges (§2 rule 2 respected).

### DR-3: App registry becomes generated
**Status: accepted, planned (blocked on tooling, see §4).**
The app/port/basePath list is hand-duplicated in ≥4 code locations and ≥3 docs (§4 DRIFT).
**Decision**: one machine-readable registry source; `mini-apps.ts`, the gateway route map, and the §4 table are generated or drift-checked from it in CI (the `agent-hub-sync` script, `scripts/agent-hub-sync.mjs`, already demonstrates the sync+check mechanism). Until implemented, §4 in this file is the single hand-maintained source.

### Related (owned elsewhere)
- Facade-vs-sync-API split and the graph-mode keep/delete decision: [persistence.md](./persistence.md).
- Dead-code sweep (workbench `reactive.server.ts`, gateway visuals, core `_examples/`, `getTagsServerFn` name collision at `apps/nxus-core/src/services/apps/apps.server.ts:77` vs `src/services/tag.server.ts:158`, `packages/_commands`): not a spec concern beyond §1/§3; tracked as cleanup work.
