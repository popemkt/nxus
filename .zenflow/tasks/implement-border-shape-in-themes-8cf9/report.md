# Implementation Report: Border Shape in Themes

## What Was Implemented

Added the CSS `corner-shape` property to the theme system as a progressive enhancement. This is a pure CSS approach with no new dependencies.

### Changes Made

**`apps/nxus-core/src/styles.css`**:
- Added `--corner-shape: round;` CSS custom property to `:root` (default value)
- Added `corner-shape: var(--corner-shape);` to the global `*` rule in `@layer base` so all elements inherit the theme's corner shape
- Added `corner-shape: var(--corner-shape);` to all four `.radius-*` utility classes (`.radius-card`, `.radius-panel`, `.radius-button`, `.radius-base`)

**Theme files with `--corner-shape: squircle`** (smooth iOS-style corners):
- `anime.css` (both light and dark variants)
- `neon.css` (light variant, inherits to dark)
- `vaporwave.css` (light variant, inherits to dark)
- `synthwave.css` (light variant, inherits to dark)
- `catppuccin.css` (light variant, inherits to dark)
- `rosepine.css` (light variant, inherits to dark)
- `everforest.css` (light variant, inherits to dark)

**Theme files with `--corner-shape: bevel`** (diagonal chamfered corners):
- `brutalism.css` (both light and dark variants)
- `celshaded.css` (both light and dark variants)
- `retro.css` (both light and dark variants)
- `sketch.css` (both light and dark variants)

**Themes unchanged** (inherit default `round`):
- tokyonight, dracula, nord, github, gruvbox, kanagawa, solarized

### Corner Shape Rationale

| Shape | Themes | Reasoning |
|---|---|---|
| `squircle` | anime, neon, vaporwave, synthwave, catppuccin, rosepine, everforest | Soft, modern, organic aesthetics benefit from smooth superellipse curves |
| `bevel` | brutalism, celshaded, retro, sketch | Angular, industrial, hand-drawn aesthetics suit diagonal chamfered edges |
| `round` | tokyonight, dracula, nord, github, gruvbox, kanagawa, solarized | Clean, standard, professional themes work well with default circular corners |

## How the Solution Was Tested

1. **Build verification**: Ran `npx nx build @nxus/core-app` successfully with no CSS compilation errors
2. **Progressive enhancement**: The `corner-shape` property degrades gracefully -- browsers that don't support it simply render standard `border-radius` corners
3. **No new dependencies**: Pure CSS custom property approach, consistent with the existing theme system pattern

## Challenges Encountered

1. **Browser support**: `corner-shape` is only supported in Chrome 139+ / Edge 139+ as of Feb 2026. Firefox and Safari don't support it yet. This is acceptable as a progressive enhancement.
2. **Zero-radius themes**: Brutalism and celshaded have `--radius: 0px` for all corners, so `corner-shape: bevel` won't have a visible effect (the property requires non-zero `border-radius`). The variable is set for correctness and future-proofing if radius values are ever adjusted.
3. **CSS variable cascading**: For themes that re-declare shape-related variables (like `--border-width`, `--radius`) in both light and dark variants, `--corner-shape` was added to both variants for consistency. For themes where only colors change between light/dark, it was added only to the light variant since it cascades naturally.
