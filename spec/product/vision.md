# Nxus Vision

Invalidated by: product decisions about what nxus is for.

## What nxus IS

Nxus is a **Tana-inspired, local-first personal knowledge ecosystem** in which everything — notes, tasks, events, flashcards, apps, tools, commands — is a node in one universal graph, and every application is a specialized *lens* over that same graph.

The substrate is a single local SQLite database of nodes and node-properties (`libs/nxus-db/src/schemas/node-schema.ts:15,52`). Schema is not fixed upfront: users attach `#supertags` to nodes to give them shape and behavior, and field definitions and supertags are themselves ordinary nodes — the meta-model is self-hosting, down to `#Supertag` being tagged with itself (`libs/nxus-db/src/services/bootstrap.ts:239-242`). The full data contract and its invariants live in [data-model.md](data-model.md).

On top of the substrate, the graph is **live**: writes emit events that drive query subscriptions, computed fields, and user-defined automations in-process (`libs/nxus-db/src/reactive/`). Everything queryable, everything automatable. See [../tech/reactivity.md](../tech/reactivity.md).

The product thesis: **one universal node graph, many specialized lenses** — edit (editor), explore (workbench), schedule (calendar), learn (recall), manage (core). Users MUST be able to create a node in one lens and encounter the same node, with the same supertags and fields, in every other lens. No lens owns its data; the graph does.

## North star

Further the **Tana editor + data model vision**: an outline editor where structure emerges from tagging rather than schema migration — supertags carry field definitions, fields render inline on the same editing plane as content, references are first-class and backlinked, and saved queries are live views over the graph. When prioritization is unclear, the editor and the data model win: they are the flagship and the foundation; every other app MUST remain a thin lens.

## Principles (product-level)

- **Local-first.** Data lives on the user's machine in SQLite; the system MUST be fully functional offline with no external service required. Cloud integrations (e.g. Google Calendar sync, Anthropic-backed AI in recall) are optional enrichments, never dependencies of the core loop.
- **One graph, one origin.** All apps read and write the same database and are served under a single origin via the gateway proxy (`apps/nxus-gateway/vite.config.ts:16-22`). Registry and deployment specifics — including the dev-only status of that proxy — are owned by [../tech/architecture.md](../tech/architecture.md).
- **Schema by tagging.** Applying a supertag is the only act needed to give a node fields, defaults, and behavior. There is no separate "create a table/collection" ceremony.
- **Agent-legible.** The system (specs, manifests, node graph) is structured so AI agents can read, extend, and automate it; app/tool manifests are the extension surface (`docs/reference/manifest-schema.md`).

## The apps (one universal graph, six lenses)

| App | One sentence | Brief |
|---|---|---|
| **editor** | Tana-style outline editor — the flagship: supertags, inline fields, node references with backlinks, inline live queries, and views over the graph. | [editor.md](editor.md) |
| **workbench** | Read-mostly exploration lens: node browser, inspector, 2D/3D graph visualization, and visual query builder. | [apps/workbench.md](apps/workbench.md) |
| **calendar** | Scheduling lens rendering nodes-as-events on a calendar, with two-way Google Calendar sync. | [apps/calendar.md](apps/calendar.md) |
| **recall** | Learning lens: FSRS spaced-repetition review over nodes, Bloom's-taxonomy-aware, with AI-assisted card generation. | [apps/recall.md](apps/recall.md) |
| **core** | Management hub: app/tool registry (~65 manifests), command palette, embedded terminal, inbox, and automations UI. | [apps/core.md](apps/core.md) |
| **gateway** | Launcher landing page and reverse proxy that unifies all apps under one origin. | [apps/gateway.md](apps/gateway.md) |

The registry of ports/base-paths is owned by [../tech/architecture.md](../tech/architecture.md); do not duplicate it here.

## Maturity (honest statement)

The vision is real in the code — all six lenses exist and share the graph — but the current materialization is **prototype-grade** in its persistence guarantees (no transactions, fire-and-forget editor sync, in-process-only reactivity) and scaling (full-scan query evaluation, full-tree editor loads). These are recorded as `DRIFT:` blocks in [../tech/persistence.md](../tech/persistence.md), [../tech/editor-sync.md](../tech/editor-sync.md), and [../tech/reactivity.md](../tech/reactivity.md) — they are implementation gaps, not product retreats.

## Non-goals

- **Not multi-user / not a hosted SaaS.** There is no auth, tenancy, or server deployment story, and none is sought at this stage; nxus is a single-user, single-machine system.
- **Not a multi-device sync product (yet).** No CRDT/replication layer exists; local-first here means local-only until a deliberate product decision says otherwise.
- **Not a Tana clone.** Tana is the design north star for the editor and data model, not a pixel-for-pixel target; features are adopted because they serve the one-graph/many-lenses thesis, not for parity.
- **Not a general app platform or plugin marketplace.** Core's registry manages *this user's* tools and scripts via JSON manifests; there is no distribution, sandboxing, or third-party ecosystem ambition.
- **Not schema-first.** Nxus will not grow upfront table/collection definitions; structure MUST keep emerging from supertags on nodes.
