# Tana ↔ nxus Feature-Parity Report — 2026-07-10

**Purpose**: a durable parity checklist the maintainer can track against release-over-release. Every row states what Tana Outliner ships, whether nxus has it today, and the exact evidence path — so this doc can be re-diffed later without re-deriving the research.

**Sources**:
1. `tana-features.md` (scratchpad) — exhaustive Tana feature inventory from a live crawl of Tana's official docs hub (43 pages, `outliner.tana.inc/learn/*`), crawled 2026-07-10.
2. `nxus-features.md` (scratchpad) — nxus capability inventory compiled against `spec/product/`, `spec/tech/`, and code under `libs/`, `apps/`, with `path:line` citations.
3. `surreal-ground-truth.md` (scratchpad) — repo ground truth on SQLite (node-mode) vs SurrealDB (graph-mode) backend completeness, used for the "backend caveat" column/section below.

**Status legend**: ✅ have · 🟡 partial · ❌ absent · 📄 specced-only (schema/doc exists, no consuming code) · *not assessed* (nxus-features.md doesn't cover this Tana feature — silence is not a claim of absence).

**Reading note**: every row's Evidence column quotes the nxus-features.md citation verbatim (which itself cites spec/code `path:line`). Rows marked *not assessed* are honest gaps in the inventory, not asserted absences — do not read them as ❌.

---

## THE MATRIX

### Data model

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Node: permanent unique ID at creation | ✅ | "Single `nodes` table (id, content, ...)" — `node-schema.ts:15-36` (§0 row 1) | |
| Node: single parent/owner location (`ownerId`) | ✅ | "`ownerId` parent/child outline hierarchy" (§0 row 3) | Tana's exception (reference nodes have no owner) matches nxus references, which live in `node_properties`, not `ownerId`. |
| Node: atomicity (disallows line breaks) | *not assessed* | — | |
| Node: rich inline formatting (bold/italic/underline/strikethrough/code/highlight) | *not assessed* | — | |
| Node: file attachments (image/video/audio/PDF drag-drop) | *not assessed* | — | |
| Node customization: banners, icons | *not assessed* | — | |
| Node customization: default child supertag | ✅ | "`field:default_child_supertag` system field" (§2 row "Default child supertag") | |
| Node customization: pagination triggers | *not assessed* | — | |
| Node ops: lock/unlock | *not assessed* | — | |
| Node ops: indent/outdent | ✅ | "full key tables `spec/product/editor.md:63-101`" (§10 "Keyboard navigation") | |
| Node ops: view edit history | *not assessed* | — | |
| Node ops: merge duplicate nodes | *not assessed* | — | |
| Contextual content nodes (diamond annotations) | *not assessed* | — | |
| Automation hooks: child-added/child-removed node events | ❌ | Triggers are "query-membership (onEnter/onExit/onChange), threshold" only (§7 row 2) — no node-lifecycle-event trigger kind found | nxus automation is query/threshold-driven, not node-event-driven — a different automation primitive than Tana's. |
| Syntax: Enter=new sibling, `/`=creation menu | *not assessed* | — | |
| Node type: Plain (bullet iconography) | *not assessed* | — | |
| Node type: Reference (dashed outline) | 🟡 | inline mentions "rendered as clickable chips" (§4 row 2) | Chip rendering exists; distinct dashed-bullet iconography not confirmed. |
| Node type: Search node (magnifying glass, live query) | ✅ | "Saved query nodes ... tagged `supertag:query`" (§3 row 4) | |
| Node type: Entity node (supertagged page/doc) | ✅ | "Supertag creation mechanism" (§2 row 1) — any tagged node functions as an entity | |
| Node type: Contextual content node (diamond) | *not assessed* | — | |
| Node type: Supertag definition node (hashtag-in-circle) | ✅ | "`#Supertag` is itself tagged `#Supertag`" (§2 row 1) | |
| Node type: Field definition node | ✅ | Field system §1 — system fields defined as nodes via `node-schema.ts` | |
| Node type: Field (value) node | ✅ | "field-value.tsx renders per-type" (§1 row 1) | |
| Node type: Command node (">_" dashed circle) | 🟡 | "Automation nodes (trigger → action rules)" (§7 row 1) | Conceptually similar container, but no visual "command node" bullet or node-button/supertag-button triggers confirmed. |
| Node type: URL node | 🟡 | `url` FieldType exists (§1 row 1) | Field-level only, not a distinct node kind. |
| Node type: Code node | *not assessed* | — | |
| Node type: Workspace node (rainbow halo) | *not assessed* | — | |
| Node type: Audio/Video/Image nodes | *not assessed* | — | |
| Node type: Embedded link nodes (YouTube/Vimeo/Figma/etc.) | *not assessed* | — | |
| Node type: Unavailable node ("prohibited" bullet) | *not assessed* | — | |
| Node type: External alias node (cross-workspace) | *not assessed* | — | |
| Node type: Keyboard-shortcut node | *not assessed* | — | |
| Outline editor: structural roots (Home/Library/Calendar) | 🟡 | "Workspace root ... client-side only ... remapped to a virtual `__workspace__` node id" (§0 row 5) | No explicit Library/Calendar root nodes found distinct from the calendar app. |
| Outline editor: expand/collapse | *not assessed* | — | |
| Outline editor: indent/outdent | ✅ | same as "Node ops: indent/outdent" above | |
| Outline editor: move via DnD / keyboard / move-to menu / cut-paste | 🟡 | command palette has "move-to" (§7 row "Editor node-command-palette") | Move-to confirmed; drag-and-drop and cut/paste not assessed. |
| Outline editor: breadcrumbs | *not assessed* | — | |
| Outline editor: multi-axis structuring (hierarchy+time+type+attributes together) | ✅ | composite: hierarchy=`ownerId` (§0), type=supertags (§2), attributes=fields (§1), time=date field+calendar app (§6) | All four axes independently confirmed present; not confirmed as a single unified UI concept the way Tana frames it. |

### Fields & types

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Inline field creation via `>` syntax | *not assessed* | — | |
| Field config: Required (visual warning) | ✅ | "required-but-empty fields tint label red with warning icon" (§1 row "Field 'required' constraint") | |
| Field config: Hide field (Never/When empty/When not empty/When default/Always) | 🟡 | `hideWhen`: never/always/when_empty/when_not_empty (§1 row "Field visibility rules") | nxus has 4 of Tana's 5 states — missing "When default." |
| Field config: AI-enhanced autofill | ❌ | "no AI hooks found in `apps/nxus-editor/src` or `libs/nxus-db`" (§8 row 4) | |
| Field config: commands triggered on field button press | *not assessed* | — | |
| Field config: pagination page size | *not assessed* | — | |
| Field config: "Part of" semantic relationship | *not assessed* | — | |
| Field config: audio-enabled transcription capture | *not assessed* | — | |
| Pinned fields | *not assessed* | — | |
| Field type: Plain (text) | ✅ | `FieldType` includes `text` (§1 row 1) | |
| Field type: Options (dropdown) | ✅ | `select` type (§1 row "Options/select field type") | |
| Field type: Options from supertag | ✅ | `instance` field type — "options are nodes with the supertag named by `field:instance_supertag`" (§1 row 2) | |
| Field type: Date | ✅ | `date` FieldType, "native date picker" (§6 row 1) | |
| Field type: Number (min/max, table column calcs) | 🟡 | `number` FieldType exists (§1 row 1) | Min/max validation and table-column calculations (Sum/Avg/Median/Min/Max/Count) not found in the inventory. |
| Field type: Tana user (references workspace member) | ❌ | "no `user` FieldType literal exists; only generic `node`/`nodes` reference types" (§1 row 2) | |
| Field type: URL | ✅ | `url` FieldType (§1 row 1) | |
| Field type: Email | ✅ | `email` FieldType (§1 row 1) | |
| Field type: Checkbox (toggle) | ✅ | `boolean` type, "toggle switch UI" (§1 row 2) | See separate three-state-checkbox row below — this is the field-type match, not the todo-state match. |
| Auto-init: inherit ancestor's identical field / nearest-ancestor-match / random-match / current-date / ancestor-Day-node-date / current-user (6 variants) | 🟡 | field default values declared on supertag node (§1 row "Field default values"); `content_template` JSON (§2 row "Content template") | nxus has *static* default values + a content-template mechanism, not Tana's 6 dynamic per-application auto-init rules; different mechanism, partial functional overlap. |
| "Part of" semantic function + `COMPONENTS REC` recursive query | *not assessed* | — | |
| Checkboxes: three states (no checkbox / not done / done) | 🟡 | `boolean` type is a 2-state toggle (§1 row 2) | Tana's is a 3-state marker (absent/unchecked/checked); nxus boolean is binary only. |
| `toggle-done` command | *not assessed* | — | |
| Child auto-inherits checkbox under checked parent | *not assessed* | — | |
| `Find todos within →` command / `TODO`,`NOT DONE`,`DONE`,`DONE LAST X DAYS` search operators | ❌ | query operators list has no TODO-state keywords (§3 row 2); relative-date/keyword search literal absent (§3 row "Relative date support") | |
| System fields Done (boolean) / Done time (timestamp) | *not assessed* | — | |
| Progress bars (auto-aggregate completion) | *not assessed* | — | |
| Progress bars in published output | *not assessed* | — | |

### Supertags

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Supertag creation (`#tagname`) | ✅ | "supertag definitions are ordinary nodes tagged `#Supertag`" (§2 row 1) | |
| Template system (auto-populate default fields/children/values) | ✅ | `field:content_template` (§2 row "Content template") | |
| Pinned fields (config) | *not assessed* | — | |
| Contextually-suggested optional fields | *not assessed* | — | |
| 12 preset colors + colorless | 🟡 | "deterministic hash-based fallback color, config panel color picker" (§2 row "Supertag color/badge styling") | Color picker confirmed; 12-preset-palette parity not confirmed. |
| Extended supertags (inheritance, multi-parent DAG) | ✅ | `field:extends`, "multiple parents allowed, cycle-safe BFS ... first-declaration-wins" (§2 row "Tag-to-tag inheritance") | |
| Base-type assignment (13 predefined categories: Meeting/Task/Person/Location/Project/etc.) | 🟡 | `BaseTypeSchema = z.enum(['task','person','event','day','flashcard'])` — 5 values (§2 row "Base-type concept") | nxus has 5 base types vs Tana's 13, and "only `task`/`event` have consuming code found" beyond schema (§2 row "person/day/flashcard wired into engine behavior") — `person`/`day`/`flashcard` are 📄 specced-only. |
| Default child supertags applied to descendants | ✅ | `field:default_child_supertag` (§2 row 4) | |
| Customizable related-content sections | *not assessed* | — | |
| Search nodes embedded in templates ("related items" lookup) | *not assessed* | — | |
| Title expressions (`${field name}` → displayed title) | *not assessed* | — | |
| AI & automation hooks on supertags (autofill, transcription, command buttons, tag-added/removed event commands, AI object-ID instructions, voice-chat config) | ❌ | AI confined to nxus-recall, none in editor/supertag layer (§8 row 4); no tag-added/removed trigger kind found (§7 row 2) | |
| Supertag removal (hover+x / right-click) | *not assessed* | — | |
| `#` filter in search / `@#` supertag-definition reference | *not assessed* | — | |

### Search/Query

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Search nodes (live query, results are references) | ✅ | "Live (reactive) queries ... dependency-tracked smart invalidation" (§3 row 3) | |
| Query builder (compose conditions, implicit top-level AND) | ✅ | `QueryDefinition = { filters[], sort?, limit }`, "top-level filters AND-combined" (§3 row 1) | |
| Result cap (2,500 max) / pagination default 100 | *not assessed* | — | |
| Query linter (compiled pseudocode display) | *not assessed* | — | |
| Reference/type filters (descendant, supertag, field-def/value, plain-text, date, regex) | 🟡 | operators: `supertag`, `property` (eq/neq/gt/gte/lt/lte/contains/startsWith/endsWith/isEmpty/isNotEmpty), `path`, `content`, `relation`, `temporal`, `hasField` (§3 row 2) | Covers most of this row; a dedicated regex operator not confirmed. |
| Checkbox/state keywords (`TODO`,`DONE`,`NOT DONE`,`OVERDUE`,`DONE LAST N DAYS`) | ❌ | no TODO-state keywords found (§3 row 2) | |
| Temporal keywords (`CREATED/EDITED LAST N DAYS`, `EDITED BY`, `FOR DATE`, `FOR RELATIVE DATE`) | 🟡 | `temporal` filter supports `createdAt`/`updatedAt` `withinDays`/`before`/`after` (§3 row 2) | Covers the "LAST N DAYS" shape; "EDITED BY [email]" and "FOR RELATIVE DATE [term]" absent — "no relative-keyword literal type found" (§3 row "Relative date support"). |
| Node-kind keywords (`IS TAG`/`IS FIELD`/`IS CALENDAR NODE`/`IS SEARCH NODE`/`IS COMMAND`/`IS PUBLISHED`/`IS CHAT`/`IS ENTITY`) | *not assessed* | — | |
| Content keywords (`HAS FIELD`/`HAS TAG`/`HAS MEDIA`/`HAS AUDIO`/`HAS VIDEO`/`HAS IMAGE`) | 🟡 | `hasField` operator exists; `supertag` operator covers `HAS TAG` (§3 row 2) | `HAS MEDIA`/`AUDIO`/`VIDEO`/`IMAGE` not assessed. |
| Scope keywords (`PARENTS DESCENDANTS`/`IN LIBRARY`/`ON DAY NODE`/`SIBLING NAMED`) | 🟡 | `relation` operator (childOf/ownedBy/linksTo/linkedFrom) (§3 row 2) | Partial descendant-scoping overlap; `IN LIBRARY`/`ON DAY NODE`/`SIBLING NAMED` not assessed. |
| Field/logic operators (`>AND`/`>OR`/`>NOT`/`>LT`/`>GT`/`>LINKS TO`/`>CHILD OF`/`>OWNED BY`/`>COMPONENTS REC`/`>DATE OVERLAPS`) | 🟡 | `and`/`or`/`not` operators exist; `relation` (childOf/ownedBy/linksTo/linkedFrom) maps to `CHILD OF`/`OWNED BY`/`LINKS TO` (§3 row 2) | `COMPONENTS REC` (recursive part-of) and `DATE OVERLAPS` not assessed — no "Part of" relation type found in inventory to hang `COMPONENTS REC` on. |
| Field-value tokens (`PARENT`/`GRANDPARENT` dot notation, `Set`/`Not Set`/`Defined`/`Not Defined`) | 🟡 | `path` operator ("chained reference field comparison") (§3 row 2) | Plausible conceptual overlap with `PARENT`/`GRANDPARENT`; `isEmpty`/`isNotEmpty` overlaps `Set`/`Not Set` semantics but literal tokens not confirmed. |

### References

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Reference = editable mirror sharing source ID | ✅ | "Backlinks (derived, not stored) ... computed by reverse lookup on property `value`" (§4 row 3); `node`/`nodes` field types (§4 row 1) | |
| Inline references (`@`-mention, copy-paste, select-text) | ✅ | `[[node:<uuid>]]` inline mentions, "clickable chips, `[[`-triggered `MentionAutocomplete`" (§4 row 2) | Node-mode only — see Backend caveat section. |
| Unlinked mentions (contextual surfacing without formal link) | *not assessed* | — | |
| Reference counter (place count) | *not assessed* | — | |
| Alias (rename inline-reference display without renaming source) | *not assessed* | — | |
| Merging duplicate nodes | *not assessed* | — | |
| Deleting reference vs. deleting source (non-destructive vs. cascading) | *not assessed* | soft-delete exists generally (§0 row "Soft-delete") | The specific ref-vs-source delete distinction isn't directly evidenced; soft-delete is a related but not identical mechanism. |
| Backlinks (derived reference counting, panel UI) | ✅ | "Backlinks panel with Mentioned vs Referenced grouping, per-field headings, show-more" (§4 row 4) | |

### Views

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Outline view (default; filter/sort/group/display) | ✅ | "outline (default)" (§5 row 1) | |
| Table view (columns=fields, column calcs) | 🟡 | `table-view.tsx` (§5 row 1) | Column calculations (Sum/Avg/Median/Min/Max/Count) not confirmed. |
| Cards view (groupable, drag-to-update) | ✅ | `cards-view.tsx` (§5 row 1) | |
| List view (two linked panels) | 🟡 | `list-view.tsx` (§5 row 1) | Two-linked-panel layout not confirmed specifically. |
| Calendar view (month/week/day, plots by date field) | ✅ | separate `nxus-calendar` app, `CalendarViewSchema = z.enum(['day','week','month','agenda'])` (§5 row 2) | |
| Side menu view | *not assessed* | — | |
| Tabs view | ❌ | "not in the 5 view renderers found (outline\|table\|kanban\|cards\|list); no 'tabs' view renderer located" (§5 row 4) | |
| View options (Filter/Sort/Group/Display/Pagination, 2,500 cap) | 🟡 | filter/sort exist at the query layer generally (§3) | Pagination default and 2,500-result cap specifics not assessed. |
| View config persistence per node | ✅ | `field:view_as` + `field:view_config` (JSON), debounced 300ms (§5 row 3) | |
| Content width (Auto/Medium/Full) / "Save for everyone" | *not assessed* | — | |
| *(nxus-only addition: kanban view)* | n/a | `kanban-view.tsx` (§5 row 1) | Not in Tana's documented view set — a nxus extension, not a gap. |

### Dates/Calendar

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Date objects (`@`-entry, granularities 5min→year, date-picker shortcuts, negative/BCE years, ranges) | 🟡 | `date` FieldType, "native date picker" (§6 row 1) | Natural-language `@`-entry, granularity shortcuts, BCE years, and ranges not assessed. |
| Calendar nodes (auto-generated Day/Week/Month/Year pages, references section, custom templating, breadcrumb nav) | 📄 | "`day` is a valid `BaseType` enum value ... but no code implementing 'day node' (daily-note-style) semantics was found" (§6 row 3) | Week/Month/Year auto-generated pages not assessed / likely absent — only `day` has a schema slot. |
| System fields Created time / Last modified time / Done time (read-only) | *not assessed* | nodes have `createdAt`/`updatedAt` generally (§0 row 1) | Named read-only "system field" exposure and `Done time` specifically not confirmed. |
| Per-workspace timezone + per-user 12h/24h + week-start-day preference | *not assessed* | — | |
| Daily notes (dedicated per-day capture page) | 📄 | same evidence as "Calendar nodes" row — `day` base type is schema-only | |
| Google Calendar sync (Tana: one-way *pull*, events→daily notes) | 🟡 | "one-way push implemented (`syncToGoogleCalendarServerFn`); pull converter exists but unused" (§6 row 4) | Direction differs: nxus pushes nxus→Google; Tana's documented flow pulls Google→Tana. Both are one-way, but in opposite directions — recorded DRIFT either way. |
| Auto event→supertag classification (Meeting/Block/Task/etc. by attendee count + keywords) | *not assessed* | — | |
| Meeting-detection desktop notifications | *not assessed* | — | |

### Commands/Automation

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Command line (Cmd/Ctrl+K, fuzzy search, custom shortcuts) | ✅ | "Cmd+K): add supertag, navigate, move-to, indent/outdent, delete, remove-field" (§7 row 5) | |
| "Remind me" (schedule node to a date) | *not assessed* | — | |
| "Find nodes" guided query-builder command | *not assessed* | QueryBuilder UI exists generally (§3 row "Query builder UI") | Not confirmed as reachable via a command-line "Find nodes" entry specifically. |
| "View as" command | 🟡 | `ViewToolbar` view-switching exists (§5 row 1) | Command-palette-specific reachability not confirmed. |
| "Move to" command | ✅ | command palette "move-to" (§7 row 5) | |
| Command nodes (chainable automation containers) | ✅ | "Automation nodes (trigger → action rules)" — `supertag:automation`, `field:automation_definition` (§7 row 1) | |
| Command triggers: command-line / supertag buttons / node buttons / node events (child-added/removed, tag-added/removed) | 🟡 | triggers are "query-membership (onEnter/onExit/onChange), threshold" only (§7 row 2) | No supertag-button, node-button, or node/tag-lifecycle-event trigger kind found — different trigger vocabulary from Tana's. |
| Built-in system commands (move/clone/fields/set-values/set-done/tags/view-config/alerts/confirm/parallel/bulk-apply/CLI/HTTP) | 🟡 | actions: `set_property`, `add_supertag`, `remove_supertag`, `create_node` (schema-only), `webhook` (§7 row 3) | Narrower action set than Tana's; `create_node` is 📄 specced-only — "schema-only, not executable ... `executeAction` has no branch." |
| Node filter parameter (restrict command by query expression) | *not assessed* | — | |
| Infinite-loop safety valve (60s re-trigger detection, disables event system) | 🟡 | "Cycle guard (depth cap 10 + per-chain node dedup)" (§7 row 4) | Different mechanism (static depth cap vs. time-windowed re-trigger detection) serving the same purpose. |
| Keyboard shortcuts (8 categories, `record-shortcut` custom bindings) | ✅ | full key tables, multi-select Shift+Arrow, etc. (§10 rows 1-3) | Custom-binding/`record-shortcut` mechanism specifically not confirmed. |

### AI

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Tana AI umbrella (multi-provider chat/meetings/voice/commands, credit system) | ❌ | "AI integration is scoped entirely to `nxus-recall` ... no AI hooks found in `apps/nxus-editor/src` or `libs/nxus-db`" (§8 row 4) | |
| Image generation (banner/inline/command-line) | *not assessed* | — | |
| AI Chat (node-scoped context, `@`-mention pull, model choice, edit/branch/rerun, prompt caching) | ❌ | same evidence as "Tana AI umbrella" row | |
| AI Agents (custom personas, model/temp/system-prompt, startup modes) | ❌ | same evidence | |
| AI Command Nodes (Ask AI streaming/non-streaming, image gen, transcription, autotagging, arbitrary API exec, meeting-bot deploy, Prompt Workbench) | ❌ | same evidence — automation's `create_node` action stub is unrelated (non-AI) | |
| AI for Builders (`ai:` syntax, AI-enhanced-field toggle, autotag, embedding clustering) | ❌ | same evidence; "AI-enhanced autofill" field config also absent (Fields section) | |
| Tana Meeting Notetaker (botless, system-audio capture, live transcription) | *not assessed* | — | No meeting/audio-capture feature described anywhere in the inventory — silence, not a denial. |
| Meeting Agent (in-call bot, post-meeting processing, calendar auto-invite) | *not assessed* | — | |
| Live Voice Transcription (dictation) | *not assessed* | — | |
| Mobile Voice Memos / Voice Chat | *not assessed* | — | |
| *(nxus-only capability: AI review-question generation, concept extraction, answer evaluation in nxus-recall)* | n/a | `generate-question.server.ts`, `extract-concepts.server.ts`, `evaluate-answer.server.ts` via `@nxus/mastra` (§8 rows 1-3) | Real AI capability, but scoped to the recall/flashcard lens — no direct Tana feature-page equivalent; not counted toward parity. |

### Import/Export

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Tana Paste (plaintext clipboard format: `%%tana%%` header, bulleted nodes, `[[refs]]`, `Field:: value`, `#tags`, dates, checkboxes, URLs, views, search blocks, formatting, media) | ❌ | "grepped `tana intermediate\|tana paste\|TIF\b` ... zero matches in the nxus repo itself" (§9 row 1) | Maintainer's framing: Tana Paste and TIF serve the *same interchange role* — treat as one gap, not two. |
| Tana Intermediate Format (TIF, open-source JSON interchange) | ❌ | same evidence (§9 row 1) | See note above — same underlying gap as Tana Paste. |
| Import Data into Tana (native Notion/Roam/Logseq/Workflowy importers) | ❌ | "no outline-level content import/export feature found" (§9 row 2) | |
| Copy/Paste and Export (copy-ref vs. duplicate, copy variants, MD/JSON/HTML export, paste-from-Sheets) | ❌ | same evidence (§9 row 2) | |
| Input API (write-only JSON HTTP API for programmatic node creation) | *not assessed* | — | nxus has internal server functions (`*ServerFn`) but no public write API was evidenced either way. |

### Publishing

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Tana Publish (public account-free page: Outliner View + Article View) | *not assessed* | — | No publish/share/public-page feature discussed anywhere in the inventory. |
| Password protection for published pages | *not assessed* | — | |
| SEO / indexing controls | *not assessed* | — | |
| Publish constraints (5,000-node cap, Article View formatting modes) | *not assessed* | — | |

### Misc

| Tana feature | Status | Evidence (nxus-features.md) | Notes |
|---|---|---|---|
| Workspaces (switching, sharing/collaboration, permissions, structural roots, MD/JSON export, edit history, notifications) | *not assessed* | see "structural roots" row in Data model (§0 row 5) | No multi-workspace/sharing/permissions feature found; nxus's single implicit workspace root is the only overlapping fact in the inventory. |
| Sidebar (Today/Global Search/Supertags/AI chats/Pinned/Workspaces, Recents) | *not assessed* | — | |
| Navigation (zoom in/out, global search `Cmd+S`, connection-based nav, panels, tabs, breadcrumbs) | 🟡 | command palette includes "navigate" (§7 row 5) | Zoom in/out, global search shortcut, panels, and breadcrumbs not assessed. |
| Related content (floating panels: search nodes / references, `PARENT` scoping) | *not assessed* | backlinks panel is a partial analog (§4 row 4) | Backlinks panel surfaces related references, but is not the same configurable per-supertag/per-node "related content" mechanism Tana describes. |
| Account settings (billing, workspace mgmt, preferences, dev API tokens, Labs flags) | *not assessed* | — | |
| Templates (template store bundling supertags+fields+commands+search+views; extensions) | *not assessed* | — | |
| Tana for Desktop (native app, offline mode, Global Clipper, native tabs) | *not assessed* | — | |
| Tana Mobile (iOS/Android capture app) | *not assessed* | — | |
| Tana Capture (deprecated predecessor) | *not assessed* | — | n/a on Tana's side too (deprecated). |

---

## Known nxus discrepancies to carry

These are explicit, previously-recorded DRIFTs that this report re-surfaces because they materially affect parity claims above:

1. **Relative-date query keywords absent** — `temporal` filter supports only `withinDays`/`before`/`after` against absolute dates; no `today`/`thisWeek`/relative-date literal exists (nxus-features.md §3 "Relative date support in queries"). Affects the Search/Query matrix rows for temporal keywords and node-kind date scoping.
2. **Tabs view absent** — no "tabs" view renderer exists among nxus's 5 (outline/table/kanban/cards/list) (nxus-features.md §5 row 4).
3. **Daily-note "day" concept specced-only** — `day` is a valid `BaseType` enum value with no consuming (daily-note-style) code found (nxus-features.md §6 row 3).
4. **`create_node` automation action specced-only** — defined in the automation schema but `executeAction` has no branch for it; comment reads "Future: create_node action" (nxus-features.md §7 row 3, `automation.service.ts:300,543`).
5. **Undo field/supertag persistence partial** — structural undo (create/delete/restore/content/reorder/reparent) persists server-side; field/supertag-change diffs are detected but not persisted to DB (nxus-features.md §10 row 1, `spec/tech/editor-sync.md:103-108`).
6. **Two-way calendar sync drift** — nxus implements one-way *push* (nxus→Google); a pull converter exists in code but is unused/unwired (nxus-features.md §6 row 4). Note this is the *inverse* direction from Tana's documented one-way *pull* (Google→Tana daily notes) — both are one-way, but neither today matches the other's direction, let alone true two-way sync.
7. **Mention reconciliation node-mode-only** — `[[node:<uuid>]]` inline-mention extraction/reconciliation runs in `node.service.ts`'s `createNode`/`updateNodeContent`, called only by the SQLite/node-mode backend; the SurrealDB/graph-mode backend's equivalent methods never populate `field:mentions` (nxus-features.md §4 row 2; `spec/product/editor.md:213-217`).

---

## RANKED GAP LIST

Ranked by (a) centrality to "Tana-ness" — weighted toward the primitives the core doc pages treat as foundational (supertags, fields, nodes/references, daily notes, command line/nodes, views, search, dates/calendar) over peripheral features (publishing, mobile apps, account settings) — and (b) how heavily the maintainer's actual workspace leans on the gap: heavy supertag-inheritance hierarchies (`S:*`/`P:*`/`MoC:*`, `Friend→Person`), command nodes (utility command, Date Changer), weekly/daily calendar tags (`week`, `year`, `for week`), flashcards/decks, and todo states.

1. **Tana Paste / TIF import-export (❌ absent)** — zero interchange-format code found anywhere in the repo. This is the single largest usability gap for a maintainer who wants to move content in and out of nxus the way they do with Tana today; Tana Paste and TIF are, per the maintainer's own framing, "technically the same" interchange role, so this counts as one gap, not two — and it should be fixed once, not twice.
2. **Command nodes / automation gaps (🟡 partial)** — nxus has automation nodes but with a materially different trigger model (query-membership/threshold only, no node-events, no supertag/node-button triggers) and a narrower action set (no move/clone/set-done/set-view-config/HTTP actions; `create_node` is a stub). Directly blocks recreating "utility command" / "Date Changer" style command-node workflows.
3. **Todo states / three-state checkboxes + TODO search keywords (🟡/❌)** — nxus's `boolean` field is a 2-state toggle, not Tana's 3-state (none/not-done/done) marker, and `TODO`/`DONE`/`NOT DONE`/`DONE LAST X DAYS` search operators don't exist. The maintainer explicitly relies on todo states.
4. **Daily/weekly calendar-node templating (📄 specced-only)** — `day` base type has no consuming code; `week`/`year` auto-generated calendar nodes and custom-supertag daily/weekly templating aren't evidenced at all. Directly blocks the maintainer's `week`/`year`/`for week` tag workflows.
5. **Base-type enum narrower + partially wired (🟡 partial)** — 5 base types (`task`/`person`/`event`/`day`/`flashcard`) vs. Tana's 13, and only `task`/`event` have consuming engine code beyond the schema; `person` is specced-only. This directly limits the maintainer's `Friend→Person`-style base-type-driven behavior.
6. **Flashcards/decks base-type wiring (📄 specced-only)** — `flashcard` is a schema value with "no code path found gating on ... `flashcard` base type specifically (recall's Bloom-level cards use their own supertag machinery, not `base_type`)." The maintainer is a heavy flashcards/decks user; the base-type integration point they might expect isn't there (recall has its own separate mechanism).
7. **Relative-date query keywords (❌ absent)** — no `today`/`thisWeek`/relative-date construct in the query DSL. This blocks natural "show me this week's tasks" query patterns the maintainer's calendar-tag-heavy workflow would want.
8. **Two-way / correctly-directioned calendar sync (🟡 partial, wrong-direction)** — nxus pushes nxus→Google one-way; Tana pulls Google→nxus one-way. Neither matches true 2-way sync, and the maintainer's weekly/daily calendar-tag usage depends on calendar data flowing in both directions reliably.
9. Supertag AI/automation hooks (autofill, event-triggered commands, tag-added/removed triggers) — ❌ absent, but lower priority than 1-8 since the maintainer's stated usage doesn't foreground AI-in-editor.
10. Tana AI umbrella generally (chat/agents/AI-command-nodes/meeting tools) — ❌ absent from the editor entirely (confined to nxus-recall); large surface area but not central to the maintainer's stated day-to-day workflow.
11. "Part of" semantic relationship + `COMPONENTS REC` query — not assessed / likely absent; would matter only if the maintainer builds strict single-parent trees (geography/org-chart style), which isn't part of the stated usage.
12. Tabs view — ❌ absent; low priority, no stated maintainer dependency on tabbed per-node views.
13. Publishing (Tana Publish) — not assessed at all; no stated maintainer dependency on public web pages.
14. Mobile/Desktop-app-specific features (Global Clipper, voice memos, native tabs) — not assessed; out of scope for a local-first single-repo comparison.

---

## Backend caveat

Many ✅/🟡 rows above are proven only in **node/SQLite mode** (`ARCHITECTURE_TYPE` unset or anything other than `'graph'`), which is nxus's documented primary/default mode (`spec/tech/persistence.md:114`: "`node` mode is primary. All features MUST work in node mode."). The maintainer's stated canonical *target* backend is SurrealDB (`graph` mode), which `surreal-ground-truth.md` estimates at **≈35-40% functional completeness** relative to node mode for running the actual apps.

Specifically absent or degraded in graph/Surreal mode, per `surreal-ground-truth.md`:
- **No transactions / no atomic writes** — `grep -c "transaction" surreal-backend.ts` → 0 matches; every mutating method emits its event bus notification synchronously *inside* the mutation rather than after commit (§2 "Transactions, post-commit events...").
- **Mention reconciliation is node-mode only** — confirmed above as discrepancy #7; under `ARCHITECTURE_TYPE=graph`, inline mention chips render but `field:mentions` never populates (`spec/product/editor.md:213-217`).
- **Formula fields entirely missing** — "no `formula-evaluator` import or equivalent in `surreal-backend.ts`" (§2 table).
- **Base-type resolution entirely missing** — not on the `NodeBackend` interface at all; `e2e/calendar/supertag-base-type.spec.ts:29` explicitly skips in graph mode ("Calendar base-type resolution is implemented for node-mode storage").
- **No assembly cache / no frontier-batched tree load** — these are the perf primitives most of the editor's tree/reorder/reparent code depends on; they're SQLite/node-mode-only, and much of the app still imports the sync SQLite API directly rather than routing through `nodeFacade`, so "even a perfectly complete `SurrealBackend` could not currently power the full app" (§5 "Bottom line").
- **Calendar events and inbox item properties are e2e-skipped outright in graph mode** — `e2e/calendar/{task-management,calendar-view,event-crud}.spec.ts` and `e2e/core/inbox.spec.ts` all `test.skip(isGraphMode, ...)`.
- **Query evaluator is a divergent full-scan reimplementation** — no supertag-seeding optimization, not shared code with the SQLite path (§2 table, `evaluateQuery` row).

Net: none of the last three hardening/correctness commits on this branch (`9657c43`, `1466e24`, `2a25f2e`) touched `surreal-backend.ts`, `surreal-schema.ts`, `graph-client.ts`, or `migration.ts` — all landed in the SQLite path only (`surreal-ground-truth.md` §3). The maintainer's belief that SurrealDB is canonical does not currently match either the spec's explicit decision record or the code.
