# Report: Fix OR Pattern with nodeId

## Summary

Fixed 14 instances of OR-pattern misuse with node identifiers across 7 files. One critical correctness fix in signature computation, and 13 UI/display fixes replacing `||` with `??` (nullish coalescing).

## Changes Made

### Category A: Critical Logic Fix

| File | Line | Before | After | Rationale |
|------|------|--------|-------|-----------|
| `libs/nxus-db/src/reactive/query-subscription.service.ts` | 213 | `s.systemId \|\| s.id` | `s.id` | Signatures must use stable, always-present UUID — mixing systemId/id caused inconsistent change detection |

### Category B: UI Display Fixes (`||` to `??`)

| File | Lines | Pattern |
|------|-------|---------|
| `libs/nxus-workbench/src/features/query-builder/filters/supertag-filter.tsx` | 118, 119, 123 | React key/value and display name fallbacks |
| `libs/nxus-workbench/src/server/graph.server.ts` | 234, 242, 452 | Graph node/supertag label fallbacks |
| `libs/nxus-workbench/src/features/graph/provider/use-graph-data.ts` | 179 | Graph node label fallback |
| `libs/nxus-workbench/src/components/node-inspector/NodeInspector.tsx` | 211, 213, 370, 406, 551, 588 | Breadcrumb titles, child/backlink display, linked node display names |
| `apps/nxus-core/src/components/features/debug/node-inspector.tsx` | 235 | Debug backlink display |

### Category C: Example Code Fix

| File | Line | Pattern |
|------|------|---------|
| `libs/nxus-db/examples/mini-app-example.ts` | 49 | Console log identifier fallback |

### Intentionally Unchanged

- `computed-field.service.ts:193` — Intentional dual-key matching (`fieldNodeId === fieldId || fieldSystemId === fieldId`)
- `query-evaluator.service.ts:834` and `surreal-backend.ts:1524` — Intentional sort field matching
- `automation.test.ts:63` and `integration.test.ts:54` — Test helpers mirroring production dual-key patterns

## Verification

- `pnpm test:libs` — All 4 projects passed (462+ tests across 16 test files)
  - `@nxus/db`: All tests passed (including reactive/query-subscription tests)
  - `@nxus/workbench`: 144 tests passed (6 files)
  - `@nxus/calendar`: 209 tests passed (5 files)
  - `@nxus/ui`: 9 tests passed (1 file)
