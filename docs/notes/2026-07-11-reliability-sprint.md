# Reliability sprint — 2026-07-11 (late evening, follow-up to the Surreal parity sprint)

Goal: make the app reliable for humans AND agents — chase every swallowed error visible in passing runs, give the agent surface adversarial coverage, and kill the races that corrupt data silently.

## Shipped (all on `feature/vk/tana-gap-136`)

| Commit | What |
|---|---|
| `e0bd217` | **R1a: seed fail-fast** — both seeders skipped invalid inputs with exit 0; the `evidence` app manifest had been silently missing from every seeded DB (67→68 items). Seeds now throw listing all offenders. Bonus: 2 test files (23 tests) existed but never ran — vitest include glob missed `scripts/`; resurrected |
| `df1ec57` | **R1b: Surreal v3 HTTP bare record ids** — v3 server returns the created id WITHOUT the `node:` prefix from transaction RETURN; the editor round-tripped the bare id and every later call 400'd (`Expected a valid RecordID value`), swallowed by fire-and-forget sync. Normalized at the boundary; graph e2e webserver logs now zero 400s (previously every run) |
| `cb06c79` | **R2: agent-surface edge-tests** — 85 new adversarial tests over the 11 actions through MCP. Six defects fixed: non-strict input schemas (typo'd keys silently ignored), unverified `supertag:*` refs, generic errors. Error contract recorded in spec/tech/actions.md |
| `8ab4a6a` | **R4: temp-ID barrier (INV-7)** — nothing deferred mutations racing an optimistic create; a child created under a temp parent persisted with a nonexistent `ownerId` (wrong tree on reload). pendingCreates/idRemaps registry; every server-call path resolves ids first. Also closes INV-12 (Zod-parsed create results) and the 100-line create-block duplication |
| (R5) | **Bloom levels leaked node UUIDs** — `resolveBloomsNodeId` never handled the UUID form that `getBloomsNodeId` writes; concepts returned raw node ids as `bloomsLevel` (rejected by every downstream validator), cards silently read `'remember'` forever — Bloom progression was broken in product, invisible because errors were swallowed. Plus e2e mock sent `questionType: 'application'` (not in enum) so the "full review flow" test passed while its review submission was rejected |

## R3: vitest parallel-pool pollution — NOT REPRODUCIBLE

The tracked "libs/nxus-db only reliable single-fork" item is stale: 6 consecutive default-pool runs, 720 passed each, ~6s. Cured somewhere in this week's backend/test rewrites. Perf budgets stay env-gated single-fork by design (measurement stability).

## Findings worth remembering

- Every wart chased tonight was a **passing test hiding a real defect**: green seed with missing data, green graph e2e throwing 400s every run, green review-flow test whose submission was rejected, green product flow with Bloom progression frozen at 'remember'. "Tests pass" ≠ "nothing is wrong" when errors are swallowed — grep webserver logs for error signatures as part of the gate.
- The `rawBlooms as BloomsLevel` cast was the exact pattern the TS rules ban — it laundered a node UUID into an enum-typed field and shipped it to every consumer.
- e2e mocks are data too: an invalid fixture (`questionType: 'application'`) silently disabled the assertion value of the whole review-flow test.
- Codex lane wedged once (zero output 20 min) — killed and relaunched clean. Liveness-check lanes early; don't wait on a silent one.

## Honest residue (tracked)

- Task #4: per-query convergence invalidation (deprioritized).
- INV-7 ordering clause: per-node issue-order write queue not implemented for any id class (temp-id barrier itself is closed; resolved-id requests race on the network as they always have).
- 17 graph-mode e2e skips (unchanged from parity sprint), reactive layer SQLite-hard-wired (last persistence.md §5 DRIFT).
- Night-report features not started tonight: command nodes, REST adapter over the action registry, MCP-Apps ui:// proof.
