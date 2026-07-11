# Tana UX synthesis → nxus theming/component plan — 2026-07-11

Non-normative note. Sources: (a) web research over Tana Outliner's docs/release notes/community critique (agent report, this session), (b) design tokens extracted from Tana's production app bundle `https://app.tana.inc/static/index-C-G03e_Z.css` and desktop shell v1.523.0 — machine-readable with per-value provenance in [2026-07-11-tana-tokens.json](2026-07-11-tana-tokens.json), method + confidence in [2026-07-11-tana-tokens-analysis.md](2026-07-11-tana-tokens-analysis.md). April-2026 caveat: "Tana" split; the outliner (our reference) lives at outliner.tana.inc.

## What actually makes Tana's UI feel the way it does (evidence-backed)

1. **Color has one semantic job: supertag identity.** Base UI is a fine cool-neutral ramp; the only expressive color is the tag's, reused everywhere that tag appears (badge, bullet tint, kanban column). One stored hue, theme-dependent lightness/saturation transform — not two hand-picked hex values.
2. **Two text hierarchies, not one.** Tana's theme separates `editorText`/`editorTextMuted` from `uiText`/`uiTextMuted` — content and chrome get independent ramps. Sidebar and content area are two luminance zones (post-2025 refresh: darker content, lighter chrome).
3. **The bullet is the type system's icon slot.** Plain dot / halo-when-children / dashed circle = reference / magnifier = search / `#` = supertag def / `>_` = command node — one glyph slot, same encoding in every surface. (nxus's bullet.tsx already follows this — keep it strict.)
4. **One row-renderer for every list-shaped surface** (outline, search results, backlinks, query results, table rows, day nodes). This is what makes "everything is a node" *felt* rather than claimed.
5. **Feel = latency + no navigation chrome, not animation.** Motion tokens exist (50–200ms micro/fast, standard easings) but state feedback is static color/icon (active filter = filled blue; sync = top-bar badge with explicit offline/online/reconnect states). Reviews praising "fast, fluid" are praising instant zoom and low input latency. Their weak point is cold load (~8s web app) — the exact thing nxus's local-first bet answers.
6. **Progressive disclosure over resting density.** Clean plane at rest; power in hover-reveals, context menus, config side panels (not modals). Field config panel: type, auto-init, required/hide toggles, usage stats with click-through search.
7. **Everything is a named command first; keybindings are secondary.** Cmd+K = commands, Cmd+S = global search (two palettes — nxus's split matches). Any command can be user-bound (`Cmd+Shift+K` records a private shortcut). Command nodes = automations composed from the same command vocabulary.
8. **Anti-lessons from their own users:** visual craft lagged structure for years ("hire a UI designer" thread); onboarding under-explains a deep system (third-party teaching economy); identically-named node duplication confuses; mobile second-class; export not round-trippable (nxus TIF must hold a tested round-trip invariant precisely here).

## Extracted token headlines (provenance in tokens.json)

- Type: Inter (variable) app-wide, JetBrains-adjacent mono; size scale 100–800 around a runtime `--baseFontSize`; weights 400/500/600; compact line-heights.
- Radii: 0.125/0.25/0.375/0.5/0.7/0.8rem + 0.75rem panels + pill.
- Shadows: two-layer soft (`0 .1rem .1rem 3–5% + 0 .75rem 1.5rem 4%`), hand-authored dark variants (25–30% alphas), popover = hard+soft composite.
- Motion: micro 50ms, bullet 100ms, fast 150ms, standard 200ms, slow 300ms; standard/out/in-out easings.
- Colors: ~20 semantic roles per theme incl. `panel`, `panelDimmed`, `canvas`, `contextMenu`, `stroke`, `strokeSoft`, `focus`, `selected`, dedicated outline bullet + indent-guide colors. Dark theme hand-authored, not inverted.

## Application plan for nxus

Current state: each of the 6 apps carries its own `src/styles.css` with a full ~118-var shadcn-style oklch token block — 6 hand-written copies of what should be one token layer (SSOT violation, principle 2).

- **T1 — one token layer in `@nxus/ui`.** `libs/nxus-ui/src/theme/tokens.css`: semantic roles modeled on the Tana split (editorText vs uiText ramps; panel/canvas/stroke/strokeSoft/focus/selected; bullet + indent-guide colors as first-class tokens; radius/shadow/motion scales from the extracted values as starting points, tuned, not copied blind). Apps import it; per-app styles.css shrinks to app-specific leftovers. Existing `ThemeProvider` (theme.tsx) keeps the light/dark switch; dark values hand-authored.
- **T2 — supertag color pipeline.** One stored hue per supertag; light/dark rendering derived by transform (matches existing hash-fallback approach — formalize in `supertag-colors.ts`); bullet tint + badge + any tag-colored surface all read the same derived pair.
- **T3 — component alignment.** Audit for the one-row-renderer rule (search results, backlinks, query results, references must render through the same node-row primitive as the outline); sync-state machine surfaced as a static top-bar badge (saved/saving/offline/error — pairs with editor-sync INV-1/INV-3 fix); pinned fields (border + always-first, Tana parity); "option with supertag" field type consideration (closes select-vs-instance gap).
- **T4 — UX flows** (bigger, sequenced later): side-by-side panels (`Cmd+M`), global quick-capture with deferred structuring, first-party progressive onboarding, dedup nudge on identically-named node creation.

T1+T2 are mechanical and high-leverage; T3 is an audit + 3 bounded features; T4 is product roadmap. Spec homes when implemented: `spec/product/editor.md` (visual language section) + a new `spec/tech/theming.md` for the token contract.
