# Toolchain

Invalidated by: implementation decisions about build, test, lint, dev-server, or CI tooling.

Scope: dev entrypoints, the command registry, task-runner shape, typecheck/lint/test mechanics, the e2e strategy, CI gates, and the codebase-memory grounding artifact. The app/port/base-path registry lives ONLY in [architecture.md](./architecture.md) — this file never restates it. The `@nxus/db/server` client-bundle import ban that lint enforces is defined in [architecture.md](./architecture.md) (server-function pattern); architecture modes and the facade contract are in [persistence.md](./persistence.md); the editor persistence contract is in [editor-sync.md](./editor-sync.md).

## 1. Dev entrypoints — the ONLY sanctioned ways to run

There are exactly two sanctioned ways to start nxus. Agents and humans MUST use these and MUST NOT invoke `vite dev` inside an app directory, spawn servers on ad-hoc ports, or add parallel entrypoints:

| command | effect | evidence |
|---|---|---|
| `pnpm dev` | all 6 apps in parallel via `nx run-many --target=dev` | `package.json:11` |
| `pnpm dev:<app>` | one app; `<app>` ∈ `gateway\|core\|workbench\|calendar\|recall\|editor` → `nx run @nxus/<name>:dev` | `package.json:12-17` |

Each app's inferred `dev` target is a plain `vite dev --port 300X` package script (`apps/*/package.json:6`); the port assignments are the registry in [architecture.md](./architecture.md). E2E and CI reuse `pnpm dev` verbatim (`playwright.config.ts:26`), which is why it MUST remain the single boot path: anything the apps need at runtime must be reachable from that one command.

Why sanctioned-only: the gateway proxy topology (one origin, fixed upstream ports) and the Playwright `webServer` both assume this exact port layout; a hand-launched server on a different port is invisible to both.

DRIFT: predev kills by port with kill -9
- canonical: starting a dev server MUST NOT destroy processes it does not own; port conflicts fail fast with a clear error.
- current: `predev` runs `lsof -ti :$port | xargs kill -9` for ports 3000-3005 before every `pnpm dev` (`package.json:10`). It kills *any* process bound to those ports, and because Playwright's `webServer` command is `pnpm dev` (`playwright.config.ts:26`), a test run can `kill -9` the very dev servers `reuseExistingServer: !process.env.CI` (`playwright.config.ts:28`) intends to reuse. (Note: npm/pnpm `pre*` hooks fire when the *script* runs, so any invocation path through `pnpm dev` triggers it.)
- impact: silent murder of unrelated processes; racy e2e startup; masks the real defect (no graceful port-conflict handling).
- closes: replace with a check-and-fail (`lsof` → error message naming the PID), or scope the kill to PIDs whose command matches `vite dev`.

## 2. Command registry

All orchestration lives in root `package.json` scripts (`package.json:5-27`) — Nx has no custom targets or `targetDefaults`:

| command | runs | notes |
|---|---|---|
| `pnpm typecheck` | `nx run-many --target=typecheck --all` | target inferred by `@nx/js/typescript` plugin for every project (`nx.json:8-33`) |
| `pnpm lint` | `oxlint` (flat, whole repo) | config `.oxlintrc.json`; see §4 |
| `pnpm test` | `nx run-many --target=test --all` | Vitest per project; see §5 |
| `pnpm test:libs` | test target for `@nxus/db,@nxus/workbench,@nxus/calendar,@nxus/ui` | `package.json:20` |
| `pnpm test:coverage` | `pnpm test` with `--coverage` | CI uploads `libs/*/coverage/`, `apps/*/coverage/` (`ci.yml:59-68`) |
| `pnpm e2e` / `e2e:ui` / `e2e:headed` | `playwright test` (+ `--ui` / `--headed`) | `package.json:22-24`; see §6 |
| `pnpm test:all` | `pnpm test && pnpm e2e` | full local gate |
| `pnpm agent:sync` / `agent:check` / `agent:test` / `agent:sync:codex-home` | `scripts/agent-hub-sync.mjs` — syncs `agent-hub/` skills + MCP config into `.claude/`, `.codex/`, `.gemini/`, `.mcp.json` | `package.json:6-9`; `.mcp.json` is GENERATED — never hand-edit, fix `agent-hub/mcp/servers.json` and re-sync |
| `pnpm --filter @nxus/core-app db:seed` | `tsx scripts/db-seed.ts` | `apps/nxus-core/package.json:14`; CI seeds before e2e (`ci.yml:93-94`) |

Build: apps build via their own `vite build` scripts (`apps/*/package.json:7`); there is no aggregate `pnpm build`. Lib `build` targets are inferred by the Nx typescript plugin only where a `tsconfig.lib.json` exists (`nx.json:15-20`) — currently `libs/nxus-calendar` and `libs/nxus-ui` (and `nxus-ui` is excluded from the build-configured plugin registration, `nx.json:22`, so it gets typecheck only). Libs are otherwise consumed as source via the `customConditions: ["@nxus/source"]` export condition in `tsconfig.base.json`.

## 3. Task-runner and TypeScript shape

