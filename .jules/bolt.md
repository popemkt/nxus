## 2025-02-18 - Vitest Environment Issues in Monorepo
**Learning:** `vitest` tests for React components in `nxus-core` fail with "Invalid hook call" due to module resolution issues (likely duplicate React instances) in the pnpm workspace. Standard `vite` aliases didn't resolve it immediately.
**Action:** When adding component tests, be prepared to debug complex workspace resolution or fix the test infrastructure first. For simple optimizations like `memo`, verify via build and visual inspection if tests are blocked.
