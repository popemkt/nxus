## 2026-01-27 - Keyboard Visibility for Hover Interactions
**Learning:** Elements hidden with `opacity-0` and revealed on hover (`group-hover`) must also use `focus-within:opacity-100` or `focus:opacity-100` to ensure keyboard accessibility.
**Action:** When using `group-hover:opacity-100` to reveal controls, always pair it with `group-focus:opacity-100` (or `focus-within`) so keyboard users can perceive the interactive element when they tab to it.
