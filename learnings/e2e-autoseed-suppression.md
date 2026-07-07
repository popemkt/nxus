# A direct-DB test seed can silently starve the e2e demo data

- **Date**: recorded 2026-07-07 (discovered while adding a 4th direct-DB-seeding e2e spec)
- **Substrate**: nxus e2e infra — Playwright parallel workers + `initDatabaseWithBootstrap` auto-seed
- **Symptom**: adding one more spec file that seeds nodes directly into the e2e DB made unrelated, previously-green specs fail — they found an outline with no demo data.

## The discovery

`initDatabaseWithBootstrap` auto-seeds demo data only while the DB contains **zero non-system nodes** (`libs/nxus-db/src/client/master-client.ts:351-362` — `SELECT COUNT(*) FROM nodes WHERE system_id IS NULL`, seed only when 0).

Playwright workers run test files in parallel against one shared e2e DB (`NXUS_DB_PATH`, fresh per run). A spec that seeds via direct DB import (the `seedFormulaStory` / `seedMovePair` pattern) can execute **before the dev server handles its first request**. Its seeded nodes make the count non-zero, so the server's auto-seed is silently skipped — and every spec that assumes the demo outline (items, commands, seeded root nodes) starves.

This is deterministic once worker scheduling puts a direct-DB spec first, which is exactly what adding a 4th seeding spec file did.

## The rule

A direct-DB e2e seed helper MUST NOT touch the database until the demo seed has happened. Current pattern (see `e2e/editor/inline-mentions.spec.ts`): navigate to the app first (forces the server to init + auto-seed), then poll for `item:%` nodes before inserting your own.

Real fix candidates (not implemented): seed the demo data once in Playwright's `globalSetup` instead of lazily on first server request, or key auto-seed on a marker other than "any non-system node exists".

**Takeaway**: an e2e helper that writes directly to the shared e2e DB must first navigate to the app and poll for `item:%` nodes — otherwise it races the lazy demo auto-seed and starves every demo-dependent spec.
