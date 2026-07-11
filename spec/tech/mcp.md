# MCP

Invalidated by: implementation decisions about agent access to the node graph.

Nxus exposes its personal knowledge graph to agents through MCP, not bare HTTP. The MCP surface is a tool set over the canonical node access path: tools MUST delegate to `nodeFacade` (`@nxus/db/server`) or to facade-backed `@nxus/node-api/server` operations, and MUST NOT open SQLite directly or import `node.service` internals.

## Tool Surface

| tool | input | delegates to |
|---|---|---|
| `search_nodes` | `query`: `QueryDefinitionSchema` JSON from `@nxus/db`; optional `limit` | `nodeFacade.evaluateQuery` |
| `read_node` | `nodeId` | `nodeFacade.assembleNode`; one-level children via `nodeFacade.evaluateQuery` relation filter |
| `create_node` | `content`; optional `parentId`; optional `supertag` systemId/name; optional `fields` map | `nodeFacade.createNode`; `nodeFacade.addNodeSupertag`; `nodeFacade.setProperty` |
| `set_field` | `nodeId`; `fieldId` systemId such as `field:status`; `value` | `nodeFacade.setProperty` |
| `tag_node` | `nodeId`; `supertag` systemId | `nodeFacade.addNodeSupertag` |
| `untag_node` | `nodeId`; `supertag` systemId | `nodeFacade.removeNodeSupertag` |
| `list_tags` | empty object | `nodeFacade.getNodesBySupertagWithInheritance(SYSTEM_SUPERTAGS.SUPERTAG)` |
| `get_tag_schema` | supertag `tag` id or systemId | `nodeFacade.getSupertagFieldDefinitions`; inherited fields via `nodeFacade.getAncestorSupertags` |
| `import_tif` | Tana Intermediate File JSON string | `@nxus/node-api/server.importTif` -> `importTanaIntermediateFile` |
| `export_subtree` | optional `rootNodeId` | `@nxus/node-api/server.exportSubtree` -> `exportSubtreeToTif` |
| `get_day_node` | `date` as `YYYY-MM-DD` | `@nxus/node-api/server.getOrCreateDayNode` |

Tool outputs are structured JSON objects in MCP `structuredContent`. Compact node summaries contain `id`, `content`, `supertags`, and `fields`; full reads include the assembled node, one level of ordered children, field values, and supertag names.

## Transport

The MCP endpoint is mounted as Streamable HTTP at `/editor/mcp` inside the `nxus-editor` Vite dev server. The editor process is the host because MCP writes should be visible to the process-local reactive layer that powers the editor. A standalone stdio MCP process would mutate the same persistent database, but the already-running app process would not observe those writes through in-process live-query/event-bus state.

The mount is a Vite middleware that delegates HTTP `GET`, `POST`, and `DELETE` requests to the MCP SDK's `StreamableHTTPServerTransport`. The server factory is exported separately as `createNxusMcpServer()` so a future stdio binary can reuse the same tool registration without duplicating behavior.

## Semantics

MCP tools validate inputs with Zod before executing. Operation failures are returned as MCP tool errors (`isError: true`) instead of crashing the server or transport.

Read paths exclude soft-deleted nodes. If a direct read target or child is soft-deleted, it is treated as absent. `get_day_node` is the only v1 tool that may restore a soft-deleted node, because daily-note identity is deterministic by `item:day-YYYY-MM-DD` and revisiting the day must resurrect the canonical node instead of creating a duplicate.

Future stdio support MUST call `createNxusMcpServer()` and MUST document the reactive limitation: stdio is suitable for offline/batch operation unless it is hosted in the same process as the observing app.
