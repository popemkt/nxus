## 2026-01-25 - [Button Nesting in Links]
**Learning:** Found instances of `<Button>` components nested inside `<Link>` components (from TanStack Router). This creates invalid HTML (`<a><button>...`) and can confuse screen readers.
**Action:** When making a link look like a button, use `buttonVariants` from `@nxus/ui` on the `<Link>` directly instead of wrapping a `<Button>`.
