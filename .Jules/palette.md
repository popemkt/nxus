## 2025-02-23 - [Hidden Actions Visibility]
**Learning:** Interactive elements hidden with `opacity-0` and revealed on `group-hover` are inaccessible to keyboard users unless they also handle focus visibility.
**Action:** Always pair `group-hover:opacity-100` with `focus-within:opacity-100` (or `focus:opacity-100`) to ensure keyboard users can see what they are focusing on.
