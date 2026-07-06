---
id: db-layer-authoritative
scope: architecture
principle: Separation of concerns
enforcement: prose
gate: —
---

# DB layer authoritative rule

Invalidated by: implementation decisions about where domain logic lives.

`@nxus/db` (`libs/nxus-db`) is the **single authoritative home of domain logic**: node CRUD, assembly, property semantics, supertag inheritance, query evaluation, validation, and the reactive layer. Apps are thin lenses: they render state and call server functions; server functions validate input at the boundary and delegate to `@nxus/db` services.

1. Business derivation (inferring a field's type, merging inheritance, deciding what "deleted" means, computing query results) MUST live in `@nxus/db/server` services — not in app server functions, and never in client code (components, hooks, stores).
2. Client stores MAY hold optimistic UI state, but MUST NOT be the place where domain rules are decided. A rule you can only learn by reading an app's Zustand store is a misplaced rule.
3. Data-model invariants (see `spec/product/data-model.md`) are enforced in `@nxus/db` service functions, at write time — never re-derived downstream per-app.
4. Apps access the db layer only via the server-function pattern in [server-functions.md](server-functions.md); mode selection (`node`/`graph`) is the db layer's concern (`spec/tech/persistence.md`), never leaked into feature code.

Why: with 6 apps over one graph, any domain rule implemented app-side forks per app (see [no-duplicate-concepts.md](no-duplicate-concepts.md)) and silently diverges. One authoritative layer is what makes "many lenses, one graph" true rather than aspirational.

DRIFT: domain logic implemented app-side
- canonical: field-type resolution, tree assembly policy, and registry state are `@nxus/db` (or dedicated service) concerns.
- current: the editor infers field types by UUID-regex heuristic and hardcoded `'text'` fallback inside its own server fn (`apps/nxus-editor/src/services/outline.server.ts:48-63`), and assembles the outline tree shape app-side (`:29-120`); nxus-core mirrors app-registry state into a mutable singleton from a React effect (`apps/nxus-core/src/hooks/use-app-registry.ts:58-62`), letting sync client readers race the query.
- impact: workbench/editor/core can disagree on a field's type or an app's state for the same node; fixes must be re-applied per app.
- closes: move field-type/tree assembly into `@nxus/db/server` (or the consolidated node-API of [no-duplicate-concepts.md](no-duplicate-concepts.md)); make React Query the only registry read path.

**Drift mode:** this rule drifts one convenience function at a time — logic added where the edit was cheapest. Detection: review any app diff that branches on domain values (field types, systemId prefixes, supertag semantics); each such branch either moves down a layer or gets a `DRIFT:` block.
