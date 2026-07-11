# Actions

Invalidated by: implementation decisions about agent-accessible capability registration and adapter boundaries.

Nxus capabilities exposed outside app UI live in a plain typed action registry. The registry is the single source of truth for capability names, descriptions, input schemas, output schemas, and handlers; exposure surfaces are thin adapters over that registry.

## Contract

`defineAction<TIn, TOut>({ name, description, input, output, handler })` declares one capability:

| field | contract |
|---|---|
| `name` | Stable machine name used by adapters. |
| `description` | Human-readable capability description surfaced by adapters. |
| `input` | Zod schema for incoming JSON-like input. |
| `output` | Zod schema for the returned JSON-like object. |
| `handler` | Async implementation that receives parsed input and returns the candidate output. |

The registry boundary MUST parse input before calling the implementation handler and MUST parse the handler result before returning it. Input or output schema violations throw errors; adapters MAY translate thrown errors into their protocol's error envelope, but they MUST NOT silently coerce, drop, or default invalid data.

Error contract (2026-07-11, guarded by `libs/nxus-mcp/src/edge-cases.test.ts` and `libs/nxus-actions/src/edge-cases.test.ts`):
- Input schemas are `.strict()` — unknown keys are rejected, never ignored; required string refs reject empty strings.
- Reference failures name the reference: `Node not found: <id>`, `Supertag not found: <id>` — an agent must be able to tell *which* input was wrong from the message alone.
- `tag_node`/`untag_node` verify a `supertag:*` system id exists before writing; `export_subtree` verifies `rootNodeId`; `import_tif` rejects malformed JSON (`Invalid TIF JSON: …`) and unsupported versions (`Unsupported TIF version: …`) before delegating.
- Through MCP, every handler failure surfaces as `isError: true` with non-empty text; no action may swallow an exception into a success envelope.

The registry package MUST NOT depend on an exposure framework. It may depend on domain libraries such as `@nxus/db` and `@nxus/node-api`; adapters depend on the registry, not the other way around. New agent/API capabilities land as actions first; MCP, REST, or agent-native surfaces adapt the registry.

Current materialization: `libs/nxus-actions/src/define-action.ts`, `libs/nxus-actions/src/registry.ts`, and one action module under `libs/nxus-actions/src/actions/` per capability.

## Current Actions

| action | input | output | delegates to |
|---|---|---|---|
| `search_nodes` | `query`: `QueryDefinitionSchema`; optional `limit` | compact nodes, `totalCount`, ISO `evaluatedAt` | `nodeFacade.evaluateQuery` |
| `read_node` | `nodeId` | assembled node plus ordered one-level compact children | `nodeFacade.assembleNode`; child relation query |
| `create_node` | `content`; optional `parentId`; optional `supertag`; optional `fields` map keyed by `field:*` system IDs | `nodeId` plus compact node | `nodeFacade.createNode`; optional supertag/field writes |
| `set_field` | `nodeId`; `fieldId` as `field:*`; `value` | compact node | `nodeFacade.setProperty` |
| `tag_node` | `nodeId`; `supertag` systemId/name | `added` plus compact node | `nodeFacade.addNodeSupertag` |
| `untag_node` | `nodeId`; `supertag` systemId/name | `removed` plus compact node | `nodeFacade.removeNodeSupertag` |
| `list_tags` | empty object | supertag definition summaries | `nodeFacade.getNodesBySupertagWithInheritance` |
| `get_tag_schema` | `tag` id/systemId/name | tag summary plus declared/inherited field definitions | `nodeFacade.getSupertagFieldDefinitions`; `getAncestorSupertags` |
| `import_tif` | Tana Intermediate File JSON string | import summary | `@nxus/node-api/server.importTif` |
| `export_subtree` | optional `rootNodeId` | TIF JSON object | `@nxus/node-api/server.exportSubtree` |
| `get_day_node` | `date` as `YYYY-MM-DD` | `{ success: true, nodeId, created }` | `@nxus/node-api/server.getOrCreateDayNode` |

## Adapters

MCP is the first adapter. `@nxus/mcp` iterates `nxusActions`, registers each action as an MCP tool, passes the action input schema through the MCP SDK's Zod support, calls `action.handler`, and serializes the action output into MCP `structuredContent` plus the text JSON body used by the original MCP implementation.

Future adapters (agent-native, etc.) MUST consume the same `nxusActions` registry. They MUST NOT re-declare capability names, schemas, or behavior in parallel.

### REST adapter (2026-07-11)

`@nxus/rest` (`libs/nxus-rest`) is the registry-driven HTTP adapter. Adapter code MUST NOT declare action-specific routes, schemas, or handlers — a newly registered action appears in REST with zero adapter edits. The core is framework-agnostic (`{method, path, body}` → result) with a Fetch-style `Request → Response` handler for host mounting. Responses everywhere use the repo's server-fn envelope `{ success: true, data } | { success: false, error }`. Input JSON schemas come from Zod v4 native `toJSONSchema()` (no conversion dependency).

Behavior clauses (each coded clause is guarded by a same-code test title in `libs/nxus-rest/src/index.test.ts`):

- **REST-B1** — Given the registry, when `GET /actions`, then every registered action is returned with machine `name`, `description`, and input JSON schema.
- **REST-B2** — Given a registered action, when `POST /actions/:actionId` with a valid JSON body, then the body dispatches through the registry and returns `200` with `{ success: true, data }`.
- **REST-B3** — Given a malformed JSON body or an input-schema failure (including `.strict()` unknown keys), when dispatched, then the response is `400` with `{ success: false, error }`.
- **REST-B4** — Given an unknown action, unroutable path, or malformed percent-encoding in the action id, when dispatched, then the response is `404` — never an unhandled exception.
- **REST-B5** — Given an execution failure, when the error is a distinguishable missing reference (`Node not found: …`, `Supertag not found: …`), then `404`; otherwise `422`.
- **REST-B6** — Given an action path, when the method is not POST, then `405`.

**Unmounted** as of 2026-07-11 — the gateway is a static proxy with no sanctioned API surface; choosing a host (and its authn/authz, which are host concerns, not registry concerns) is open.

## fastmcp-ts Deferral

`fastmcp-ts` is deferred for now. As of 2026-07-11 it is v0.1.0 and unlicensed, so adopting it would add framework risk to the capability source of truth. The current adapter remains on the official MCP TypeScript SDK while the registry itself stays framework-free. Revisit this decision for MCP-Apps or after the package has mature licensing and stability signals.
