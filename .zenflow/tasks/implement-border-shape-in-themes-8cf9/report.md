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

### New Themes Added (showcasing remaining corner-shape values)

Three new themes were created to use the remaining `corner-shape` values (`scoop`, `notch`, `square`) that weren't covered by the existing themes:

**`gothic.css`** -- `--corner-shape: scoop` (concave curved corners):
- Dark cathedral aesthetic with deep purples and crimsons
- Concave scooped corners evoke arched windows and ornate stonework
- Custom radii (10px/18px/24px/12px) to make the scoop shape visible
- Icon: CrownIcon, Color: #8b1a4a

**`cyberpunk.css`** -- `--corner-shape: notch` (90-degree concave square corners):
- High-tech HUD aesthetic with electric yellows and hot magentas
- Notched corners look like sci-fi interface panels and tech displays
- Custom radii (6px/10px/14px/8px) for visible notch effect
- Icon: CircuitryIcon, Color: #f0e020

**`bauhaus.css`** -- `--corner-shape: square` (sharp square corners that override radius):
- Geometric modernist design inspired by the Bauhaus school
- Primary colors (red, blue, yellow), clean lines
- `square` value overrides `border-radius` entirely for pure geometric forms
- Icon: BoundingBoxIcon, Color: #cc3333

**Files also modified to register new themes:**
- `apps/nxus-core/src/stores/theme.store.ts` -- Added `gothic`, `cyberpunk`, `bauhaus` to `ThemePalette` type
- `apps/nxus-core/src/config/theme-options.ts` -- Added theme option entries with icons and preview colors
- `apps/nxus-core/src/styles/theme-imports.css` -- Added CSS imports for all three theme files

### Corner Shape Rationale (Complete)

| Shape | Themes | Reasoning |
|---|---|---|
| `round` | default, tokyonight, dracula, nord, github, gruvbox, kanagawa, solarized | Clean, standard, professional themes -- default circular corners |
| `squircle` | anime, neon, vaporwave, synthwave, catppuccin, rosepine, everforest | Soft, modern, organic aesthetics -- smooth superellipse curves |
| `bevel` | brutalism, celshaded, retro, sketch | Angular, industrial, hand-drawn -- diagonal chamfered edges |
| `scoop` | gothic | Cathedral/medieval aesthetic -- concave curved arches |
| `notch` | cyberpunk | Sci-fi HUD panels -- 90-degree concave square cuts |
| `square` | bauhaus | Geometric modernism -- pure sharp squares, no rounding |

## How the Solution Was Tested

1. **Build verification**: Ran `npx nx build @nxus/core-app` successfully with no CSS compilation errors
2. **Progressive enhancement**: The `corner-shape` property degrades gracefully -- browsers that don't support it simply render standard `border-radius` corners
3. **No new dependencies**: Pure CSS custom property approach, consistent with the existing theme system pattern

## Challenges Encountered

1. **Browser support**: `corner-shape` is only supported in Chrome 139+ / Edge 139+ as of Feb 2026. Firefox and Safari don't support it yet. This is acceptable as a progressive enhancement.
2. **Zero-radius themes**: Brutalism and celshaded have `--radius: 0px` for all corners, so `corner-shape: bevel` won't have a visible effect (the property requires non-zero `border-radius`). The variable is set for correctness and future-proofing if radius values are ever adjusted.
3. **CSS variable cascading**: For themes that re-declare shape-related variables (like `--border-width`, `--radius`) in both light and dark variants, `--corner-shape` was added to both variants for consistency. For themes where only colors change between light/dark, it was added only to the light variant since it cascades naturally.
