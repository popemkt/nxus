# Technical Specification: Different Visuals for Gateway App

## Difficulty: Medium

The task involves creating 3 new visual styles for the gateway app's mini-app card grid. Each style is a self-contained React component with CSS animations/transforms. No architectural decisions or API changes — purely presentational components scoped to the gateway app.

---

## Technical Context

| Layer | Technology |
|-------|-----------|
| Framework | React 19 + TanStack Router/Start |
| Build | Vite 7 |
| Styling | TailwindCSS 4 (oklch color system, CSS custom properties) |
| Icons | @phosphor-icons/react (duotone weight) |
| Animations | CSS transitions/transforms (prefer CSS over JS for performance) |
| UI Library | @nxus/ui (Card, CardHeader, CardTitle, CardDescription) |
| Font | Outfit (variable) |

### Key Constraints

- New visual components live **in the gateway app** (`apps/nxus-gateway/src/components/`), NOT in the shared `@nxus/ui` library
- Must use the existing theme CSS variables (`--primary`, `--card`, `--background`, `--foreground`, etc.) so all 19 theme palettes work correctly
- Must consume the same `MiniApp` interface and `miniApps` config array
- Must reuse the same `iconMap` pattern for icon resolution
- The existing default visual (current `MiniAppCard` using `@nxus/ui` Card components) is kept as-is
- No new npm dependencies — use CSS transforms for 3D effects, CSS animations for motion, and TailwindCSS utilities where possible. Framer-motion is available as a transitive dependency through `@nxus/ui` but prefer pure CSS for these components to avoid adding a direct dependency.

---

## Current Architecture

The gateway homepage (`src/routes/index.tsx`) is a single page with:
1. A centered title "nXus" with colored "n" prefix
2. A subtitle
3. A 2-column responsive grid of `MiniAppCard` components

The `MiniAppCard` component uses `@nxus/ui` Card components and has subtle hover effects (ring color change, shadow elevation, slight upward translation, arrow fade-in).

---

## The 3 New Visual Styles

### Visual 1: "Glass 3D" — Polished 3D Perspective Cards

**Concept:** Glassmorphism cards with real CSS 3D perspective transforms. Cards tilt toward the mouse cursor on hover, creating a physical depth effect. Multiple layered elements inside each card create parallax-like depth.

**Key Visual Features:**
- CSS `perspective` on the container, `transform-style: preserve-3d` on cards
- `onMouseMove` handler calculates cursor position relative to card center, applies `rotateX`/`rotateY` transforms (max ~15deg)
- `onMouseLeave` smoothly resets to flat with CSS transition
- Layered card internals: background glow layer (translateZ -20px), content layer (translateZ 0), icon layer (translateZ 30px), creating parallax depth
- Glassmorphism: `backdrop-blur-xl`, semi-transparent `bg-card/60`, subtle border with `border-white/10`
- Floating light reflection gradient that shifts with mouse position
- Soft colored glow/shadow beneath card using `--primary` color

**Layout:** Same 2-column grid, larger card padding to give depth room

### Visual 2: "Terminal" — Retro Terminal / CLI Aesthetic

**Concept:** Cards styled as terminal windows with a monospace feel, scanline overlay, and typing-animation text reveals. Evokes a hacker/developer aesthetic.

**Key Visual Features:**
- Cards styled as terminal windows: dark background with green/primary-tinted text
- Top bar with three colored dots (close/minimize/maximize) and a fake terminal title
- Content rendered in monospace font with `>` prompt prefix on the app name
- Typing animation on hover: description text appears character-by-character using CSS `steps()` animation on `width`
- Subtle CRT scanline overlay using repeating-linear-gradient (2px lines at low opacity)
- Blinking cursor (`_`) at the end of text using CSS `@keyframes` blink
- Card border uses `--primary` with low opacity, hover intensifies the glow
- Optional: subtle screen flicker effect on initial load

**Layout:** Single-column stack (terminal windows look better full-width), or 2-column if cards are compact enough

### Visual 3: "Orbital" — Radial/Circular Arrangement with Hover Expansion

**Concept:** Mini-app cards arranged in a radial/circular layout around a central "nXus" hub. On hover, a card expands and pulls focus while others recede. Modern, spatial, dashboard-like.

