# Technical Specification: New Gateway Visual

## Difficulty: Medium

## Technical Context

- **Language**: TypeScript + React 19
- **Styling**: TailwindCSS v4, oklch color system, CSS custom properties
- **Animation**: framer-motion (available via `@nxus/ui`), tw-animate-css, CSS keyframes
- **Components**: shadcn/ui Card system, Phosphor Icons (duotone), GlitchText, DecodeText
- **Routing**: TanStack Router (file-based)
- **Build**: Vite 7 + TanStack Start + Nitro

## Current State

The gateway landing page is functional but visually minimal:
- Centered white/dark card grid (2 columns)
- Simple title "nXus" with muted subtitle
- Basic hover effects (translate-y, ring glow)
- No background effects, no ambient animations, no visual personality

## Design Concept: "Neural Nexus"

Transform the gateway from a plain card picker into an immersive, atmospheric launch pad that feels like a futuristic command center. The concept: each mini-app is a **node** in a living network, and the gateway is the nexus connecting them.

### Visual Elements

#### 1. Animated Particle Grid Background
A subtle, animated dot-grid background with floating particles that drift and pulse. Creates depth without being distracting. Uses pure CSS/canvas for performance.

- Soft glowing dots on a grid pattern, using `--primary` color at low opacity
- Particles slowly drift with subtle parallax on mouse move
- Adapts to dark/light mode automatically via CSS variables
- Implemented as a self-contained React component with `<canvas>`

#### 2. Hero Section with Decode Effect
Replace the plain "nXus" title with the existing `DecodeText` component for a hacker-terminal feel. Add a glowing underline accent that pulses.

- Use `DecodeText` for the title (scramble on mount)
- Animated gradient underline beneath the title using `--primary` → transparent
- Subtitle fades in with slight delay using framer-motion

#### 3. Redesigned App Cards — "Holographic Tiles"
Transform the cards into holographic-feeling tiles with:

- **Gradient border** that shifts on hover (conic-gradient around the border using `::before` pseudo-element)
- **Icon glow**: the icon box gets a soft radial glow on hover, pulsing with the primary color
- **Scan line** effect: a thin horizontal light bar sweeps across the card on hover (CSS `@keyframes`)
- **Staggered entrance**: cards animate in one-by-one on page load using framer-motion `staggerChildren`
- **Status indicator**: small animated dot (breathing pulse) in the card corner, suggesting the app is "online"

#### 4. Ambient Corner Accents
Subtle glowing orbs in 2-3 corners of the viewport using CSS radial gradients. These use `--primary` at very low opacity and gently pulse with a long animation cycle. Creates a sense of ambient energy.

#### 5. Connection Lines (CSS-only)
Faint decorative lines radiating from the center title down to the card grid, suggesting a neural network topology. Pure CSS with `::before`/`::after` on a wrapper div.

### Color Strategy
- All colors derived from CSS custom properties (`--primary`, `--foreground`, `--background`, etc.)
- Works across all 19 theme palettes automatically
- No hardcoded colors — fully theme-adaptive

## Implementation Approach

### Files to Modify

1. **`apps/nxus-gateway/src/routes/index.tsx`** — Complete rewrite of the `GatewayPage` and `MiniAppCard` components with new visual design, framer-motion animations, and restructured layout.

2. **`apps/nxus-gateway/src/styles.css`** — Add CSS keyframe animations for scan-line, glow pulse, particle effects, corner accents. All using CSS custom properties for theme compatibility.

### New Files to Create

3. **`apps/nxus-gateway/src/components/particle-grid.tsx`** — Canvas-based animated particle/dot-grid background component. Self-contained, performant, theme-aware.

### Files NOT Modified
- `vite.config.ts` — no build changes needed
- `package.json` — no new dependencies needed; framer-motion is already available via `@nxus/ui`
- `__root.tsx` — no layout changes needed
- `config/mini-apps.ts` — data model unchanged
- `libs/nxus-ui/` — using existing components, no library changes

### No New Dependencies
Everything needed is already available:
- `framer-motion` via `@nxus/ui` peer dependency
- `@phosphor-icons/react` for icons
- `DecodeText` from `@nxus/ui`
- Tailwind CSS + tw-animate-css for animations
- CSS keyframes for custom effects

## Implementation Plan

### Step 1: Particle Grid Background Component
Create `apps/nxus-gateway/src/components/particle-grid.tsx`:
- Canvas-based dot grid with subtle animation
- Mouse-reactive parallax (optional, subtle)
- Uses CSS variables for colors (reads `--primary` from computed styles)
- Renders behind all content with `position: fixed; z-index: 0`
- Handles resize, cleanup, and reduced-motion preference
- Performance: uses `requestAnimationFrame`, limits particle count

### Step 2: CSS Animations & Effects
Add to `apps/nxus-gateway/src/styles.css`:
- `@keyframes gateway-scan-line` — horizontal light sweep for card hover
- `@keyframes gateway-glow-pulse` — breathing glow for status dots and corner accents
- `@keyframes gateway-underline-shimmer` — gradient shift for title underline
- Corner accent gradient styles (positioned absolute in viewport corners)
- Card holographic border gradient styles

### Step 3: Gateway Page Rewrite
Rewrite `apps/nxus-gateway/src/routes/index.tsx`:
- Import `DecodeText` from `@nxus/ui`, `motion` from `framer-motion`, `ParticleGrid` component
- Hero section: DecodeText title + animated subtitle + glowing underline
- Card grid: framer-motion `staggerChildren` entrance, holographic card design
- Corner accents: positioned gradient orbs
- Connection lines: CSS decorative elements
- Maintain all existing functionality (links, routing, icon mapping)

### Step 4: Verification
- Run `pnpm test` to ensure no regressions
- Run type check on the gateway app
- Verify all 19 theme palettes still work (colors are variable-based)
- Check light/dark mode rendering
- Verify reduced-motion preference is respected
- Ensure mini-app proxy links still work correctly

## Data Model / API / Interface Changes

**None.** The `MiniApp` interface and `miniApps` config array remain unchanged. This is a purely visual/presentational change to the gateway landing page.

## Verification Approach

1. **Type check**: `npx tsc --noEmit` in the gateway app
2. **Unit tests**: `pnpm test` — existing tests should pass unchanged
3. **Visual verification**: Run `pnpm dev:gateway` and inspect:
   - Particle background renders and animates
   - Cards animate in with stagger
   - Hover effects work (scan line, glow, border gradient)
   - DecodeText scrambles on load
   - All 3 mini-app links navigate correctly
   - Theme switching works (try toggling dark/light, changing palettes)
   - Corner accents visible and pulsing
4. **Performance**: No jank on scroll, canvas doesn't consume excessive CPU
5. **Accessibility**: `prefers-reduced-motion` disables particle animation and card entrance animations
