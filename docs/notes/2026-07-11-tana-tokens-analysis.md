# Tana visual-language extraction

## Scope and source confidence

The primary evidence is the unauthenticated production app bundle at `https://app.tana.inc/static/index-C-G03e_Z.css`, captured 2026-07-11. Confidence is **high**: this is the CSS loaded by the production app shell, not an inferred facsimile. It exposes the real light/dark semantic maps, component CSS, density values, bullet geometry, and interaction timing.

The installed Tana Outliner 1.523.0 desktop app is an unpacked Electron wrapper rather than an `app.asar`. Its `build/config.json` points stable builds to `https://app.tana.inc`. Its bundled `custom.css` was copied to `sources/desktop/custom.css`; confidence is **high for desktop override behavior**, but those rules are explicitly labeled “LEGACY” and “UNSUPPORTED,” so they are not treated as the canonical current palette.

The public marketing site CSS from `https://tana.inc/_next/static/css/…` is **high-confidence marketing evidence** and **medium/low-confidence app evidence**. It confirms the wider brand typography and a clean 4/8/12/16/24/32/40/64 px space scale, but app tokens take precedence wherever they differ.

## Theming model

The app uses CSS custom properties, selected by explicit `html.isLightMode` and `html.isDarkMode` classes. It also repeats equivalent maps inside `prefers-color-scheme` fallbacks. A large primitive palette is declared first: blue, red, yellow, green, and purple in 50-point steps from 50–950, plus an unusually dense neutral ramp in 25-point steps. The neutral ramp is first given hexadecimal fallbacks and then redefined in OKLCH with hue `240`; modern browsers therefore use nearly chroma-free, subtly cool neutrals.

The semantic layer is large (hundreds of roles), not a thin “background/text/accent” theme. It distinguishes editor text from UI text; panel, canvas, context-menu, widget, navigation and configuration surfaces; focused vs unfocused selection; several link contexts; five button intents; AI chat surfaces; status families; calendar states; table states; and outline-specific bullet/guide colors. `tokens.json` intentionally curates the highest-leverage roles while preserving the source bundle for exhaustive mining.

Dark mode is not a mechanical inversion. It uses lighter link blue, darker saturated status backgrounds, a heavier base body weight (`375`), separate shadow opacity, and multiple neighboring near-black surfaces. The installed desktop CSS adjusts these again: its legacy dark canvas is Gray925 while the current web CSS uses Gray800; this is why desktop overrides are recorded but excluded from canonical resolved tokens.

## Typography

The actual app is Inter-first, with `InterVariable` available, comprehensive system fallbacks, a platform-aware monospace stack, and Shantell Sans for handwritten content. The app enables OpenType contextual alternates (`calt`) and character variant `cv05`. Its type scale is compact and non-modular: 0.534, 0.667, 0.8, 0.934, 1, 1.117, 1.267, 1.535, 1.934, 2.4 and 3 rem. Default line-height is 1.4; compact is 1.15. Weight roles are 400/500/600/650, with dark mode nudged to 375.

The marketing site deliberately adds Source Serif 4 for headings and editorial emphasis, Inter for body copy, and Caveat/Kalam-style signature or sketch accents. Those serif/script choices should not be projected into ordinary app chrome.

## Density, geometry, and depth

The app does not expose a generic numeric spacing scale comparable to the marketing site. Instead it uses local semantic dimensions: list rows have 0.25 rem vertical and 0.4 rem horizontal spacing, outline levels indent by 2.1 rem, toolbar heights are 40 px, and panel layout inset is 6 px. This produces a dense outliner while keeping panels and toolbars calmer. The radius scale runs from 0.125 to 0.8 rem; panel radius is 0.75 rem. Surfaces mostly rely on low-contrast borders and tonal separation, with restrained two-layer shadows for floating cards/popovers.

The z-index system is only partly tokenized. `--zIndexContextMenu` is 10001, while component CSS also uses 9998/9999/10000/99999 and, for one emergency overlay, 2147483647. It behaves as conventions rather than a coherent exported scale.

## Outline bullets and indent guides

The default bullet has a 15 px interaction box and a 5 px inner dot (7 px for search). Its dim outer disk uses `--colorBulletDefaultOutline`; the inner dot uses `--colorBulletDefaultFill`. Hover scales the inner dot to 1.375 over 75 ms ease-out; active scales the whole bullet to 0.9. Reference bullets use dashed or dotted rings, while template bullets use a 1.5 px solid/dashed ring and a different internal glyph treatment.

Outline indentation is `2.1rem` per level. Guide colors are explicitly semantic: light uses Gray150 (selected Gray200); dark uses Gray750 (selected Gray700). Reference and hover guides receive adjacent neutral roles. The result is deliberately quiet hierarchy: bullets stay legible, but guides sit close to their surface tone.

## Motion

Motion is terse. The dominant duration is 200 ms (`ease`, `ease-out`, or linear depending on property), with 150 ms and 300 ms secondary bands. Micro-interactions use 50–75 ms; the bullet animation is a clear example. A Material-like `cubic-bezier(0.4,0,0.2,1)` occurs for a width transition but is not the global default. Longer animation loops are feature-specific rather than core navigation motion.

## Marketing-site techniques

The cloned template’s README prescribes rendered reconnaissance plus `getComputedStyle()` capture. Direct asset mining recovered the same concrete CSS without reproducing the site. Marketing CSS uses responsive custom-property overrides, `clamp()`, `color-mix()`, OKLCH badge colors, translucent “airy” product cards, and multi-layer shadows. The responsive type and section-spacing tokens change at breakpoints rather than scaling from one global ratio.

## Local evidence retained

- `sources/app/`: fetched public HTML, production CSS/JS, preload CSS, and a formatted CSS copy.
- `sources/desktop/`: read-only copies of relevant installed desktop CSS.
- `sources/marketing/`: fetched landing HTML and all linked CSS bundles.
- `website-cloner/`: requested repository clone and its documented reconnaissance approach.

All network and installed-app operations were fetch/read/copy only. No account was created and no login was attempted.
