# Editor UX Rules (nxus-editor)

## Core Principle: The Unified Plane

Everything in the outline — nodes, fields, field values — lives on the same visual plane. There is no distinction between "a node's content area" and "a field's content area." They are all text on the same slate. If you can click and edit a node's content in the outline, you can click and edit a field's value the same way.

## Node Rows

- Use `items-start` (not `items-center`) on node rows so the bullet aligns with the **first line** of text. Multiline content flows downward from the bullet.
- Bullet: `h-6 w-6` (24px), centered dot/icon within.
- Content: `text-[14.5px] leading-[1.6]`, `min-h-6` (24px — matches bullet height so midlines align).
- Supertag badges render inline after the content text, same line.

## Field Rows

Fields sit at one indent deeper than their parent node (`depth + 1`), at the same level as children.

### Layout
- Row: `flex items-start py-1` — the `py-1` (4px) padding creates breathing room and naturally aligns all elements to the same first-line baseline. No explicit `min-h` needed.
- Field icon: `h-6 w-6` (same dimensions as node bullet).
- Field label: `h-6 flex items-center`, fixed width (`FIELD_LABEL_WIDTH`).
- Field value: plain `flex-1 min-w-0` wrapper — no height constraints, no flex centering. Content flows naturally.

### Why `py-1` instead of taller `min-h`
Fields are slightly taller than node rows to accommodate node-reference values (which contain bullets + badges). The `py-1` approach keeps icon/label/value aligned at the same top offset while allowing multiline values to grow naturally.

### Field Value Styling: Same Plane Rules
- **No hover effects** on field values — no `hover:bg-foreground/5` or similar. The field value area must feel identical to regular node content: just text on a neutral backdrop.
- **No visual "input box"** — field values are not inputs on a form. They are content on the plane that happens to be editable.
- `cursor-text` is acceptable (signals editability without visual noise).
- Use the same text styles as node content: `text-[14.5px] leading-[1.6]`.
- Empty values show `text-foreground/25 italic` "Empty" placeholder.

## Zoomed-In Node View (Detail Screen)

When navigating into a specific node (`?node=<id>`), the view shows:

1. **Title row** — node content as `h1` with supertag badges inline (same `text-[11px]` as regular badges), left-aligned with `px-2` matching the outline body.
2. **Root node fields** — rendered via `FieldsSection` at `depth={-1}` (so padding is 0, flush with title).
3. **Children** — rendered as `NodeBlock` at `depth={0}`.

The title + fields + children all share the same left alignment. The header padding (`px-2`) must match the outline body padding.

## Navigation

All node navigation is URL-driven via `useNavigateToNode()` hook:
- Pushes to browser history (bookmarkable, back/forward works).
- Workspace root → `/` (no search param).
- Specific node → `/?node=<nodeId>`.
- Used by: breadcrumbs, bullet cmd+click, field icon click, supertag badge click, node reference click.

## Field Type Icons

Each field type has a distinct Phosphor icon in `FieldBullet`:
- text → TextT, number → Hash, boolean → ToggleRight, date → CalendarBlank
- select → CaretCircleDown, url → LinkSimple, email → At
- node → ArrowSquareOut, nodes → TreeStructure, json → BracketsAngle

## Node Reference Fields

Node references render inline (not as recursive `NodeBlock`s) to prevent infinite recursion:
- Show: bullet + content text + supertag badges.
- Clickable — navigates to the referenced node.
- Unresolved references show a compact pill with truncated node ID.
- Multi-reference fields (`nodes` type) stack vertically.