Nx 22.3.3, minimally configured on purpose: `nx.json` contains only `namedInputs` and two `@nx/js/typescript` plugin registrations (`nx.json:3-33`). There are no `targetDefaults` and no cache configuration, and `production` is just `["default"]` (`nx.json:5`) — every `nx run-many` re-executes everything. Adding caching SHOULD start by tightening `production` inputs, or any future cache will over-invalidate.

TypeScript is a workspace-references layout: `tsconfig.base.json` is strict + `composite`/`emitDeclarationOnly` + `module: nodenext`; root `tsconfig.json` references only the 5 libs — apps and `e2e/` are outside the root references graph and typecheck standalone via their Nx-inferred `typecheck` targets (`e2e/tsconfig.json` extends base with `noEmit`). Consequence: `tsc -b` at the root does NOT prove the apps compile; only `pnpm typecheck` does.

Git hooks: none (no husky/lefthook; `.git/hooks/` has only samples). CI is the sole enforcement point — see §7 for what that actually gates.

## 4. Lint

oxlint is the only linter (`package.json:25`). `.oxlintrc.json` enables just two TS rules (`typescript/no-explicit-any` warn, `typescript/no-unnecessary-type-assertion` error, `.oxlintrc.json:3-6`). Its real value is the `no-restricted-imports` override (`.oxlintrc.json:7-35`) banning `@nxus/db/server` and `@nxus/workbench/server` imports from app `routes/`, `components/`, and `lib/` directories — the mechanical gate for the client-bundle rule in [architecture.md](./architecture.md).

DRIFT: tests are unlinted
- canonical: the server-import ban and TS rules apply to all source, tests included.
- current: `ignorePatterns` excludes `**/*.test.ts` and `**/__tests__/**` (`.oxlintrc.json:36-42`); combined with zero git hooks, nothing enforces the import ban in test files.
- impact: a test can import `@nxus/db/server` at top level and normalize the pattern agents then copy into product code.
- closes: drop the two test exclusions (fix fallout), or add a narrower override that keeps stylistic rules off tests but keeps `no-restricted-imports` on.

Note the ban's file-pattern scope: `services/`, `hooks/`, `stores/` under apps are NOT covered by the override — the rule relies on convention (`.server.ts` wrappers) there. Widening the glob is cheap and SHOULD happen when the rule is next touched.

## 5. Unit tests

Vitest per project, no root config. Configs exist for 3/6 apps (`apps/nxus-core`, `apps/nxus-editor`, `apps/nxus-gateway`) and all 5 libs (`apps/*/vitest.config.ts`, `libs/*/vitest.config.ts`); the calendar, recall, and workbench *apps* have neither a vitest config nor a `test` script — `pnpm test --all` silently covers 0 lines of them. That is acceptable while those apps stay thin shells over tested libs ([architecture.md](./architecture.md)); any logic added to a shell app MUST bring a vitest config with it.

Unit tests are the invariants layer; e2e is the behavioral proof layer (§6). Data-model invariants that only exist as prose in [../product/data-model.md](../product/data-model.md) SHOULD each get a one-assertion unit test in `libs/nxus-db` — `libs/nxus-db/src/services/bootstrap-parity.test.ts` (added when the FIELD_NAMES↔bootstrap mismatch was fixed, commit 60d0741) is the template: a loop test that permanently kills a class of silent read breakage nothing else gated.

## 6. E2E strategy

Playwright (`playwright.config.ts`), chromium-only project (`:18-23`), `testDir: './e2e'`, `baseURL: http://localhost:3001` (`:12`) — **every spec runs through the gateway proxy**, so e2e also proves the one-origin routing contract in [architecture.md](./architecture.md). CI runs 1 worker with 1 retry; local runs are parallel with an HTML reporter (`:5-9`).

Boot model: the `webServer` block runs `pnpm dev` — all 6 apps — and polls the gateway's `/__health` (`playwright.config.ts`, endpoint at `apps/nxus-gateway/vite.config.ts:29`), regardless of which single spec you asked for. Server reuse is OFF by default: the config deletes the e2e DB at load time, and deleting it under a still-running server unlinks the inode the server holds — server and tests then silently operate on two different databases at one path ([learnings/e2e-db-split-brain.md](../../learnings/e2e-db-split-brain.md)). `PW_REUSE_SERVER=1` re-enables reuse for fast local iteration and skips the delete (the DB accumulates across runs); the delete and the reuse flag MUST stay coupled.

