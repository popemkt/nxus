---
id: no-duplicate-concepts
scope: architecture
principle: Minimizing accidental complexity
enforcement: prose
gate: —
---

# No duplicate concepts rule

Invalidated by: implementation decisions about where shared capabilities live.

**One concept, one home.** Every capability (a server API, a theme system, a registry, a comparator) has exactly one canonical implementation; every other consumer reaches it through a **bridge** (import, re-export, thin adapter) — never a **mirror** (copy that evolves independently).

1. Before implementing anything cross-cutting, search for an existing home. If one exists, bridge to it. If it lives in the wrong package, move it and bridge from the old location — do not fork.
2. A second implementation of an existing concept is only acceptable with a recorded `DRIFT:` block naming the consolidation target ([drift.md](drift.md)).
3. Same rule for prose: a concept's normative description lives in one spec file; others link ([placement.md](placement.md)).

## Worked example: the triplicated node API

Node CRUD/search/query currently has **three parallel server-function stacks** over the same two tables:

- editor: `apps/nxus-editor/src/services/outline.server.ts` (create `:298`, update `:431`, delete `:443`, query `:503`, backlinks `:529`) + `search.server.ts`
- workbench: `libs/nxus-workbench/src/server/nodes.server.ts` (update `:57`, create `:80`, delete `:128`) + `query.server.ts`, `search-nodes.server.ts`
- core: a third `searchNodesServerFn` in `apps/nxus-core/src/services/graph/graph.server.ts:568`

Each stack has its own validation, its own result shapes, its own bugs. A "fix node deletion" change is now a three-file hunt, and spec-as-source is impossible: one product claim ("deleting a node soft-deletes it") maps to three drifting implementations. The editor already bridges to workbench for query-building (`query-results.tsx` imports its `QueryBuilder`) — proof the bridge pattern works here.

DRIFT: triplicated node server-fn layer
- canonical: one canonical node-API surface (extracted `@nxus/node-api`, or workbench's `libs/nxus-workbench/src/server/` blessed) that all apps bridge to.
- current: three stacks as cited above; also theme palette/applier copy-pasted into all six apps' `__root.tsx` (e.g. `apps/nxus-recall/src/routes/__root.tsx:7-49`) and the app registry repeated in code + docs (see [generated-registries.md](generated-registries.md)).
- impact: divergent validation/soft-delete/search semantics per app; ~1k duplicated theme lines; every fix ×3 (or ×6).
- closes: extract the canonical node-API package; `ThemeProvider` + palette constant in `@nxus/ui`; generated registry.

**Drift mode:** this rule drifts by copy-paste under deadline. Detection: review flags any new file whose name or exports echo an existing one (`*search*.server.ts`, theme unions, icon maps); each is either converted to a bridge or recorded as `DRIFT:` with a consolidation target.
