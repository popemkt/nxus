# Plan: Embedded File-Based SurrealDB (Committable like SQLite)

## Goal
Make SurrealDB use embedded file storage (`surrealkv://`) so the database file can be committed to the repo, just like `nxus.db` is today. On clone, you get seeded data without needing a running server.

## Changes

### 1. Update `graph-client.ts` — Add embedded file mode

Add a third connection mode alongside remote and in-memory:

```
Remote:   http://127.0.0.1:8000/rpc  (needs running server)
Embedded: surrealkv://path/to/surreal.db  (file on disk, no server)
Memory:   mem://  (tests only)
```

**How it works:**
- New env var `SURREAL_EMBEDDED=true` (default `true`) selects embedded mode
- Set `SURREAL_EMBEDDED=false` to use remote server mode instead
- Embedded path defaults to `packages/nxus-db/src/data/surreal.db` (same dir as `nxus.db`)
- `initGraphDatabase()` detects the mode and uses `createNodeEngines()` + `surrealkv://` for embedded
- No auth needed for embedded mode (unlike remote which requires signin)

**New function:**
- `createEmbeddedFileGraphDatabase(path, opts)` — like `createEmbeddedGraphDatabase` but with `surrealkv://` instead of `mem://`

### 2. Update `db-seed.ts` — Add graph seed support

The seed script currently exits with "not yet supported" for graph mode. Add a `seed-graph.ts` script that:
- Connects to embedded SurrealDB file
- Reads the same `manifest.json` files used by `seed-nodes.ts`
- Creates nodes, supertags, relations in SurrealDB
- Reuses the same data source (apps/*/manifest.json, tags.json, inbox.json)

### 3. Create `seed-graph.ts` — Graph seeder

New script that mirrors `seed-nodes.ts` but writes to SurrealDB instead of SQLite:
- Bootstrap system supertags (already done by schema init, but seed additional data)
- For each manifest: create a node with props, assign supertag, create command nodes
- Seed tags as nodes with #Tag supertag
- Resolve dependencies as `dependency_of` relations
- Seed inbox items

### 4. Update `.gitignore` — Ignore SurrealKV temp files

SurrealKV creates a directory structure (not a single file). Add ignore rules for temp/lock files while tracking the main data.

### 5. Seed the database and commit the file

Run `ARCHITECTURE_TYPE=graph pnpm db:seed` to populate the embedded SurrealDB, then commit the resulting file(s).

### 6. Run tests to verify no regressions

## Order of Implementation
1. `graph-client.ts` changes (embedded file mode)
2. `seed-graph.ts` (graph seeder script)
3. `db-seed.ts` update (wire in graph seeder)
4. `.gitignore` updates
5. Seed + verify + test
