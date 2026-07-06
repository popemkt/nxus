# nxus-workbench — node explorer

Invalidated by: product decisions about how the node graph is explored (read-mostly lens).

Workbench (port 3002, base `/workbench`) is the **exploration lens** over the universal node graph defined in [../data-model.md](../data-model.md): browse, inspect, visualize, and query nodes. It is read-mostly by intent — authoring belongs to the editor ([../editor.md](../editor.md)).

## Shape

- `apps/nxus-workbench` is a 5-file shell whose entire body is `<NodeWorkbenchRoute />` (`apps/nxus-workbench/src/routes/index.tsx:9`). All functionality lives in `libs/nxus-workbench` (109 files), composed by `NodeWorkbenchRoute` (`libs/nxus-workbench/src/route.tsx:77`): view-mode switch (list/graph), search, single selected-node source of truth, supertag filter.

## Surfaces (all MUST-haves of the exploration lens)

1. **Node browser** (`components/node-browser/`) — searchable, supertag-filterable node list; selecting a node drives every other panel.
2. **Node inspector** (`components/node-inspector/`) — raw view of the selected node: content, systemId, properties, supertags, backlinks. The inspector shows the node *as stored* (property keys, JSON values) — it is the debugging surface for the data model.
3. **Supertag sidebar** (`components/supertag-sidebar/`) — schema browsing: supertags and their field definitions.
4. **Graph view** (`features/graph/`, ~45 files) — 2D (xyflow) and 3D (three.js) renderings; local-graph mode focuses on the selected node (`route.tsx:90-91` syncs focus via graph store).
5. **Query builder** (`features/query-builder/`, ~18 files) — visual construction of `QueryDefinition`s + results panel. This component is the shared query-authoring UI: the editor already imports it (`apps/nxus-editor/src/components/outline/query-results.tsx:5`).

## Server layer

- `libs/nxus-workbench/src/server/index.ts` exports TanStack server fns wrapping `@nxus/db/server` (node CRUD, search, query evaluation, backlinks), following the dynamic-import rule in [../../tech/architecture.md](../../tech/architecture.md).

DRIFT: node server-fn layer is triplicated across apps
- canonical: exactly one server-fn surface for node CRUD/search/query/backlinks; all lenses consume it.
- current: three parallel stacks — workbench `server/{nodes,query,search-nodes}.server.ts`, editor `apps/nxus-editor/src/services/outline.server.ts` (create :298, update :431, delete :443, query :503, backlinks :529) + `search.server.ts:9`, and a third `searchNodes` in `apps/nxus-core/src/services/graph/graph.server.ts:568`.
- impact: behavior drift between lenses (e.g. soft-delete filtering, field-type inference) with no single spec-to-code mapping.
- closes: the consolidation decision in [../../tech/architecture.md](../../tech/architecture.md) — bless one canonical node API (workbench's `server/` or an extracted `@nxus/node-api`); longer-term, merge the editor and workbench apps (workbench-app is already a shell, editor already imports the lib).

DRIFT: dead exploration code retained
- canonical: the lib contains only reachable code.
- current: `server/reactive.server.ts` (446 lines, zero importers — core reimplemented it as `inbox-reactive.server.ts`) and `features/graph/LightweightGraphView.tsx` + `provider/use-lightweight-graph.ts` (~550 lines, deliberately un-exported at `features/graph/index.ts:31-35`).
- impact: misleads readers/agents about the real surface; inflates the lib.
- closes: delete both.

## Overlap with editor (product position)

Editor and workbench are legitimately different UIs over the same graph — editing vs exploring. The product commitment is: **UIs may differ; data access MUST NOT**. Any capability both lenses need (search, query eval, backlinks) is defined once, in the canonical node API above.
