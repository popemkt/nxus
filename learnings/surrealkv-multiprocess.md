# SurrealKV embedded files corrupt under multi-process access

**Date:** 2026-07-11
**Context:** first honest `ARCHITECTURE_TYPE=graph` e2e run after the facade parity work.

## Symptom

Intermittent, non-deterministic failures across app servers in graph mode:

```
[GraphDB] Failed to connect: Versioned error: A deserialization error occured:
Invalid revision `114` for type `DefineTableStatement`
```

Once one process hits this, the surrealkv file's schema definitions are corrupt
for everyone — subsequent connects from any process fail the same way. The
corruption is timing-dependent: a full e2e run can pass 57/74 with sporadic
failures, then a later run corrupts the file during boot.

Secondary symptom: raw throughput collapses. The full e2e suite took **31.6
min** with six app servers sharing one embedded file vs **1.4 min** against a
SurrealDB server process (node-mode SQLite baseline: 1.6 min).

## Cause

`surrealkv://` (via `@surrealdb/node`) is an in-process storage engine with no
cross-process coordination. The nxus dev topology boots six TanStack Start
apps as separate Node processes; in graph mode each one runs
`initGraphDatabase()` against the same file path (default or `SURREAL_PATH`).
Concurrent writers interleave at the storage layer and corrupt the versioned
records. This was invisible before 2026-07-11 because graph mode silently fell
back to SQLite for the paths that mattered (the drift the parity work closed).

## Rule

- Embedded surrealkv: ONE process per file, ever. Fine for unit tests
  (in-memory or per-test temp files), the seed script run in isolation, and
  single-process tools like the migration CLI.
- Any multi-process topology (dev servers, e2e, CI graph leg) MUST use a
  SurrealDB server: `SURREAL_EMBEDDED=false` + `SURREAL_URL`, server started
  with the `memory` engine for throwaway runs. Pin the server major to the
  SDK's dialect — since the 2026-07-11 v3 upgrade that is server 3.x
  (`surrealdb@^2.0.4` + `@surrealdb/node@^3.0.3`); v3 requires
  `DEFINE FIELD ... TYPE ... FLEXIBLE` ordering (2.x accepted
  `FLEXIBLE TYPE ...`).
- v3 embedded caveat: `@surrealdb/node@3.0.3` HANGS on same-process
  close→reopen of a surrealkv file. Process-restart reopen is fine (that's
  the app-boot invariant, guarded by `surreal-reopen.test.ts` via child
  processes). Never close-and-reopen an embedded file handle inside one
  process.
- Local binaries: `~/.surrealdb/surreal3` (v3.2.1, the repo's dialect) and
  `~/.surrealdb/surreal` (v2.3.7, kept for pre-upgrade branches). Installer:
  `curl -sSf https://install.surrealdb.com | sh -s -- --version v3.2.1`.
- CI graph leg does exactly this (`.github/workflows/ci.yml`, "Start SurrealDB
  server" step).
