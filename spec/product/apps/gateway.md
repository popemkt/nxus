# nxus-gateway — launcher + one-origin proxy

Invalidated by: product decisions about how the mini-app suite is entered and served.

Gateway (port 3001, base `/`) is the front door: a launcher landing page listing every mini-app, plus a reverse proxy that serves the whole suite under **one origin**. The one-origin story is a product requirement — cross-app links, shared localStorage (theme), and cookies all assume a single host. Ports/base paths are owned by [../../tech/architecture.md](../../tech/architecture.md).

## Launcher

- `/` renders a card per mini-app from the static `miniApps[]` list (`apps/nxus-gateway/src/config/mini-apps.ts:9-50`: id, name, description, icon ∈ `cube|graph|calendar|brain|notepad`, path). Clicking a card navigates to that app's base path *on the same origin* — never to a raw port.
- 11 swappable card-layout "visuals" exist; the user's choice persists per browser (`nxus-gateway-visual` localStorage key, `components/visual-switcher.tsx:29`). This is design-exploration surface, not contract: any single layout satisfies the spec.
- Gateway has no server functions and no DB access — pure static SSR + proxy. It MUST stay that way; anything stateful belongs in core.

## Proxy contract

- Every request whose path starts with a registered app prefix MUST be forwarded to that app's dev server; everything else falls through to the gateway's own SSR.
- Current materialization: custom Vite plugin `miniAppProxy` (`apps/nxus-gateway/vite.config.ts:15-95`) — route map `:16-22` (`/core→3000`, `/workbench→3002`, `/calendar→3003`, `/recall→3004`, `/editor→3005`), raw `node:http` pipe `:46-67`, 502 JSON on unreachable upstream `:60-65`, manual WebSocket/HMR upgrade replay over `net.connect` `:71-92`, `/__health` liveness endpoint `:28-35`.
- Each mini-app cooperates by serving under its base path (e.g. core sets Vite `base: '/core/'` and router `basepath: '/core'`).

DRIFT: no production proxy
- canonical: the one-origin story holds in any deployment — a built gateway routes app prefixes to the built apps.
- current: proxying lives in `configureServer` (`vite.config.ts:26`), which only runs under `vite dev`; a production nitro build serves the landing page but every card link 404s. No prod deployment story exists in the repo.
- impact: "one origin" is only true in development; any deploy silently breaks the entire suite.
- closes: a deployment decision — nitro routeRules / standalone reverse proxy (Caddy/nginx) generated from the app registry, or single-app consolidation.

DRIFT: prefix matching lacks a boundary check
- canonical: `/calendar2` or `/corestuff` are NOT proxied (prefix must match a whole path segment).
- current: `url.startsWith(prefix)` (`vite.config.ts:39-41` and `:73-75` for WS).
- impact: wrong upstream receives look-alike paths.
- closes: match `prefix` exactly or `prefix + '/'`.

DRIFT: WS upgrade replay is hand-rolled and lossy
- canonical: upgrade requests are replayed faithfully and the upstream 101 is validated.
- current: headers rebuilt via string template — array-valued headers comma-join (`vite.config.ts:82-84`); upstream response is never checked before piping.
- impact: rare malformed upgrades; failures surface as silent socket drops.
- closes: use an off-the-shelf proxy (http-proxy) or validate the 101 handshake.

## Known duplication (record, don't hide)

- The app list exists twice inside gateway alone (`mini-apps.ts:9-50` paths; `vite.config.ts:16-22` paths→ports) and the icon map ~11× across visuals. Registry consolidation is decided in [../../tech/architecture.md](../../tech/architecture.md).
- The 19-palette theme bootstrap in `src/routes/__root.tsx:7-48` mirrors core's `theme-options.ts` by hand; theme extraction to `@nxus/ui` is the same architecture decision.