**Key Visual Features:**
- Central hub element with "nXus" branding, subtle pulse/glow animation
- Cards arranged around the center using CSS positioning (flexbox/grid with transforms or absolute positioning)
- Each card is compact (icon + name), with description hidden by default
- On hover: card scales up (1.15x), reveals description with smooth height transition, gains prominent glow shadow
- Non-hovered cards dim slightly (opacity 0.7) and scale down (0.95x) when any card is hovered (CSS `:has()` or group hover)
- Connecting lines/dots between hub and cards using CSS pseudo-elements or subtle borders
- Smooth spring-like transitions for all transforms

**Layout:** Custom radial layout — not a standard grid. Cards positioned around a central circle. Falls back to a column layout on small screens.

---

## Implementation Approach

### File Structure

```
apps/nxus-gateway/src/
├── components/
│   ├── visuals/
│   │   ├── glass-3d-cards.tsx      # Visual 1: Glass 3D
│   │   ├── terminal-cards.tsx      # Visual 2: Terminal
│   │   └── orbital-cards.tsx       # Visual 3: Orbital
│   └── visual-switcher.tsx         # UI to switch between visuals
├── routes/
│   └── index.tsx                   # Updated to use visual switcher
├── config/
│   └── mini-apps.ts               # Unchanged
└── styles.css                      # May add minimal keyframe animations
```

### Component Interface

Each visual component will follow a common interface:

```tsx
interface VisualProps {
  apps: MiniApp[]
}

// Each visual exports a default component:
export function Glass3DCards({ apps }: VisualProps) { ... }
export function TerminalCards({ apps }: VisualProps) { ... }
export function OrbitalCards({ apps }: VisualProps) { ... }
```

### Visual Switcher

A small, unobtrusive switcher in the bottom-right or top-right corner that lets users toggle between the 4 visuals (default + 3 new ones). Store preference in `localStorage` under a key like `nxus-gateway-visual`.

The switcher will be minimal — small icon buttons or a segmented control — so it doesn't compete with the main content.

### Route Integration

`index.tsx` will:
1. Import all visual components and the switcher
2. Read the stored visual preference (default to the current "default" visual)
3. Render the selected visual component, passing `miniApps` as props
4. Render the visual switcher overlay

The existing `MiniAppCard` and `GatewayPage` layout become the "default" visual, preserved exactly as-is.

### Styling Strategy

- **CSS-first:** Use TailwindCSS utilities and inline styles for transforms. Add custom `@keyframes` to `styles.css` only when Tailwind's animation utilities aren't sufficient (e.g., scanlines, typing cursor blink, pulse glow).
- **Theme-aware:** All colors reference CSS custom properties (`--primary`, `--card`, `--foreground`, etc.) so every theme palette works.
- **No new dependencies:** Pure CSS 3D transforms, CSS animations, and React event handlers for interactivity.
- **Performance:** Use `will-change: transform` sparingly on animated elements. Avoid layout thrashing — stick to `transform` and `opacity` for animations.

---

## Source Code Changes

### New Files

| File | Description |
|------|-------------|
| `src/components/visuals/glass-3d-cards.tsx` | Glass 3D perspective cards with mouse-tracking tilt |
| `src/components/visuals/terminal-cards.tsx` | Retro terminal aesthetic cards with typing animations |
| `src/components/visuals/orbital-cards.tsx` | Radial layout with hub-and-spoke arrangement |
| `src/components/visual-switcher.tsx` | UI control to toggle between visual styles |

### Modified Files

| File | Changes |
|------|---------|
| `src/routes/index.tsx` | Refactor to support visual switching. Extract current layout as "default" visual. Import new visuals and switcher. |
| `src/styles.css` | Add `@keyframes` for: scanline animation, cursor blink, pulse glow, typing reveal. Minimal additions. |

### Unchanged Files

| File | Reason |
|------|--------|
| `src/config/mini-apps.ts` | Data model unchanged |
| `src/routes/__root.tsx` | Root layout unchanged |
| `@nxus/ui` components | No UI library changes per requirement |

---

## Verification Approach

1. **Type checking:** `npx nx run nxus-gateway:build` — ensure no TypeScript errors
2. **Visual testing:** Run dev server (`npx nx run nxus-gateway:dev`) and verify:
   - Default visual renders identically to current behavior
   - Each of the 3 new visuals renders correctly
   - Visual switcher works and persists preference
   - All visuals work in both light and dark modes
   - All visuals work across at least 2-3 different theme palettes
   - Hover interactions are smooth and responsive
   - Cards link to correct paths (`/core`, `/workbench`, `/calendar`)
3. **Existing tests:** `npx nx run nxus-gateway:test` — ensure existing tests still pass
4. **Responsive:** Verify each visual degrades gracefully on small screens (< 640px)
