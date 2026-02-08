# Technical Specification: Implement Border Shape in Themes

## Difficulty: Easy-Medium

The CSS `corner-shape` property is new and experimental, but integration is straightforward thanks to the existing CSS variable-based theme system and a well-maintained Tailwind plugin.

---

## Technical Context

- **Framework**: React 19 + TanStack Router/Start + Vite 7
- **CSS Framework**: Tailwind CSS v4.0.6 (inline `@theme` config in CSS, no `tailwind.config.js`)
- **Theme System**: 18 themes defined as CSS class selectors (`.themeName` / `.dark.themeName`) using CSS custom properties (OKLCH colors, radius variables, border-width)
- **Existing Shape Variables**: `--radius`, `--radius-card`, `--radius-panel`, `--radius-button`, `--border-width`
- **UI Library**: shadcn/ui-based components in `libs/nxus-ui/`

## CSS `corner-shape` Property

### Overview

The `corner-shape` CSS property (part of CSS Borders and Box Decorations Module Level 4) specifies the **shape** of a box's corners within the area defined by `border-radius`. It is a companion to `border-radius` — radius sets the size, `corner-shape` sets the curve type.

### Available Values

| Keyword | Description | `superellipse()` equivalent |
|---|---|---|
| `round` | Standard circular/elliptical corner (default) | `superellipse(2)` |
| `squircle` | Smooth blend between square and circle (iOS-style) | `superellipse(5)` |
| `bevel` | Straight diagonal corner (chamfer) | `superellipse(0)` |
| `scoop` | Concave curved corner | `superellipse(-2)` |
| `notch` | 90-degree concave square corner | `superellipse(-infinity)` |
| `square` | Sharp square corner (overrides radius) | N/A |

### Browser Support (as of Feb 2026)

- Chrome 139+ / Edge 139+
- Firefox: Not yet
- Safari: Not yet

**Important**: `corner-shape` requires a non-zero `border-radius` to have any visible effect. It degrades gracefully — unsupported browsers simply show standard rounded corners.

### Tailwind CSS v4 Support

Tailwind CSS v4 does **not** have built-in `corner-shape` utilities. Two community plugins exist:

1. **`@toolwind/corner-shape`** — Adds explicit utility classes like `corner-squircle`, `corner-tl-bevel`, etc. Provides per-corner control.
2. **`tailwindcss-corner-shape`** — Zero-config plugin that automatically applies `corner-shape` to all existing `rounded-*` utilities. Available presets: `squircle`, `bevel`, `round`, etc.

---

## Implementation Approach

### Strategy: CSS Custom Property + Tailwind Plugin

Use the **`@toolwind/corner-shape`** plugin for explicit utility classes, combined with a new CSS custom property `--corner-shape` for theme-level control.

**Rationale for `@toolwind/corner-shape` over `tailwindcss-corner-shape`**:
- The zero-config plugin (`tailwindcss-corner-shape`) applies one shape globally to all `rounded-*` — but we need **per-theme** shapes (e.g., `squircle` for default, `bevel` for brutalism, `round` for nord).
- The `@toolwind/corner-shape` plugin gives explicit utility classes that can be applied selectively, and can also be driven by CSS variables in the theme.

**However**, a simpler approach exists: since the project already uses custom CSS properties per-theme, we can define a `--corner-shape` variable and apply `corner-shape` directly in CSS without any plugin dependency. The existing custom `.radius-card`, `.radius-panel`, `.radius-button`, `.radius-base` utility classes in `styles.css` already apply `border-radius` — we just add `corner-shape: var(--corner-shape)` alongside them.

### Recommended Approach: Pure CSS Custom Property (No Plugin)

This avoids a new dependency entirely. The theme system already uses CSS variables, and `corner-shape` is a standard CSS property that can be set via a variable.

#### Changes:

1. **Add `--corner-shape` CSS variable** to `:root` and `.dark` in `styles.css` (default: `round`)
2. **Add `corner-shape` to the existing radius utility classes** (`.radius-card`, `.radius-panel`, `.radius-button`, `.radius-base`)
3. **Override `--corner-shape` per-theme** in each theme CSS file with a shape that fits the theme's aesthetic
4. **Optionally install `@toolwind/corner-shape`** for component-level utility classes (if needed in the future)

---

## Source Code Changes

### Files Modified

| File | Change |
|---|---|
| `apps/nxus-core/src/styles.css` | Add `--corner-shape: round;` to `:root`, add `corner-shape` to `.radius-*` utilities |
| `apps/nxus-core/src/styles/themes/brutalism.css` | Add `--corner-shape: bevel;` |
| `apps/nxus-core/src/styles/themes/celshaded.css` | Add `--corner-shape: bevel;` |
| `apps/nxus-core/src/styles/themes/retro.css` | Add `--corner-shape: bevel;` |
| `apps/nxus-core/src/styles/themes/sketch.css` | Add `--corner-shape: bevel;` |
| `apps/nxus-core/src/styles/themes/anime.css` | Add `--corner-shape: squircle;` |
| `apps/nxus-core/src/styles/themes/neon.css` | Add `--corner-shape: squircle;` |
| `apps/nxus-core/src/styles/themes/vaporwave.css` | Add `--corner-shape: squircle;` |
| `apps/nxus-core/src/styles/themes/synthwave.css` | Add `--corner-shape: squircle;` |
| `apps/nxus-core/src/styles/themes/tokyonight.css` | (keep default `round` — no change needed) |
| `apps/nxus-core/src/styles/themes/dracula.css` | (keep default `round` — no change needed) |
| `apps/nxus-core/src/styles/themes/nord.css` | (keep default `round` — no change needed) |
| `apps/nxus-core/src/styles/themes/catppuccin.css` | Add `--corner-shape: squircle;` |
| `apps/nxus-core/src/styles/themes/github.css` | (keep default `round` — no change needed) |
| `apps/nxus-core/src/styles/themes/gruvbox.css` | (keep default `round` — no change needed) |
| `apps/nxus-core/src/styles/themes/rosepine.css` | Add `--corner-shape: squircle;` |
| `apps/nxus-core/src/styles/themes/everforest.css` | Add `--corner-shape: squircle;` |
| `apps/nxus-core/src/styles/themes/kanagawa.css` | (keep default `round` — no change needed) |
| `apps/nxus-core/src/styles/themes/solarized.css` | (keep default `round` — no change needed) |

