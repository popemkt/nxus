# Spec and build

## Configuration
- **Artifacts Path**: {@artifacts_path} → `.zenflow/tasks/{task_id}`

---

## Agent Instructions

Ask the user questions when anything is unclear or needs their input. This includes:
- Ambiguous or incomplete requirements
- Technical decisions that affect architecture or user experience
- Trade-offs that require business context

Do not make assumptions on important decisions — get clarification first.

If you are blocked and need user clarification, mark the current step with `[!]` in plan.md before stopping.

---

## Workflow Steps

### [x] Step: Technical Specification
<!-- chat-id: a0601f1a-3db1-4fed-9490-8ecea0b52781 -->

Completed. Specification saved to `{@artifacts_path}/spec.md`.

- **Difficulty**: Medium
- **Concept**: "Neural Nexus" — transform the gateway into an immersive, atmospheric launch pad
- **Key visuals**: Animated particle grid background, DecodeText hero, holographic card tiles with scan-line and glow effects, ambient corner accents
- **Files to modify**: `routes/index.tsx`, `styles.css`
- **Files to create**: `components/particle-grid.tsx`
- **No new dependencies** — uses existing framer-motion, DecodeText, Phosphor Icons, CSS keyframes
- **No data model changes** — purely visual/presentational

---

### [ ] Step: Create Particle Grid Background Component

Create `apps/nxus-gateway/src/components/particle-grid.tsx`:
- Canvas-based animated dot grid with floating particles
- Reads `--primary` and `--background` from CSS custom properties for theme adaptation
- Subtle mouse-reactive parallax effect
- Handles resize, cleanup, `requestAnimationFrame` loop
- Respects `prefers-reduced-motion` (static grid, no animation)
- Positioned as `fixed` full-viewport background at `z-index: 0`

---

### [ ] Step: Add CSS Animations and Ambient Effects

Update `apps/nxus-gateway/src/styles.css` with:
- `@keyframes gateway-scan-line` — horizontal light sweep for card hover
- `@keyframes gateway-glow-pulse` — breathing glow for status dots and corner accents
- `@keyframes gateway-underline-shimmer` — gradient shift for title underline
- Corner accent gradient styles (positioned absolute, using `--primary` at low opacity)
- Holographic card border gradient styles (conic-gradient `::before`)
- All animations use CSS custom properties for full theme compatibility

---

### [ ] Step: Rewrite Gateway Page with New Visual Design

Rewrite `apps/nxus-gateway/src/routes/index.tsx`:
- Import `DecodeText` from `@nxus/ui`, `motion` from `framer-motion`, `ParticleGrid`
- Hero section: DecodeText title with glowing animated underline, fade-in subtitle
- Redesigned holographic card tiles with scan-line hover, icon glow, status dot, gradient border
- Staggered card entrance animation using framer-motion `staggerChildren`
- Corner accent orbs and connection line decorations
- Maintain all existing functionality (links, icon mapping, routing)

---

### [ ] Step: Verification and Testing

- Run `pnpm test` to ensure no regressions in existing tests
- Run type check (`npx tsc --noEmit`) on the gateway app
- Verify visual rendering across dark/light modes and theme palettes
- Confirm `prefers-reduced-motion` disables animations
- Confirm all 3 mini-app links still navigate correctly
- Write report to `{@artifacts_path}/report.md`
