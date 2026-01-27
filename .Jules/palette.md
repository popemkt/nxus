## 2024-02-18 - Hover-Only Reveal Patterns
**Learning:** Elements hidden with `opacity-0` and revealed on hover (`group-hover`) are inaccessible to keyboard users unless they also respond to focus.
**Action:** Always add `group-focus-within:opacity-100` (or `focus-visible:opacity-100`) alongside `group-hover:opacity-100` for overlay elements.
