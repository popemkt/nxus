---
id: learnings
scope: docs
principle: Traceability
enforcement: prose
gate: —
guards: record
---

# Learnings rule

Invalidated by: policy decisions about how substrate knowledge is kept.

`learnings/` holds **substrate knowledge**: things we discovered about the tools and infrastructure under nxus, not things we decided about nxus itself.

1. **Substrate vs contract.** A learning is invalidated by the *substrate changing* (Vite fixes a bundling behavior, better-sqlite3 changes its ESM story, Playwright changes webServer semantics). A contract is invalidated by *our decision*. If deleting the text would change what nxus is supposed to do, it is a contract and belongs in `spec/` — not here. Example of a learning: "Vite follows top-level imports at build time regardless of `.server.ts` suffix, so re-exports still bundle `better-sqlite3` into the client" — that fact is the *reason* behind [server-functions.md](server-functions.md), but the rule itself is the contract.
2. **One file per learning**, `learnings/<slug>.md`, dated at the top, indexed in `learnings/README.md`.
3. **Annotate, don't delete.** When a learning is superseded (tool upgraded, workaround obsolete), prepend a dated annotation stating what changed and what supersedes it. The original text stays. History of what we believed — and when we stopped believing it — is the point: it prevents re-deriving dead workarounds and explains fossilized code shaped by the old constraint.
4. A learning MAY cite `spec/` rules it motivates; `spec/` rules SHOULD cite the learnings that motivate them. The normative statement lives only in `spec/`.

**Drift mode:** this file drifts when substrate discoveries are buried in commit messages, code comments, or chat instead of landing here, or when stale learnings are silently deleted. Detection is review-time; remedy is extraction into a dated learning file.
