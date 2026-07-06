# Learnings — Substrate Knowledge Index

Invalidated by: nothing in nxus — each entry is invalidated only when the *substrate* (tool, library, OS, infra) changes.

This directory holds hard-won facts about the tools nxus is built on: Vite, TanStack Start, Playwright, SQLite, Nx, macOS quirks. They are advisory, not normative — they describe the world, not nxus. Read this index before build/tooling/infra work; a two-minute read here routinely saves an hour of rediscovery.

## What belongs here

- A discovery about a tool/library/platform that cost real debugging time and will bite again (e.g. "Vite follows top-level imports at build time regardless of file suffix").
- Behavior that contradicts the tool's documentation or reasonable expectation.
- Workarounds with the *why* attached, so they can be deleted when the substrate fixes itself.

## What does NOT belong here

- Product or implementation decisions about nxus → `spec/product/` or `spec/tech/`.
- Workflow/coding policy → `spec/rules/`.
- Anything derivable from code (registries, indexes) → generated artifacts.
- Exploratory thinking → `docs/notes/` (dated).
- One-off incident logs with no future predictive value.

## Entry format

One file per learning, kebab-case slug. Each entry MUST carry: a date (when learned), the context (what we were doing), the discovery (what the substrate actually does), and a one-line **Takeaway** an agent can act on without reading the body.

## Index

| Entry | Substrate | Takeaway |
|---|---|---|
| [vite-server-only-imports.md](vite-server-only-imports.md) | Vite / TanStack Start | Node-only deps (better-sqlite3) MUST be dynamically imported *inside* server-fn handlers; `.server.ts` suffixes and re-exports do not protect the client bundle. |
| [playwright-mcp-profile-lock.md](playwright-mcp-profile-lock.md) | Playwright MCP / Chrome | "Browser is already in use" = a stray Chrome process holds the MCP profile lock; find and kill the holder PID. |
