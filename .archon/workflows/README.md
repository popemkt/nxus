# Archon workflows for nxus

Archon (github.com/coleam00/archon) workflow definitions. **These are the sanctioned entrypoints for actions on this repo** — see "Enforcement" below for what that does and does not mean today.

## Workflows

| Workflow | Slash trigger | Kind | When to use |
|---|---|---|---|
| [`feature-intake.yaml`](feature-intake.yaml) | `/feature` | Interactive, mutating | A non-trivial change: new behavior, a data-model change, an invariant, an architectural boundary. Interviews you, edits spec first, implements, gates on typecheck/lint/test, reconciles spec vs shipped code. Ends with a commit-message suggestion — it does not commit. |
| [`bug-fix.yaml`](bug-fix.yaml) | `/bugfix` | Non-interactive, mutating | You already know the bug. Restates it, locates the suspect code (codebase-memory graph first), writes a failing test where feasible, fixes it, runs `pnpm typecheck && pnpm lint && pnpm test`, checks whether the fix contradicts a spec claim (amends spec or closes a `DRIFT:` block if so). Ends with a commit-message suggestion — it does not commit. |
| [`spec-drift-check.yaml`](spec-drift-check.yaml) | `/drift-check` | Non-interactive, read-only | Periodic health check of `spec/`. Enumerates every `DRIFT:` block, samples normative claims with `path:line` citations, verifies both against current code. Reports stale citations, drift that's actually already closed in code, and new undocumented drift. Never edits anything, never gates a build — it's advisory input for a human or for `feature-intake`/`bug-fix` to act on next. |
| [`tana-gap.yaml`](tana-gap.yaml) | `/tana-gap` | Non-interactive, read-only | Turns Tana-vs-nxus-editor product research into a single prioritized, spec-shaped proposal (draft spec edit + task breakdown, as text) for one feature. Reads `spec/product/editor.md` + `spec/product/data-model.md`, and an optional session-scratch recon file if present. Never writes a file — hand its output to `feature-intake.yaml` to actually build the winning candidate. |

Use `feature-intake` when the answer to "does this change observable behavior, the data model, an invariant, or a boundary?" is yes or unclear. Use `bug-fix` when it's clearly a regression against already-documented behavior. Use `spec-drift-check` and `tana-gap` any time, as often as you like — they're read-only.

## How to run

```
archon workflow run <name> "<message>" --no-worktree
```

Run this **from a fresh shell, outside any Claude Code session** — not from a terminal spawned by, or nested inside, a Claude Code / `claude` CLI process.

Two distinct Archon issues motivate this, and motivate two separate design choices already baked into these workflows:

- **Archon #1030** — Archon's `claude` provider spawns a Claude SDK child process; if the parent shell is itself inside a Claude Code session, that nested spawn can hang. All four workflows here set `provider: codex` specifically so they *can* be launched from inside a CC session without hitting this — codex is a different binary, not a nested Claude Code.
- **Archon #1067** — independent of provider, running `archon workflow run` itself from *inside* a Claude Code session's shell has been observed to hang the CLI invocation (not the workflow's own agent). This is a property of how Archon's CLI attaches to its parent shell, not of which provider a workflow declares. The safe pattern is: exit or open a new terminal, confirm you are not inside a `claude` session, then run the `archon workflow run` command there.

`--no-worktree` is included explicitly above even though every workflow here also omits its YAML `isolation:` block — belt and suspenders, since the omission's exact default (whether Archon still creates an implicit worktree without `--branch`) isn't verified against this Archon build. See each workflow's own header comment for why worktree isolation doesn't fit this repo at all: `pnpm dev` binds fixed ports 3000-3005 and `predev` force-kills whatever's already on them (`spec/tech/toolchain.md` §1), so two checkouts can't run dev/e2e servers side by side regardless of worktree mechanics, and a fresh worktree starts without `node_modules` or the seeded SQLite db that `pnpm test`/`pnpm e2e` need on disk.

```
archon workflow list          # discover workflows (safe, no side effects)
archon validate workflows      # parse-check all workflow YAML (safe, no side effects)
```

`archon workflow list` also surfaces ~20 bundled Archon defaults (e.g. `archon-assist`, `archon-architect`) alongside the four here — that's expected; they ship with the CLI, not with this repo.

## Enforcement — read this honestly

These four workflows are the **sanctioned** way to make changes to nxus: they encode the spec-first-change, drift, testing, and dev-entrypoints rules from `spec/rules/` so that following them means following those rules by construction.

**Nothing technically stops a human or an agent from editing files directly, bypassing all of this.** There is no git hook, no CI check, and no repo-level lock that requires a change to have gone through `feature-intake` or `bug-fix`. The only two hard gates that exist today are the ones in `.github/workflows/ci.yml` (lint, unit tests, e2e — see `spec/tech/toolchain.md` §7), and those gate the *result* of a change, not the *process* that produced it.

Promoting "changes MUST go through an Archon workflow" from convention to an enforced gate is a workflow/policy decision — which means, per the placement rule (`spec/rules/placement.md`), its home is a new file in `spec/rules/` (indexed in `spec/rules/README.md` alongside the existing rules' `enforcement: prose|lint|ci` column). That rule does not exist yet. Until it does, treat these workflows the way `spec/rules/dev-entrypoints.md` treats `pnpm` scripts: the one documented, discoverable path — not a technically-enforced one.
