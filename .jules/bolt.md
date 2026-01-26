## 2024-05-22 - [Tracked Database File]
**Learning:** `packages/nxus-db/src/data/nxus.db` is tracked in git but modified by `pnpm db:seed`. This causes accidental inclusion of binary artifacts in PRs if not careful.
**Action:** Always check `git status` and restore `packages/nxus-db/src/data/nxus.db` before submitting changes if `db:seed` was run.
