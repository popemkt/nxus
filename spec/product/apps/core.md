# nxus-core — hub app

Invalidated by: product decisions about what the hub manages (tools, commands, terminal, inbox, settings).

Core (port 3000, base `/core` — see [../../tech/architecture.md](../../tech/architecture.md) for the registry) is the management hub: it registers external tools/repos as "apps", exposes them through a command palette and embedded terminal, and hosts the inbox + automations and global settings.

## App registry & manifests

- Every managed tool MUST be described by a manifest at `apps/nxus-core/src/data/apps/<id>/manifest.json` (~68 manifests today: git, docker, claude-code, n8n, …). Manifest shape is owned by `docs/reference/manifest-schema.md`.
- Manifest root is env-overridable: `APP_DATA_ROOT`, default resolved in `apps/nxus-core/src/paths.ts:35`. Install targets live under `~/.nxus/repos` and `~/.nxus/apps` (`paths.ts:25-50`).
- On first DB access, manifests MUST be auto-seeded into the node graph (`services/db/ensure-seeded.server.ts:16-29` registers a seed callback that runs `scripts/seed-nodes.js`). Apps are nodes; reads go through the facade adapter `services/apps/node-items.server.ts` which converts `AssembledNode` → legacy `Item` (`apps.server.ts:14-40` delegates via dynamic import).
- App Manager UI (`routes/index.tsx:28`): gallery/table/graph views, tag-tree filtering, tool-health badges (check-command probes with 5-min TTL, `services/apps/item-status.server.ts`). App detail (`routes/apps.$appId.tsx`): install/uninstall, instances, docs viewer, dependency checks.

DRIFT: app registry client cache is a second source of truth
- canonical: React Query cache is the only client-side source for the app list.
- current: `appRegistryService` mutable singleton is hydrated from a `useEffect` (`hooks/use-app-registry.ts:60-64`) for sync consumers (command palette registry, workflow executor, settings); sync readers can race hydration.
- impact: stale/empty palette or settings on first paint; `isLoaded()` conflates "empty DB" with "not loaded" (`services/apps/registry.service.ts:36-38`).
- closes: sync consumers read from the Query cache; delete the singleton.

## Command palette

- Global palette mounted in `routes/__root.tsx` overlays. Command sources: generic commands (`services/command-palette/registry.ts:31`, `commandRegistry` at `:561`) + per-app commands derived from manifests. Execution via `executor.ts`, availability gating via `availability.ts`, user-defined aliases persisted via `alias.server.ts` (managed in Settings).
- Commands that spawn processes MUST route through the terminal layer below, not ad-hoc exec.

## Terminal

- Embedded terminal = server-side node-pty sessions over HTTP polling: create/write/poll/resize/close server fns in `services/shell/pty.server.ts:43-191` (`pollPtyOutputServerFn` `:101`; `streamPtyOutputServerFn` is a deprecated alias `:160-161`), session lifecycle in `pty-session-manager.server.ts`.
- Script/command resolution (`script-resolver.server.ts`, `command.server.ts`, param adapters) and OS helpers (folder picker, open-path, open-terminal) live in `services/shell/`.
- `node-pty` is Node-only and MUST stay out of client bundles (dynamic imports + vite externals; pattern in [../../tech/architecture.md](../../tech/architecture.md)).

## Inbox + automations

- Inbox items are nodes with a `status` property: `'pending' | 'processing' | 'done'` (`services/inbox/inbox.server.ts:26,43-52`). Counts are reactive computed fields; listings are saved queries; automation CRUD in `services/inbox/inbox-reactive.server.ts` (reactive machinery owned by [../../tech/reactivity.md](../../tech/reactivity.md)).
- Loading the inbox route MUST initialize the reactive layer before querying it.

DRIFT: inbox loader races its own seeding
- canonical: `initInboxReactiveServerFn` completes before status queries run.
- current: loader runs init in parallel with the three status queries and swallows its errors with `.catch(() => null)` (`routes/inbox.tsx:45`).
- impact: first load can render empty/incorrect lists with no error surfaced.
- closes: `await` init first (or chain queries on it); surface failures.

## Settings

- Sections: `'general' | 'keyboard' | 'aliases' | 'apps'` (`routes/settings.tsx:42-48`) — theme/palette, keyboard shortcuts, command aliases, per-app configuration. Theme palette list is currently copy-pasted per app (consolidation decision in [../../tech/architecture.md](../../tech/architecture.md)).