### No New Files Created

---

## Detailed Changes

### 1. `apps/nxus-core/src/styles.css`

**Add default variable in `:root`:**
```css
:root {
  /* ... existing variables ... */
  --corner-shape: round;
}
```

Note: No need to add to `.dark` since `corner-shape` is not affected by color mode.

**Update radius utility classes:**
```css
.radius-card {
  border-radius: var(--radius-card);
  corner-shape: var(--corner-shape);
}

.radius-panel {
  border-radius: var(--radius-panel);
  corner-shape: var(--corner-shape);
}

.radius-button {
  border-radius: var(--radius-button);
  corner-shape: var(--corner-shape);
}

.radius-base {
  border-radius: var(--radius);
  corner-shape: var(--corner-shape);
}
```

**Also add a base rule** so that any element with `border-radius` (via Tailwind's `rounded-*` classes) also picks up the corner shape:
```css
@layer base {
  * {
    @apply border-border outline-ring/50;
    corner-shape: var(--corner-shape);
  }
}
```

This ensures all elements in the app inherit the theme's corner shape globally, not just those using the custom `.radius-*` classes.

### 2. Theme CSS Files — Corner Shape Assignments

The corner shape chosen for each theme is based on its visual identity:

| Theme | `--corner-shape` | Rationale |
|---|---|---|
| **default** | `round` (inherited) | Clean, standard look |
| **tokyonight** | `round` (inherited) | Smooth, modern IDE aesthetic |
| **dracula** | `round` (inherited) | Clean, classic dark theme |
| **nord** | `round` (inherited) | Minimal, clean Scandinavian design |
| **catppuccin** | `squircle` | Soft, pastel aesthetic benefits from smooth squircle curves |
| **github** | `round` (inherited) | Standard, professional GitHub look |
| **retro** | `bevel` | Terminal/retro sharp diagonal corners fit the CRT feel |
| **synthwave** | `squircle` | 80s neon aesthetic — smooth, futuristic shapes |
| **gruvbox** | `round` (inherited) | Warm, earthy, standard rounded |
| **rosepine** | `squircle` | Soft, dreamy aesthetic — squircle adds to the gentleness |
| **everforest** | `squircle` | Organic, natural — smooth curves feel more natural |
| **kanagawa** | `round` (inherited) | Traditional Japanese wave art — standard circles |
| **solarized** | `round` (inherited) | Scientific precision — standard geometry |
| **anime** | `squircle` | Playful, rounded anime UI panels — squircle is perfect |
| **sketch** | `bevel` | Hand-drawn feel — beveled corners look like pencil cuts |
| **celshaded** | `bevel` | Video game UI — beveled edges match the flat/angular aesthetic |
| **vaporwave** | `squircle` | Retro-futuristic — smooth 80s/90s UI shapes |
| **neon** | `squircle` | Electric, glowing — squircle gives modern neon sign feel |
| **brutalism** | `bevel` | Industrial, raw — angular beveled corners reinforce brutalist aesthetic |

### 3. Example Theme Change (brutalism.css)

```css
.brutalism {
  /* ... existing variables ... */

  /* Brutalist: thick borders, no curves */
  --border-width: 3px;
  --radius: 0px;
  --radius-card: 0px;
  --radius-panel: 0px;
  --radius-button: 0px;
  --corner-shape: bevel;
}
```

Note: For brutalism, `--radius` is `0px`, so `corner-shape` will have no visual effect (it requires non-zero `border-radius`). This is intentional — it sets the variable correctly for any component that might override the radius locally.

### 4. Example Theme Change (anime.css)

```css
.anime {
  /* ... existing variables ... */

  /* Bold borders for anime feel */
  --border-width: 2px;
  --corner-shape: squircle;
}
```

---

## Verification Approach

1. **Build**: Run `nx build nxus-core` (or project build command) to verify no CSS compilation errors
2. **Visual Inspection**: Switch between themes in the running app and verify:
   - Default theme shows standard `round` corners
   - Brutalism/celshaded/retro/sketch themes show `bevel` corners (where radius > 0)
   - Anime/neon/vaporwave/synthwave/catppuccin/rosepine/everforest themes show `squircle` corners
   - Themes without overrides show inherited `round` corners
3. **Browser Compatibility**: Verify in Chrome 139+ that `corner-shape` renders correctly; verify in Firefox/Safari that the app still looks correct (graceful degradation to standard `border-radius`)
4. **Lint**: Run project linter to check for any CSS issues
5. **No Regression**: Verify no visual regressions in themes that don't change (tokyonight, dracula, nord, github, gruvbox, kanagawa, solarized)

---

## Risks and Considerations

1. **Limited Browser Support**: `corner-shape` only works in Chrome 139+ / Edge 139+. This is acceptable because:
   - It degrades gracefully (standard `border-radius` still applies)
   - The themes already look fine without it — this is a progressive enhancement
2. **Zero visual impact on zero-radius themes**: Brutalism, celshaded already have `--radius: 0px`, so `corner-shape: bevel` won't be visible. This is fine — the variable is set for correctness and future-proofing.
3. **No new dependencies**: Pure CSS approach avoids adding npm packages.