Layout: `e2e/<app>/*.spec.ts` per app (editor 2, core 5, calendar 3, workbench 4, recall 3 + `mock-ai.ts` AI mock, gateway 1 — ~85 `test()` blocks, editor's 940-line `outline-editor.spec.ts` dominant), shared `e2e/fixtures/base.fixture.ts` and `e2e/helpers/navigation.ts` (URL/name constants). New behavior-bearing features MUST land with a story-named e2e spec — e2e specs are the behavioral proof layer; when spec prose and an e2e test disagree, one is wrong and the disagreement becomes a `DRIFT:` block (see [../README.md](../README.md)).

DRIFT: core specs are order-dependent in long single-worker runs

- canonical: every e2e spec passes regardless of suite composition and worker count.
- current: `e2e/core/gallery.spec.ts` C2/C3 (and the long-known `inbox.spec.ts` C8) fail in full-suite single-worker runs but pass isolated and at the overnight baseline — earlier core specs mutate the shared e2e DB (items accumulate) and later assertions inherit that state.
- impact: full-suite runs carry ~2 known false reds; per-app runs are the trustworthy gate for app-scoped changes.
- closes: give core specs the seeded-isolation treatment already applied to editor/workbench specs (own nodes via direct-DB seed + zoomed/filtered views; see `learnings/e2e-autoseed-suppression.md` for the bootstrap-gate protocol).

DRIFT: 502-retry fixture papers over readiness
- canonical: the gateway `/__health` endpoint reports ready only when all upstream apps answer; tests navigate once, no retry loops.
- current: `/__health` passes before upstreams finish booting, so `navigateToApp` retries up to 3× on HTTP 502 with 3s sleeps (`e2e/fixtures/base.fixture.ts:11-21`), then waits for `networkidle` (`:22`) — itself a flake-prone signal under polling transports.
- impact: readiness is re-solved per-test instead of once at the gate; slow starts surface as timeouts in whichever spec ran first; `networkidle` breaks silently if any app adds long-polling/SSE.
- closes: make `/__health` fan out to all 6 upstreams (return 503 until each responds), delete the retry loop, replace `networkidle` with app-specific ready selectors.

DRIFT: ARCHITECTURE_TYPE=graph matrix tests an app that cannot honor it
- canonical: every CI matrix leg exercises the mode it names; the editor reaches storage exclusively through `nodeFacade` ([persistence.md](./persistence.md)).
- current: CI runs the full e2e suite under `ARCHITECTURE_TYPE: [node, graph]` (`ci.yml:73-78`), but the editor's server functions import the sync SQLite API (`assembleNode`, drizzle `nodes`/`eq`) directly from `@nxus/db/server` (`apps/nxus-editor/src/services/outline.server.ts:16-27`), bypassing the facade — so the `graph` leg's editor specs still read/write SQLite. A green `graph` matrix proves nothing about SurrealDB for the flagship app.
- impact: false confidence in graph mode; the matrix doubles CI cost while its discriminating power is limited to the few facade-honoring paths.
- closes: either route editor server fns through `nodeFacade` (then the matrix is meaningful) or shrink the `graph` leg to the specs that exercise facade-backed surfaces until the mode decision in [persistence.md](./persistence.md) lands.

## 7. CI gates

`.github/workflows/ci.yml` runs on PRs to `main` (`ci.yml:3-5`), with per-ref concurrency cancellation. Active jobs: **Lint** (`pnpm lint` + `pnpm agent:check`, `ci.yml:12-29`), **Typecheck** (`pnpm typecheck`, `ci.yml:31-48`), **Spec-first gate** (`scripts/check-spec-first.mjs` over the PR range, `ci.yml:50-62` — see [spec-first-change](../rules/spec-first-change.md)), **Unit Tests** (`pnpm test:coverage` + coverage artifact), **E2E** (matrix `[node, graph]`, seeds via `db:seed`, uploads Playwright artifacts on failure). Because there are no git hooks (§3), this workflow is the entire enforcement surface.

(Closed 2026-07-07: the "CI typecheck is disabled" DRIFT — every app now has a real `tsc --noEmit` target and the workspace is green, so the job is live; and the "agent:check not wired into CI" DRIFT — the check runs in the lint job, and `.mcp.json`'s playwright server now flows from `agent-hub/mcp/servers.json` instead of a hand edit.)

Known non-gates, for completeness: tests unlinted (DRIFT §4), no Nx caching so every job pays full cost (§3), and a stale nested `apps/nxus-core/pnpm-lock.yaml` that contradicts single-lockfile workspace semantics and SHOULD be deleted.

## 8. Codebase-memory graph artifact

`.codebase-memory/graph.db.zst` is a compressed knowledge graph of the repo (functions/files/calls — ~9.7k nodes, ~17k edges per `.codebase-memory/artifact.json`, which records the commit it was indexed at). It is the **code-grounding layer**: structural questions (callers, call chains, dead code, blast radius) are answered from the graph via the codebase-memory MCP tools (`query_graph`, `search_graph`, `trace_path`) instead of ad-hoc grepping. Regenerate with the `index_repository` MCP tool whenever `artifact.json`'s `commit` drifts materially from `HEAD`; regeneration MUST happen in the same change that relies on fresh structure.

DRIFT: graph artifact is untracked
- canonical: `.codebase-memory/{graph.db.zst,artifact.json}` are committed, so a fresh clone has the grounding layer without re-indexing, and `artifact.json.commit` is auditable against history.
- current: `.codebase-memory/` is untracked and not gitignored (`git status` → `??`); the artifact exists only on machines that have run an index.
- impact: agents on fresh clones silently lack structural grounding; no way to detect a stale graph in review.
- closes: `git add .codebase-memory/` and commit alongside a freshness note, or explicitly gitignore it and declare the artifact machine-local (either resolves the ambiguity; committing is canonical).
