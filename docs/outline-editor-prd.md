# Outline Editor — Product Requirements Document

## Context

Build an outline editor mini-app that provides a Tana-like editing experience on top of the existing Nxus node architecture. The editor is the primary surface for creating, navigating, and organizing nodes as an infinitely nested outline.

**Key architectural difference from Tana**: In Tana, everything is a node — field values are grandchild nodes. In Nxus, we have **plain data fields** (text, number, boolean, date, select, url, email) stored as scalar property values alongside **node reference fields** (`node`, `nodes`). The editor must provide excellent UX for both.

**Key constraint**: The app consumes typesafe assembled objects from the DB service layer — it doesn't know about the underlying node/property architecture. The service layer in `@nxus/db` handles assembly.

## Core Concepts

### The Outline as Node Tree

Every bullet in the outline is a **node** in the database. Indentation represents the `ownerId` (parent) relationship. Sibling order is maintained via an `order` property. The outline is a recursive tree: each node can have children, which can have children, infinitely deep.

### Two Kinds of Field Values

This is where Nxus diverges from Tana and needs thoughtful UX:

| Value Kind | Storage | Examples | UX Treatment |
|------------|---------|----------|--------------|
| **Plain scalar** | JSON-encoded value in `nodeProperties.value` | "In Progress", `42`, `true`, `2024-03-15`, `https://example.com` | Type-specific inline controls (text input, number stepper, date picker, toggle, dropdown, clickable link) |
| **Node reference** | UUID(s) in `nodeProperties.value` | Link to `@John`, `@ProjectX` | Pill/chip that can be clicked to navigate, with `@`-mention autocomplete for entry |

**Design principle**: Plain values should feel lightweight and native — a boolean field shows a toggle, a date shows a date picker, a number shows a number input. Node references should feel like links — showing the referenced node's name as a navigable chip.

### Fields in the Outline

Fields appear as visually distinct children of their parent node:

```
- My Task #task
  > Status: In Progress          ← plain select field, inline dropdown
  > Due Date: Mar 15, 2024       ← plain date field, date picker on click
  > Priority: 3                  ← plain number field, inline number input
  > Assignee: [John Smith]       ← node reference field, navigable chip
  > Tags: [Frontend] [Urgent]    ← multi-node reference, chips
  - First subtask                ← regular child node
  - Second subtask               ← regular child node
```

Fields are visually separated from regular children by:
- A `>` icon or indented field marker (lighter color, smaller font)
- Type-specific controls instead of a text editor
- A thin separator line between the field section and child nodes (optional)

### Field Entry

