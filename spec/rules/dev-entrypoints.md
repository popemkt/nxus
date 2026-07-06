---
id: dev-entrypoints
scope: workflow
principle: Single source of truth
enforcement: prose
gate: package.json
---

# Dev entrypoints rule

Invalidated by: policy decisions about how the system is launched and exercised.

The root `package.json` `scripts` block (`package.json:5-27`) is the **only launch surface**. Every way of running, testing, or checking nxus is a named script there; anything not reachable from a root script does not exist as a supported workflow.

1. Agents and docs MUST invoke `pnpm <script>` (`pnpm dev`, `pnpm dev:editor`, `pnpm test`, `pnpm e2e`, `pnpm lint`, `pnpm typecheck`, `pnpm agent:check`, …) — never raw `vite`, `playwright test` with ad-hoc flags baked into docs, or `nx run` invocations invented per-session. Per-app dev servers go through their `dev:<app>` alias, which resolves to the Nx target.
2. Adding a new workflow (new app, new check, new generator) MUST add a root script in the same PR. A capability without a script is undiscoverable and will fork into per-agent incantations.
3. Scripts are **behavioral contract**: `predev` force-kills ports 3000-3005 (`package.json:10`) — this is a documented side effect, and any doc or tool that assumes ports survive `pnpm dev` is wrong. Changing a script's behavior is a technical change routed per [spec-first-change.md](spec-first-change.md) (owner: `spec/tech/toolchain.md`).
4. The app/port/base-path registry is NOT owned here — it lives only in `spec/tech/architecture.md` until generated ([generated-registries.md](generated-registries.md)).

Why: launch instructions are the fastest-rotting doc genre (the pre-spec `docs/getting-started.md` invoked a root `pnpm db:migrate` script that does not exist — the only `db:migrate` is the core app's manifest-sync script, `apps/nxus-core/package.json:16`, invoked as `pnpm --filter @nxus/core-app db:migrate`). Pointing all prose at one executable table makes the table self-verifying: a wrong script fails when run.

**Drift mode:** this rule drifts when docs/specs cite commands absent from `package.json:scripts`, or when scripts accrete that no doc mentions. Check: every command in `spec/` and `AGENTS.md` must exist in the scripts block; review-time only, no automated check yet.
