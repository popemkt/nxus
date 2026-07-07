# Outline Editor — Functional Behavior

Invalidated by: product decisions about how the outline editor looks, edits, and navigates.

This file is the canonical home of editor behavior, including the "unified plane" UX rules previously held in `.claude/rules/editor-ux-rules.md` (that file is the thin session-loaded pointer; changes here MUST update it in the same commit). The persistence contract — what happens between an optimistic store mutation and the database — is owned by [../tech/editor-sync.md](../tech/editor-sync.md). The node/field/supertag/query data model is owned by [./data-model.md](./data-model.md). App placement (port 3005, `/editor` base path) is owned by [../tech/architecture.md](../tech/architecture.md).

**Proof layer**: the e2e suites `e2e/editor/outline-editor.spec.ts` (~30 tests) and `e2e/editor/query-persistence.spec.ts` (2 tests) are the behavioral proof of this spec. Each section below cites its proving tests. Twelve tests currently fail; each failing cluster carries a `DRIFT:` block (canonical = the test's expectation, current = the failing implementation).

Current materialization: `apps/nxus-editor` (~12.4k LOC), orchestrated by `src/components/outline/outline-editor.tsx`.

---

## 1. The Unified Plane (core principle)

Everything in the outline — nodes, fields, field values — lives on the same visual plane. There is no distinction between "a node's content area" and "a field's content area." They are all text on the same slate. If you can click and edit a node's content in the outline, you MUST be able to click and edit a field's value the same way.

Consequences (normative):

- **No hover effects** on field values — no `hover:bg-foreground/5` or similar. A field value area must feel identical to regular node content: text on a neutral backdrop.
- **No visual "input box"** — field values are not inputs on a form. They are content on the plane that happens to be editable. `cursor-text` is acceptable (signals editability without visual noise).
- Field values use the same text styles as node content: `text-[14.5px] leading-[1.6]` (`field-value.tsx:52-55`).
- Empty values show a `text-foreground/25 italic` "Empty" placeholder (`field-value.tsx:58-61,146-150`).

## 2. Outline Structure & Node Rows

Every bullet is a node; indentation is the parent (`ownerId`) relationship; sibling order is a fractional-index string (see [../tech/editor-sync.md](../tech/editor-sync.md) for the ordering model). Rendering is a recursive `NodeBlock` (`node-block.tsx:27`).

Node row layout (normative):

- Row uses `items-start` (not `items-center`) so the bullet aligns with the **first line** of text; multiline content flows downward from the bullet (`node-block.tsx:355-361`).
- Indentation: `depth × 24px` left padding (`node-block.tsx:361`).
- Bullet: `h-6 w-6` (24px) button, centered glyph (`bullet.tsx:39-58`). Glyph variants:
  - plain node → round dot, 4px (5px when it has children) (`bullet.tsx:111-124`)
  - supertag definition node → `#` glyph in the tag's color (`bullet.tsx:68-81`)
  - query node → magnifying-glass icon (`bullet.tsx:82-90`)
  - reference row (backlinks, query results, node-ref field values) → dashed circle around a dot (`bullet.tsx:91-110`)
- Content: `text-[14.5px] leading-[1.6]`, `min-h-6` so bullet/content midlines align (`node-content.tsx:216-221`).
- Supertag badges render inline after the content text, same line (`node-content.tsx:257-259`).
- Collapsed node with children: filled halo behind the bullet + a children-count badge at top-right (`bullet.tsx:59-65,127-131`).
- Children are wrapped in a `children-container` with a clickable vertical tree line (thin visible line, wide hit area) that toggles collapse (`node-block.tsx:410-419`).
- Selected-but-not-editing rows get `bg-primary/5` on the row and `bg-primary/8` on the content (`node-block.tsx:359`, `node-content.tsx:220`).

Proof: `outline-editor.spec.ts` — "Node Rendering" (:24-58), "Collapse/Expand" (:166-198).

## 3. Editing Model

**Single active editor.** Exactly one node is editable at a time (`activeNodeId`). The active node renders a `contentEditable` div; all other nodes render static text (`node-content.tsx:224-255`). While active, **the DOM is the source of truth** — the store is updated from `input` events, and React never rewrites the DOM text mid-edit (doing so would reset the caret) (`node-content.tsx:51-87`).

- Click on a node activates it with the caret at the click position; click resolution is deferred a frame because the browser sets the selection after mouseup (`node-content.tsx:126-142`).
- Clicking the outline background deactivates the editor (content already saved via debounced sync) (`outline-editor.tsx:164-166,485-492`).
- IME composition is respected: input events are suppressed during composition and flushed on `compositionend` (`node-content.tsx:144-151`).
- **Enter at end of text** creates an empty sibling below and activates it. **Enter mid-text splits the node**: current node keeps the before-text, the new sibling gets the after-text and becomes active (`node-content.tsx:196-208`, `node-block.tsx:99-105`).
- **Backspace on an empty leaf** deletes it and re-activates the previous visible node at end-of-text (`node-block.tsx:193-208`). **Backspace at start of a non-empty leaf** merges its content into the previous visible node and deletes it, caret at the merge point (`node-block.tsx:210-228`).
- Empty outline (zoomed root with no children) shows "Empty. Press Enter to start writing."; Enter creates the first child (`outline-editor.tsx:174-184,497-501`).

Proof: `outline-editor.spec.ts` — "Node Activation & Editing" (:60-104), "Node Splitting" (:291-357), "Empty Node — Press Enter to Write" (:849-939).

## 4. Keyboard Model

Two modes. **Editing mode** (a node is active): keys are handled by the node's own handler (`node-block.tsx:173-302`). **Selection mode** (a node is selected, none active): keys are handled by a window-level listener that is inert while a palette is open (`outline-editor.tsx:168-348`).

### Editing mode

| Key | Action | Evidence |
|---|---|---|
| Enter (end of text) | New empty sibling below, activate it | `node-block.tsx:177-181` |
| Enter (mid-text) | Split node at caret | `node-content.tsx:196-208` |
| Tab / Shift+Tab | Indent / outdent | `node-block.tsx:183-191` |
| Backspace (empty leaf) | Delete, focus previous | `node-block.tsx:193-208` |
| Backspace (at start) | Merge into previous | `node-block.tsx:210-228` |
| ArrowUp at start / ArrowDown at end | Activate previous / next visible node | `node-block.tsx:243-251,275-284` |
| Cmd+Shift+Up / Cmd+Shift+Down | Move node up / down among siblings | `node-block.tsx:231-235,263-267` |
| Cmd+Up / Cmd+Down | Collapse / expand children | `node-block.tsx:236-242,268-274` |
| Escape | Exit to selection mode (node stays selected) | `node-block.tsx:255-260` |

### Selection mode

| Key | Action | Evidence |
|---|---|---|
| ArrowUp / ArrowDown | Select previous / next visible node (resets multi-selection to one) | `outline-editor.tsx:199-206,220-226` |
| Shift+ArrowUp / Shift+ArrowDown | Extend multi-selection | `outline-editor.tsx:199-202,220-222`; store `outline.store.ts:169-181` |
| Cmd+Shift+Up / Cmd+Shift+Down | Move selected node(s) up / down (multi: each member; down iterates in reverse to avoid order collisions) | `outline-editor.tsx:191-198,211-219` |
| Enter | Activate editing, caret at end | `outline-editor.tsx:244-247` |
| Cmd+Enter | Toggle the node's first boolean field | `outline-editor.tsx:231-242` |
| Space | Toggle collapse | `outline-editor.tsx:250-254` |
| Backspace / Delete | Delete selected node(s) (subtree); selection moves to next, else previous, visible node | `outline-editor.tsx:255-277` |
| Tab / Shift+Tab (multi-select only) | Indent / outdent all selected | `outline-editor.tsx:278-289` |
| `o` | Create sibling after selected node | `outline-editor.tsx:290-296` |
| Cmd+. / Cmd+, | Zoom into selected node / zoom out to parent | `outline-editor.tsx:301-322` |
| Escape | Clear selection | `outline-editor.tsx:297-300` |

### Global (capture phase)

A capture-phase window listener handles shortcuts that must survive editors stopping propagation (`outline-editor.tsx:358-418`):

- **Cmd+Z / Cmd+Shift+Z** — outline-level undo/redo (snapshot stacks of the node map, max 50; `stores/undo.store.ts:4`). Inside a focused contentEditable/input the native browser undo wins instead (`outline-editor.tsx:360-376`). Undo/redo restores the client store only — server persistence of undo is specified (and its absence recorded as drift) in [../tech/editor-sync.md](../tech/editor-sync.md).
- **Cmd+S / Ctrl+S** — toggle the search palette (§11), shadowing browser save (`outline-editor.tsx:377-380`).
- **Cmd+K / Ctrl+K** — toggle the node command palette (§11), capturing field context if focus/selection is inside a field row (`outline-editor.tsx:381-412`).

Proof: `outline-editor.spec.ts` — "Keyboard Operations" (:106-164), "Multi-Node Selection" (:359-434), "Keyboard Shortcuts (move, undo)" (:617-673).

DRIFT: multi-select visual selection fails e2e
- canonical: after Escape into selection mode, Shift+ArrowDown extends the selection so ≥2 node rows carry selection styling (`bg-primary/5`); plain ArrowDown collapses back to exactly 1; Delete removes all selected nodes (`outline-editor.spec.ts:360-433`).
- current: all three "Multi-Node Selection" tests fail — the extended selection does not manifest as ≥2 styled rows (styling path `node-block.tsx:34,340,359`; extension logic `outline.store.ts:169-181`).
- impact: multi-select (bulk move/indent/delete) is unverified and likely broken in-browser; the keyboard table above overstates reality.
- closes: fix `extendSelection`/selection styling so the tests pass (root-cause first: does `selectedNodeIds` actually gain members after Escape→Shift+ArrowDown?).

DRIFT: Cmd+Shift+Down move fails e2e
- canonical: in selection mode, Cmd+Shift+ArrowDown moves the selected node below its next sibling — the first visible node's text changes (`outline-editor.spec.ts:618-644`).
- current: test fails. Move-down is implemented as two separate `reorderNodeServerFn` calls with a linear sibling scan (`hooks/use-outline-sync.ts:401-426`); the optimistic swap and/or its persistence does not take effect.
- impact: keyboard reordering is unreliable; a failure between the two reorder calls leaves duplicate orders in the DB (see [../tech/editor-sync.md](../tech/editor-sync.md)).
- closes: atomic swap (single server call) + passing test.

## 5. Field Rows & Field Editing

Fields render in a `FieldsSection` between the node's content row and its children (`node-block.tsx:422-430`), at one indent deeper than their parent (`depth + 1`), the same level as children (`fields-section.tsx:125`).

### Layout (normative)

- Row: `flex items-start py-1` — the 4px vertical padding creates breathing room and aligns icon/label/value to the same first-line baseline; no explicit `min-h` (`fields-section.tsx:121-125`). Rationale: field rows must accommodate node-reference values (bullets + badges) yet let multiline values grow naturally — `py-1` does both where a taller `min-h` would not.
- Field icon: `h-6 w-6`, same dimensions as a node bullet; it is the field-type icon (below) and click-navigates to the field definition node (`fields-section.tsx:133-141`, `bullet.tsx:154-161`).
- Field label: `h-6 flex items-center`, fixed width `FIELD_LABEL_WIDTH = 120px` so all values start at the same x (`fields-section.tsx:12-13,145-162`). Required-but-empty fields tint the label red with a warning icon (`fields-section.tsx:94-100,154-161`).
- A remove (`X`) button appears on row hover (`fields-section.tsx:164-180`).
- Field value: plain `flex-1 min-w-0` wrapper — no height constraint, no flex centering (`fields-section.tsx:183-190`). Unified-plane rules (§1) apply.
- Field rows carry `data-field-row="true"` + `data-node-id`/`data-field-id`/`data-field-name` so the command palette can capture field context (`fields-section.tsx:127-130`).

### Field-type icons

Each field type has a distinct Phosphor icon as its "bullet" (`bullet.tsx:136-148`): text → TextT, number → Hash, boolean → ToggleRight, date → CalendarBlank, select → CaretCircleDown, url → LinkSimple, email → At, node → ArrowSquareOut, nodes → TreeStructure, json → BracketsAngle, instance → UsersThree.

### Per-type value editors (`field-value.tsx:17-48` dispatch)

| Type | Display | Edit behavior | Evidence |
|---|---|---|---|
| text | inline text on the plane | click-to-edit contentEditable in place (no layout shift); Enter commits, Escape reverts, blur commits trimmed value | `field-value.tsx:68-155` |
| number | formatted number | same click-to-edit; validates on commit, reverts on NaN | `:159` |
| boolean | toggle switch | instant save on click | `:263-291` |
| date | formatted date | native date picker | `:295` |
| select | value badge | dropdown of defined options + values in use, searchable | `:360` |
| instance | referenced node | dropdown of nodes tagged with the field's configured supertag | `:599` |
| url | clickable link | click-to-edit + open | `:814` |
| email | clickable mailto | click-to-edit | `:922` |
| node | full reference row: dashed-circle bullet + content + supertag pills; click navigates | read-only display (no `@`-picker yet) | `:1028-1085` |
| nodes | vertical stack of reference rows | read-only display | `:1087-1099` |
| json | collapsed monospace preview (≤40 chars), full JSON in tooltip | read-only | `:1125-1147` |

Unresolved node references render a compact pill with the truncated node ID; clicking still navigates (`field-value.tsx:1101-1123`). Any object value on a non-reference type falls back to the JSON display (`:19-21`).

### Field entry (`>` trigger) and visibility

- Typing `>` as the sole content of an active node clears the text and opens a **pending field row**: an inline autocomplete (auto-focused label cell) listing available fields for the node minus fields it already has, filtered as you type; ArrowUp/Down + Enter commit, Escape or Backspace-on-empty dismiss (`node-content.tsx:95-100`, `node-block.tsx:166-171`, `fields-section.tsx:204-371`).
- Per-field visibility rules (`hideWhen`): `never` | `always` | `when_empty` | `when_not_empty`, applied at render (`fields-section.tsx:35-44`). Unit proof: `field-visibility.test.ts`.

Proof: `outline-editor.spec.ts` — "Fields Display" (:272-289), "field rows display with field bullet icons" (:598-614).

DRIFT: fields-display e2e expects legacy `›` indicator
- canonical: field rows are visible and carry a visible per-type indicator, and the e2e proof passes (`outline-editor.spec.ts:272-289` asserts a `›` glyph inside the first field row).
- current: the implementation renders `FieldBullet` type icons (`bullet.tsx:154-161`) — the design this spec declares canonical — so the test's `text=›` locator finds nothing and the test fails. The test predates the icon design.
- impact: the proof layer is red for a behavior that is (visually) correct; genuine fields-display regressions would be indistinguishable from this stale assertion.
- closes: update the test to assert the `FieldBullet` icon / `data-field-name` instead of `›`. This is the one DRIFT where the fix is to the test, not the code.

## 6. Supertag Interactions

Supertags attach schema to nodes; definitions are themselves nodes tagged `supertag:supertag` (see [./data-model.md](./data-model.md)). Editor constants: `types/outline.ts:50-66`.

- **Add via `#` autocomplete**: typing `#word` at a word boundary in an active node opens an autocomplete anchored at the caret (`node-content.tsx:105-122`); selecting strips the `#query` text from the content and applies the tag (`node-content.tsx:153-187`).
- **Add via command palette**: Cmd+K → "Add supertag" → searchable supertag list (§11).
- **Badges**: compact colored pill after the content text — `text-[11px]`, background at 18% alpha of the tag color (`node-content.tsx:274-330`). Click navigates to the supertag's page; hovering swaps the `#` glyph for an `X` that removes the tag from the node (`node-content.tsx:300-322`). Colors fall back to a deterministic hash of the tag ID when unset (`lib/supertag-colors.ts` via `getSupertagColor`).
- **Configuration (full page)**: zooming into a supertag definition node replaces the outline with `SupertagDetailView` — header (name, color, `Extends` parent pill), a Fields tab (the tag's field schema) and a Settings tab, then a References section listing tagged instances (`supertag-detail-view.tsx:85-187`; dispatch `outline-editor.tsx:456-459,471`). Field definition nodes get the analogous `FieldDetailView` (`outline-editor.tsx:458-459,474`).
- **Configuration (inline popover)**: every supertag badge (`node-content.tsx` `SupertagBadges`) carries `data-supertag-badge={supertagId}` and a hover-revealed gear icon alongside the existing hover-`X` remove affordance. Clicking the gear opens `SupertagConfigPanel` (`supertag-config-panel.tsx`) as a portal-rendered popover anchored at the badge — a compact Fields/Settings tabbed editor (add/remove/retype fields, constraints, color, extends, default child, content template) backed by the same `supertag.server.ts` functions `SupertagDetailView` uses, so edits from either surface stay consistent. This gives quick in-place configuration without leaving the outline, while `SupertagDetailView` remains the full-page editor for deeper work.

Proof: `outline-editor.spec.ts` — "Supertag Display" (:254-270), "Supertag Configuration" (:675-695, now exercises real badges/gear rather than vacuously passing), command-palette supertag step (:555-579).

## 7. Inline Queries & Query Builder

A node is a **query node** when it carries the `supertag:query` tag (`query-helpers.ts:35-37`); its definition is a `QueryDefinition` JSON stored in `field:query_definition` (parsed from string if needed, `query-helpers.ts:41-56`). Query-internal fields (definition/sort/limit) are hidden from the field section (`query-helpers.ts:59-67`, `types/outline.ts:66`).

Behavior (normative):

- Query nodes show the magnifier bullet and, when expanded, a "Configure query" toggle button at the row's right edge (`node-block.tsx:387-406`).
- Results are evaluated server-side (via `evaluateQueryServerFn` → `nodeFacade`, see [../tech/reactivity.md](../tech/reactivity.md)) and cached in TanStack Query keyed by the stringified definition (`query-results.tsx:48-60`, `query-helpers.ts:9-13`).
- Results render between the fields section and real children as **reference rows** — dashed-circle bullet, content, supertag pills — clicking navigates (`query-results.tsx:142-228`). Empty/loading/error/truncation states are explicit (`:110-159`).
- Toggling "Configure query" reveals an inline **QueryBuilder** (imported from `@nxus/workbench`) in compact mode with linter and live result count (`query-results.tsx:90-108`). Edits MUST: update results immediately (local definition state), update the store copy of `field:query_definition` (so collapse/expand re-derives the same definition), and persist via `updateQueryDefinitionServerFn`, then invalidate all query evaluations (`query-results.tsx:65-83`).

Proof: `e2e/editor/query-persistence.spec.ts` (both tests).

DRIFT: query definition edits don't survive collapse/expand
- canonical: change a filter in the inline QueryBuilder → the pill reflects the new filter, results re-evaluate immediately, and after collapsing and re-expanding the query node the changed filter is still shown (`query-persistence.spec.ts:8-105,107-165`).
- current: both tests fail. The write path exists (`query-results.tsx:65-83` mirrors into local state, store, and server), but the round-trip through collapse (which unmounts `QueryResults` and re-derives the definition from `node.fields` via `extractQueryDefinition`) loses the edit — the dual source of truth (`localDef` vs store field vs DB) diverges.
- impact: users lose query edits on collapse; saved query nodes silently revert.
- closes: single source of truth for the definition (store field), verified by the persistence spec passing.

## 8. Backlinks ("References") Panel

Every zoomed-in node view and every supertag detail view ends with a collapsible **References** section (`outline-editor.tsx:504-506`, `supertag-detail-view.tsx:184-187`; component `backlinks-section.tsx`).

- Header: caret + "References (N)" total count; clicking toggles the whole section (`backlinks-section.tsx:49-69`).
- The section body has two independently collapsible top-level groups with counts: **Mentioned (N)** and **Referenced (N)** (`backlinks-section.tsx:78-91,100-151`).
- **Mentioned** is for inline content references. Current storage has no inline-reference relation; the data model only defines supertag assignments and node/nodes field values as reference-bearing properties (`data-model.md:39-44`). Until that model exists, Mentioned renders as an empty subsection (see DRIFT below).
- **Referenced** contains property-backed references. `getBacklinksServerFn` classifies each backlink as `field-value` or `supertag` by inspecting the referencing property's field (`outline.server.ts:585-609`) and returns grouped node rows (`outline.server.ts:665-678`).
- Referenced groups preserve the field-level heading "Appears as *fieldName* in…" with a per-field count; supertag assignment itself is a field group ("Appears as supertag in…") (`backlinks-section.tsx:155-190`).
- Groups show 3 rows initially with "Show N more" / "Show less" (`backlinks-section.tsx:162-219`).
- Each backlink renders as a full reference node row: dashed-circle bullet, node content, supertag pills; click or Enter navigates (`backlinks-section.tsx:231-287`).
- Data is cached 30s per node by the References query (`backlinks-section.tsx:35-39`).

Proof: `outline-editor.spec.ts` — "Backlinks" (`outline-editor.spec.ts:718-880`), especially split-section assertions and Referenced collapse (`outline-editor.spec.ts:780-795`).

DRIFT: inline mentions not representable
- canonical: References.Mentioned lists inline content references where a node's rich/text content contains a reference to the target node.
- current: node references are only property-backed: `field:supertag` assignments and `node`/`nodes` field values (`data-model.md:39-44`). `getBacklinksServerFn` can classify `field-value` and `supertag`, but has no inline mention relation to query (`outline.server.ts:585-609`). The editor renders Mentioned as an empty subsection (`backlinks-section.tsx:78-84,136-140`).
- impact: users see the Tana-style top-level split, but inline mentions cannot appear until the core model can store or derive them.
- closes: define and implement inline content node references in the data model and have `getBacklinksServerFn` emit `inline-mention` groups.

## 9. Zoomed-In Node View (detail screen)

Navigating into a specific node (`?node=<id>`) shows, in order (`outline-editor.tsx:477-509,524-585`):

1. **Title row** — node content as `h1`, left-aligned with `px-2` matching the outline body; a radial gradient tinted by the last supertag's color washes behind the header (`outline-editor.tsx:533-552`).
2. **Supertag badges** below the title, clickable (navigate) with hover-`X` remove (`outline-editor.tsx:555-577`).
3. **Root node fields** — `FieldsSection` at `depth={-1}` so its padding is 0, flush with the title (`outline-editor.tsx:580-582`).
4. **Children** — `NodeBlock`s at `depth={0}`.
5. **References** section (§8).

Title + fields + children MUST share the same left alignment; header padding (`px-2`) matches the outline body padding. If the zoom target is a supertag or field **definition**, the detail views of §6 replace this layout entirely (`outline-editor.tsx:456-474`).

Proof: `outline-editor.spec.ts` — "Zoom/Focus" (:200-251).

## 10. Navigation Model (URL-driven)

All node navigation goes through `useNavigateToNode()` (`hooks/use-navigate-to-node.ts:12-25`):

- Workspace root → `/` (no search param); specific node → `/?node=<nodeId>`. Single route with a `node` search param (`routes/index.tsx`).
- Navigation pushes browser history — bookmarkable, back/forward work; the URL is synced into the store's `rootNodeId` on change (`outline-editor.tsx:59-65`).
- Users of the hook: breadcrumbs, bullet Cmd/Ctrl+click (`node-block.tsx:59-69`), field icon click, supertag badge click, node-reference rows (field values, query results, backlinks), Cmd+. / Cmd+, zoom keys, command-palette Navigate.
- Breadcrumbs show Home + the ancestor chain of the current root; Home returns to the workspace root (`breadcrumbs.tsx`).
- The workspace root `__workspace__` is a **virtual client-side node**: DB top-level nodes have `ownerId = null` and are remapped under it at load (`outline-editor.tsx:124-143`, `types/outline.ts:96`).

Proof: `outline-editor.spec.ts` — "Page Load" (:8-22), "Zoom/Focus" (:200-251).

## 11. Palettes

Two distinct palettes, both portal-rendered, Escape-closable, keyboard-navigable (ArrowUp/Down + Enter):

**Search palette — Cmd+S / Ctrl+S** (`command-palette.tsx`, despite the filename): centered modal with a "Search nodes..." input; 300ms-debounced full-text search (`searchNodesServerFn`, limit 20) with stale-response guarding; results show content + supertag pills; selection navigates (`command-palette.tsx:31-73,150`).

**Node command palette — Cmd+K / Ctrl+K** (`node-command-palette.tsx`): an *inline* palette anchored below the focused node's row (or the focused field row when invoked from one — field context is read from `data-field-row` DOM attributes, `outline-editor.tsx:383-410`). If a node is being edited, Cmd+K first exits edit mode into selection so focus can shift (`outline-editor.tsx:405-410`). Stepped flow (`node-command-palette.tsx:18-22,123-194`):

- root commands: **Add supertag** (→ searchable supertag list, applied to the target node), **Navigate to node** (→ search, navigates), **Move to...** (→ search excluding the node itself and its descendants, reparents; `:259-265`), **Indent**, **Outdent**, **Delete node**; plus **Remove field: X** when field context is present (`:142-156`).
- input placeholder per step: "Type a command..." / "Search supertags..." / "Search nodes..." / "Move under node..." (`:377-384`).
- target resolution: field-context node, else active node, else selected node (`:86`).

Proof: `outline-editor.spec.ts` — "Search Palette (Ctrl+S)" (:436-486), "Command Palette (Ctrl+K)" (:488-580).

DRIFT: command palette fails e2e
- canonical: with a node selected, Cmd+K opens the inline palette (input `placeholder*="command"` visible) showing "Add supertag" and "Delete node"; Escape closes it; selecting "Add supertag" advances to the supertag step with its breadcrumb and `placeholder*="supertag"` input (`outline-editor.spec.ts:489-579`, all four tests).
- current: the four tests fail. The open path requires an `anchorRect` resolved from `[data-node-id] .node-row` after the capture-phase handler flips state (`node-command-palette.tsx:89-121,375`); the palette does not become visible/focused under the tests' selection-mode flow.
- impact: the palette — the primary mouse-free entry to supertags, move, and delete — is unverified and likely broken from selection mode.
- closes: make Cmd+K from selection mode reliably render + focus the palette; four green tests.

## 12. Views (view-as)

Any node with children can render them as **outline** (default), **table**, **kanban**, **cards**, or **list** via the `ViewToolbar` shown above its children (`node-block.tsx:438-479`; renderers `table-view.tsx`, `kanban-view.tsx`, `cards-view.tsx`, `list-view.tsx`). The choice and its configuration persist as hidden node fields `field:view_as` and `field:view_config` (JSON), debounced 300ms on config writes (`node-block.tsx:107-164`). Grouping/column options are derived from the union of the children's fields (`node-block.tsx:323-333`). Hidden system fields (view state, OAuth token fields) are excluded from field rows by `HIDDEN_FIELD_SYSTEM_IDS` (`types/outline.ts:102`).

Proof: `outline-editor.spec.ts` — "View Switching" (:582-614).

---

## Proof-layer map

| Behavior cluster | e2e suite (file : describe) | Status |
|---|---|---|
| Page load, breadcrumbs, body | `outline-editor.spec.ts` : Page Load | passing |
| Node rendering, bullets | : Node Rendering | passing |
| Activate/type/deactivate | : Node Activation & Editing | passing |
| Enter/Escape/arrows | : Keyboard Operations | passing |
| Collapse/expand | : Collapse/Expand | passing |
| Zoom + breadcrumb Home | : Zoom/Focus | passing |
| Supertag badges | : Supertag Display | passing |
| **Fields display** | : Fields Display | **failing — DRIFT §5** |
| Node splitting | : Node Splitting | passing |
| **Multi-select** | : Multi-Node Selection (3) | **failing — DRIFT §4** |
| Search palette | : Search Palette (Ctrl+S) | passing |
| **Command palette** | : Command Palette (Ctrl+K) (4) | **failing — DRIFT §11** |
| View toolbar / field bullets | : View Switching | passing |
| **Move down** | : Keyboard Shortcuts (move, undo) | **failing (move) — DRIFT §4** |
| Undo | : Keyboard Shortcuts (move, undo) | passing client-side; persistence drift owned by [../tech/editor-sync.md](../tech/editor-sync.md) |
| Supertag config gear | : Supertag Configuration | passing (wired, §6) |
| **Backlinks** | : Backlinks (3) | **failing — DRIFT §8** |
| Empty node → Enter | : Empty Node — Press Enter to Write | passing |
| **Query persistence** | `query-persistence.spec.ts` (2) | **failing — DRIFT §7** |