- Typing `>` on an empty child node enters field mode — shows autocomplete for available fields (defined by the parent's supertag template)
- Selecting a field shows the appropriate type-specific editor immediately
- Fields not defined by any supertag can still be created ad-hoc (defaults to plain text type)

## Feature Requirements

### Phase 1: Core Outline Editor

The foundation. A fully keyboard-driven outliner with proper tree operations.

#### 1.1 Block Rendering

- Recursive `<NodeBlock>` component renders each node and its children
- Each node shows: bullet (collapsible), content text, supertag badges
- Indentation via left padding (depth × indent-width)
- Collapsed nodes show a filled/highlighted bullet; expanded show hollow/open
- Children count indicator on collapsed nodes with children

#### 1.2 Editing Model

- **Single active editor**: Only one node is editable at a time
- Active node shows a text input/contentEditable; inactive nodes render as static text
- Click on a node to activate it; cursor placed at click position
- Clicking outside any node deactivates the current editor (saves content)
- Undo/redo per editing session (Cmd+Z / Cmd+Shift+Z)

#### 1.3 Keyboard Operations

| Key | Context | Action |
|-----|---------|--------|
| **Enter** | On active node | Create new sibling below. If cursor mid-text, split: current node keeps text before cursor, new node gets text after |
| **Tab** | On active node | Indent: become last child of previous sibling. No-op if no previous sibling |
| **Shift+Tab** | On active node | Outdent: become sibling of parent, positioned after parent. Children follow |
| **Backspace** | On empty active node | Delete node, focus previous visible node. If node has children, merge them into parent |
| **Backspace** | At start of non-empty node | Merge content with previous sibling (append to end) |
| **Arrow Up** | At top of node text | Focus previous visible node, cursor at end |
| **Arrow Down** | At bottom of node text | Focus next visible node, cursor at start |
| **Cmd+Shift+Up** | On active node | Move node up among siblings |
| **Cmd+Shift+Down** | On active node | Move node down among siblings |
| **Cmd+Up** | On active node | Collapse children |
| **Cmd+Down** | On active node | Expand children |
| **Escape** | On active node | Deactivate editor, blur to node selection mode |

#### 1.4 Node Selection Mode

When no node is actively being edited (after Escape):
- Arrow Up/Down navigates between visible nodes (highlighted, not editing)
- Enter activates editing on the selected node
- Tab/Shift+Tab indent/outdent the selected node
- Delete/Backspace deletes the selected node (with confirmation if it has children)
- Space toggles collapse/expand

#### 1.5 Collapse/Expand

- Click the bullet icon to toggle
- Collapsed state stored per node (property or local UI state)
- Collapsed nodes show children count badge
- Recursive collapse: collapsing a node hides all descendants

#### 1.6 Zoom (Focus Mode)

- **Cmd+.** or click node title in breadcrumb: Zoom into a node — it becomes the root of the visible tree
- **Cmd+,** or click breadcrumb ancestor: Zoom out to parent
- Breadcrumb trail shows: Home > Grandparent > Parent > Current Node
- Zoomed-in view shows the node's content as a heading, with its children as the outline below

#### 1.7 Drag and Drop

- Click and hold bullet to initiate drag
- Drop indicator shows valid positions (before/after/child-of)
- Drop zones: between nodes (sibling), indented from a node (child), at root level
- Multi-node drag when selection spans multiple nodes

#### 1.8 Ordering

Use **fractional indexing** for sibling order:
- No renumbering when inserting between siblings
- Use `fractional-indexing` npm package or equivalent
- Store as `field:order` property on each node

### Phase 2: Fields & Structured Data

#### 2.1 Field Display

When a node is expanded, its fields render in a dedicated section before regular children:

- Fields section has a subtle visual treatment (slightly lighter background or left border)
- Each field shows: field icon (type-specific), field name (label), field value (type-specific control)
- Empty fields for required supertag template fields show as ghost/placeholder entries
- Optional fields hidden by default, accessible via `+` button or `>` entry

#### 2.2 Plain Scalar Field Editors

Each field type gets a specialized inline editor:

| Field Type | Display | Edit Control | Behavior |
|------------|---------|-------------|----------|
| **text** | Inline text | Text input | Single-line, auto-focus on click |
| **number** | Formatted number | Number input | Up/down arrow keys increment, optional min/max |
| **boolean** | Toggle switch | Checkbox/toggle | Click to toggle, immediate save |
| **date** | Formatted date (e.g., "Mar 15, 2024") | Date picker popover | Click opens picker, natural language entry ("tomorrow", "next Friday") |
| **select** | Selected value as badge | Dropdown | Options from field definition, auto-open on click |
| **url** | Clickable link (truncated) | Text input with url validation | Click opens URL, edit icon shows input |
| **email** | Clickable mailto (truncated) | Text input with email validation | Click opens email client, edit icon shows input |
| **json** | Collapsed `{...}` indicator | Code editor popover | Click opens modal with syntax-highlighted JSON editor |

#### 2.3 Node Reference Field Editor

- Display: Node name as a pill/chip with the node's supertag color
- Click chip: Navigate to (zoom into) the referenced node
- Edit: `@`-mention autocomplete — type `@` then node name to search
- Multi-value (`nodes` type): Multiple chips, `@` to add more, `x` on chip to remove
- Empty reference: Shows `@` placeholder, click to activate autocomplete

#### 2.4 Field Entry Flow

1. User types `>` on an empty child node
2. Autocomplete dropdown shows available fields:
   - Fields defined by parent's supertag templates (prioritized)
   - Recently used fields
   - "Create new field..." option at bottom
3. User selects a field → the node transforms into a field row
4. Cursor moves to the value editor (type-appropriate control)
5. Creating a new field prompts for: name, type (dropdown of field types)

#### 2.5 Field Visibility Options

Per-field configuration (stored on supertag template):
- **Always show**: Field row always visible when node is expanded
- **Hide when empty**: Only show if field has a value (default)
- **Always hide**: Only accessible via `+` button or command palette

### Phase 3: Supertags in the Outline

#### 3.1 Applying Supertags

- Type `#` anywhere in node content → autocomplete for existing supertags
- Supertag appears as a colored badge after the node content
- Applying a supertag auto-populates template fields (from the supertag definition)
- Multiple supertags supported — all their fields merge

#### 3.2 Supertag Badges

- Compact colored badge showing supertag name
- Click badge to navigate to supertag page (all instances)
- Right-click badge for options: remove, configure

#### 3.3 Template Auto-Population

When a supertag is applied:
1. Fetch template fields from supertag definition
2. Create property entries for each required field (with default values if defined)
3. Field section appears under the node with the template fields

### Phase 4: References & Links

#### 4.1 Inline References

- Type `@` mid-text → autocomplete for existing nodes
- Selected node appears as inline chip within the text
- Cmd+click chip to navigate to referenced node
- Display shows referenced node's content as chip text

#### 4.2 Node References (Full)

- On an empty node, `@` creates a full reference (mirror)
- The referenced node's content displays in-place
- Editing edits the original (all references update)
- Visual indicator that this is a reference (reference icon, slight transparency)

#### 4.3 Backlinks Section

- At the bottom of a zoomed-in node, show "Referenced from" section
- Lists all nodes that reference this node (as field values or inline references)
- Each backlink shows context: the referencing node's content with breadcrumb path

### Phase 5: Views & Search

#### 5.1 View Switching

From any node, switch between view modes for its children:
- **Outline** (default): Standard outline view
- **Table**: Children as rows, fields as columns
- **Cards**: Children as cards in columns (grouped by a field)
- **List**: Dual-panel navigation view

#### 5.2 Search Nodes (Live Queries)

- Type `?` on empty node → "Create search node"
- Configure query using existing `QueryDefinition` system
- Results display as virtual children (read-only, links to originals)
- Auto-refresh on data changes via existing reactive event bus

## Architecture

```
apps/nxus-editor/              — TanStack Start app (port 3005, base: /editor/)
libs/nxus-db/                  — Existing. Extended with outline operations (reorder, reparent, split, merge)
libs/nxus-ui/                  — Existing. Extended with field editor components
```

### New DB Service Functions Needed

```typescript
// Outline tree operations — pure functions in libs/nxus-db
reparentNode(db, nodeId, newParentId, orderKey)    // move node to new parent at position
reorderNode(db, nodeId, newOrderKey)               // change position among siblings
splitNode(db, nodeId, splitPosition)               // split content, create new sibling
mergeNodes(db, targetId, sourceId)                  // merge source content into target, delete source
getChildren(db, parentId)                           // get ordered children (assembled)
getAncestors(db, nodeId)                           // get ancestor chain for breadcrumbs
batchMoveNodes(db, nodeIds, newParentId, afterKey)  // bulk move preserving relative order
```

### Client-Side State (Zustand)

```typescript
// Outline UI state — NOT persisted to DB
interface OutlineStore {
  // Focus state
  activeNodeId: string | null           // currently editing node
  selectedNodeId: string | null         // selected but not editing (navigation mode)

  // View state
  rootNodeId: string                    // current zoom root
  collapsedNodes: Set<string>           // collapsed node IDs
  breadcrumbs: { id: string; content: string }[]

  // Editing
  editingContent: string               // current editor buffer
  cursorPosition: number               // cursor offset in active node

  // Actions
  activateNode(id: string, cursorPos?: number): void
  deactivateNode(): void
  selectNode(id: string): void
  toggleCollapse(id: string): void
  zoomIn(id: string): void
  zoomOut(): void
}
```

### Server Functions (in `apps/nxus-editor/`)

```typescript
// All use dynamic imports for @nxus/db/server
getNodeTreeServerFn          // fetch node + N levels of children (assembled)
createNodeServerFn           // create node with parent + order
updateNodeContentServerFn    // update node text (already exists in workbench)
deleteNodeServerFn           // soft delete node
reparentNodeServerFn         // move node to new parent
reorderNodeServerFn          // change sibling order
splitNodeServerFn            // split node at cursor position
mergeNodesServerFn           // merge two adjacent nodes
setFieldValueServerFn        // set a plain scalar field value
addNodeReferenceServerFn     // add a node reference field value
removeNodeReferenceServerFn  // remove a node reference field value
getFieldDefinitionsServerFn  // get available fields for a supertag
searchNodesServerFn          // autocomplete search for @ references
```

### Component Hierarchy

```
<OutlineEditor rootId={nodeId}>
  <Breadcrumbs />
  <NodeTree>
    <NodeBlock nodeId={id} depth={0}>
      <BulletIcon collapsed={bool} hasChildren={bool} />
      <NodeContent>                          // static text or active editor
        <SupertagBadge tag={tag} />           // for each applied supertag
      </NodeContent>
      <FieldsSection>                        // when expanded, before children
        <FieldRow field={field}>
          <FieldLabel name={field.name} type={field.type} />
          <FieldValueEditor>                 // dispatches to type-specific editor
            <TextFieldEditor />
            <NumberFieldEditor />
            <BooleanFieldEditor />
            <DateFieldEditor />
            <SelectFieldEditor />
            <UrlFieldEditor />
            <EmailFieldEditor />
            <NodeReferenceEditor />          // @-mention autocomplete + chips
          </FieldValueEditor>
        </FieldRow>
      </FieldsSection>
      <ChildrenContainer>                   // indented, if expanded
        <NodeBlock nodeId={childId} depth={1}>
          ...recursive
        </NodeBlock>
      </ChildrenContainer>
    </NodeBlock>
  </NodeTree>
</OutlineEditor>
```

## Implementation Sequence

### Step 1: DB service layer extensions

- Add outline tree operations to `libs/nxus-db/src/services/node.service.ts`: `reparentNode`, `reorderNode`, `splitNode`, `mergeNodes`, `getChildren`, `getAncestors`
- Add fractional indexing utility (or integrate `fractional-indexing` package)
- Ensure `field:order` uses fractional index strings instead of integers
- Files: `libs/nxus-db/src/services/node.service.ts`

### Step 2: App scaffold

- Create `apps/nxus-editor/` following same structure as `apps/nxus-recall`
- Port 3005, base path `/editor/`, registered in gateway proxy
- Minimal route structure: single page with `<OutlineEditor>` component
- Files: `apps/nxus-editor/package.json`, `apps/nxus-editor/vite.config.ts`, `apps/nxus-editor/src/router.tsx`, `apps/nxus-editor/src/routes/`

### Step 3: Core outline rendering

- `<NodeBlock>` recursive component with static content display
- Collapse/expand with bullet click
- Indentation via CSS (depth-based padding)
- Zustand store for UI state (collapsed, selected, active)
- Fetch node tree via server function with lazy loading (load children on expand)
- Files: `apps/nxus-editor/src/components/outline/`, `apps/nxus-editor/src/stores/outline.store.ts`

### Step 4: Editing & keyboard handling

- Single active editor (text input or contentEditable on the active node)
- Enter/Tab/Shift+Tab/Backspace/Arrow key handlers
- Server function calls for mutations (create, reparent, reorder, split, merge)
- Optimistic updates in the Zustand store
- Files: `apps/nxus-editor/src/components/outline/`, `apps/nxus-editor/src/hooks/use-keyboard-handlers.ts`

### Step 5: Zoom & navigation

- Breadcrumb component with ancestor chain
- Zoom in (Cmd+.) / out (Cmd+,) with URL state
- Route: `/editor/$nodeId` — the zoomed-in node
- Files: `apps/nxus-editor/src/components/breadcrumbs/`, `apps/nxus-editor/src/routes/`

### Step 6: Field editors

- `<FieldsSection>` component rendering fields before children
- Type-specific editor components (text, number, boolean, date, select, url, email)
- Node reference editor with `@`-mention autocomplete
- Field entry via `>` prefix
- Files: `apps/nxus-editor/src/components/fields/`

### Step 7: Supertags & references

- `#` trigger for supertag autocomplete and application
- `@` trigger for node reference autocomplete (inline and full)
- Template auto-population on supertag apply
- Backlinks section
- Files: `apps/nxus-editor/src/components/supertags/`, `apps/nxus-editor/src/components/references/`

### Step 8: Drag and drop

- Bullet-based drag initiation
- Drop zone indicators (before, after, child-of)
- Reparent/reorder on drop via server functions
- Files: `apps/nxus-editor/src/hooks/use-drag-drop.ts`

### Step 9: Gateway integration

- Add `/editor` route to `apps/nxus-gateway/vite.config.ts` proxy
- Add app card to `apps/nxus-gateway/src/config/mini-apps.ts`
- Add `dev:editor` script to root `package.json`

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `fractional-indexing` | Generating order keys between siblings without renumbering |
| `@tanstack/react-query` | Already in stack. Cache node tree, optimistic updates |
| `date-fns` | Date formatting and natural language date parsing for date fields |

No rich text editor library for Phase 1. Start with plain text per node. If inline formatting is needed later, evaluate Tiptap (ProseMirror) for inline marks only — not for outline structure, which we own.

## UX Design Notes

### Plain Fields vs Node References — Visual Language

The core UX challenge: making two fundamentally different value types feel cohesive in the same outline.

**Plain scalar values** should feel like **form controls** — embedded, lightweight, immediately editable:
- Text: Inline text, clicking activates a borderless input
- Number: Right-aligned number, click to edit, arrow keys increment
- Boolean: A small toggle that clicks instantly
- Date: Formatted text ("Mar 15"), click opens compact date picker
- Select: Current value as a subtle badge, click opens dropdown
- URL/Email: Truncated link text, hover shows full URL, click opens

**Node references** should feel like **links/relationships** — navigable, entity-aware:
- Single: A pill showing the node's name + supertag color dot
- Multiple: A row of pills with `+` button to add
- Both show a subtle `→` or link icon to hint at navigability
- Cmd+click navigates; plain click selects for editing

**The distinction should be discoverable but not jarring** — both live in the same field row layout, same label style, just different value renderers.

### Why This Is Better Than "Everything Is a Node"

1. **Less overhead**: Setting a boolean to `true` doesn't create a node in the database
2. **Native controls**: Date pickers, toggles, and number inputs are better than typing text into a generic node
3. **Performance**: Scalar reads are a single property lookup, not a node assembly
4. **Clarity**: A number field clearly IS a number. In Tana, "42" as a node is ambiguous — is it a reference to a concept called "42" or the number forty-two?
5. **You still get node references where they matter**: Assignees, related projects, and tags are still full node links with bidirectional awareness

## Verification

1. `pnpm dev` — all apps start, gateway proxies `/editor/` to port 3005
2. Navigate to `/editor/` — see outline tree rooted at a default workspace node
3. Create nodes with Enter, indent with Tab, outdent with Shift+Tab
4. Collapse/expand children, zoom in/out with breadcrumbs
5. Apply a supertag with `#` — template fields appear
6. Edit plain fields inline with type-appropriate controls
7. Add node references with `@`-mention autocomplete
8. Drag and drop nodes to rearrange
9. Search nodes with `?` prefix, results update live
