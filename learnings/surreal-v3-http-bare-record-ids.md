# SurrealDB v3 over HTTP returns bare record ids from transaction RETURN

**Date:** 2026-07-11
**Context:** intermittent 400 `Parse error` / `Expected a valid RecordID value`
in graph-mode e2e, discovered during the reliability sprint.

## Symptom

Graph-mode app servers intermittently logged:

```
HttpConnectionError: HTTP connection failed: {"code":400, ..., "information":"Parse error"}
```

while all e2e tests passed — the failures were on fire-and-forget optimistic
sync calls (`use-outline-sync.ts` logs `[sync] Failed to update content` and
continues).

## Cause

Against a SurrealDB v3 **server** (HTTP RPC), a transaction ending in
`RETURN $newNode[0].id` yields the created record's id as a **bare** string
(`019f517a-c266-...`), without the `node:` table prefix. The embedded engine
returns a `RecordId` object whose `.toString()` gives `node:<id>`, so the bug
only exists in server mode. `SurrealBackend.createNode` stored the bare value
as the public node id; the editor adopted it for its optimistic node, and every
later call built `new StringRecordId("<bare-uuid>")` — which the server rejects
with 400 `Expected a valid RecordID value` / `Parse error`.

## Rule

- Never trust the shape of ids coming back from a Surreal HTTP transaction
  RETURN: normalize with `normalizeSurrealRecordId(table, value)`
  (`libs/nxus-db/src/services/backends/surreal-backend.ts`) before exposing
  them as public ids.
- Node-id parameters entering `StringRecordId` go through `nodeRecordId()`,
  which canonicalizes bare ids to `node:<id>` — those parameters are node ids
  by contract, so prefixing is canonicalization, not guessing.
- Unit guard: `normalizeSurrealRecordId` tests in `surreal-backend.test.ts`;
  end-to-end guard: graph e2e log must have zero
  `HttpConnectionError|Parse error|Expected a valid RecordID` hits.
