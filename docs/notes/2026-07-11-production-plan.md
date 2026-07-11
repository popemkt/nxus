# Production plan — 2026-07-11

Non-normative planning note (normative pieces graduate into spec/tech/ as they land). Grounded in a full repo audit (this session): test estate, CI, env/config, build/packaging, data durability, operational gaps, DX.

Target: nxus runs as the owner's daily-driver PKM — durable data, multi-device access, agents hitting the MCP/REST surface — without a human babysitting dev servers.

## Where we actually stand (audit headlines)

**Strong:** 76 unit test files / ~1300 tests with genuinely load-bearing engine coverage (reactive layer, backend parity, query evaluator); 29 e2e specs / ~97 tests through the real gateway in a node×graph CI matrix; spec discipline (most gaps below are already honest `DRIFT:` blocks); one-command dev setup that is truthfully documented.

**Blockers (each is a production incident waiting):**
1. Master DB lives *inside the lib source tree* (`libs/nxus-db/src/data/nxus.db`, `import.meta.url` resolution) — breaks under any bundled/packaged deployment. Known DRIFT.
2. **No migration system** — inline `CREATE IF NOT EXISTS` + try/catch `ALTER TABLE` with swallowed errors. First schema change against real data is Russian roulette. Known DRIFT (fix path: drizzle-kit).
3. **No backup story at all.** TIF export is portability, not backup.
4. **Observability = 163 console.* calls.** No structured logging, no error sink, and the sprint's core lesson was that this codebase's failure mode is *silent* errors.
5. Health endpoint is a dev-only Vite middleware that reports ready before the apps are.
6. **No production build/run story:** no aggregate build, backend libs are consumed as TS source (never compiled), no Dockerfile, no deploy workflow, `pnpm dev` is the only way to run the system.
7. Env vars are tribal (no `.env.example`, no boot-time validation).

## Testing philosophy (now canonical in spec/rules/testing.md)

Tests serve exactly three purposes — verification, regression protection (inherent: tests are never deleted), and unwanted-side-effect elimination (perf budgets, concurrency, incorrectness). Coverage is measured in CI but never a goal; hollow tests are rejected; unproven guarantees are marked `(unguarded)` under the BDD-clause convention (spec/rules/bdd-clauses.md) rather than papered over. Test-estate actions this implies:

- `libs/nxus-node-api` — the ONLY lib with zero tests (operations.ts is 734 lines of logic). Needs a vitest project. (Purpose 1)
- `apps/nxus-recall` server fns — only e2e-covered via mocked AI; the sprint found two real bugs here. Unit-test the DB-backed paths. (Purpose 1)
- Concurrency suite — multi-writer races on the facade (the class of bug INV-8/bootstrap-race fixes guard) has ~2 tests total. (Purpose 3)
- `pty-buffer.test.ts` is three `it.todo`s masquerading as coverage — implement or delete the façade. (honesty)
- TIF round-trip invariant (export → import → identical graph) — Tana's own community flags theirs as broken; ours must be a tested clause. (Purposes 1+3)
- Wire `scripts/check-bdd-clauses.mjs` into CI once the retrofit wave lands; un-exclude tests from oxlint (existing DRIFT).

## Hosting: recommendation

**Phase H1 (now): self-host on your own hardware behind Tailscale.** Single-user local-first app; the correct "production" is a always-on box you own (home server / NAS / mini-PC / even the laptop via launchd), reachable from all devices over tailnet — no public exposure, so no auth buildout blocks it; mobile browser access comes free. SQLite stays the default backend (Surreal server mode optional, one more container).

**Phase H2 (later): public VPS** only if sharing/collaboration appears — requires authn in front of gateway + REST (host concern by spec), TLS, off-site backups. **Desktop packaging (Tauri)** is a separate later track for the offline-laptop story; the web-behind-Tailscale model makes it non-urgent.

## Workstreams

**P1 — a real build & run story** (prereq for everything)
- `vite build` all 6 apps + one production Node entry that serves the built outputs under the gateway's path registry (spec/tech/architecture.md stays SSOT), replacing the 6-dev-server topology in prod.
- Real health: gateway `/__health` fans out to upstream readiness (kills the e2e 502-retry papering, existing DRIFT).
- Kill `predev`'s indiscriminate port murder in the prod path.

**P2 — data durability** (highest risk-reduction per hour)
- DB default to `~/.nxus/nxus.db` (env-overridable), never inside the package (closes persistence DRIFT).
- drizzle-kit migrations with a schema-version table; delete the empty try/catch "migration".
- Backup: nightly `sqlite3 .backup` snapshot + rotation, plus weekly TIF export as format-independent insurance; Litestream (continuous WAL replication to any S3/NAS target) as the upgrade.
- `.env.example` + Zod-validated env at boot — fail fast, list every missing/invalid var (same shape as the seed fail-fast).

**P3 — observability** (the sprint proved silent errors are THE failure mode)
- pino structured JSON logs replacing raw console.* in server paths; one error-level sink file the user (or an agent) can grep.
- Server-fn error envelope already exists — log every `success: false` at the boundary with action/fn name.
- Optional Sentry-compatible sink later; self-host-friendly default is file + `journalctl`.

**P4 — packaging & deploy**
- Dockerfile (multi-stage: pnpm build → slim runtime) + compose (app + optional surreal + Litestream sidecar); GH release workflow building the image.
- launchd/systemd unit examples for bare-metal.

**P5 — CI & DX hardening**
- Nx task caching in CI (currently every job pays full cost — known gap); delete stale nested lockfile.
- clauses:check + oxlint-over-tests + the app-registry drift check stay the enforcement surface.

Order: P2 → P1 → P3 → P4 → P5. P2 first because data loss is unrecoverable; everything else is re-doable.
