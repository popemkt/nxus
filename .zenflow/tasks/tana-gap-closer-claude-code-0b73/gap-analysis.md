# Tana Gap Analysis - Core Editor Experience

## Methodology

Compared the current Nxus editor implementation against Tana's core features across 6 areas:
1. Query functionality & query editor experience
2. Keyboard navigation for common operations
3. Node type fields and constraints
4. Self-collecting values and field suggestions
5. Different views of nodes (kanban, calendar, table, tabs, etc.)
6. Core tags and fields functionality

---

## 1. Query Functionality & Query Editor Experience

### What Nxus Has
- **Query evaluator** with 8 filter types: supertag, property, path, content, relation, temporal, hasField, logical (AND/OR/NOT)
- **Query builder UI** in workbench with filter composition, sort config, linter display
- **Saved queries** as nodes with `#Query` supertag
- **Inline query results** shown under `#Query` nodes in the outline
- **Property filter operators**: eq, neq, gt, gte, lt, lte, contains, startsWith, endsWith, isEmpty, isNotEmpty

### What Tana Has That We're Missing

| Gap | Tana Feature | Current State | Priority |
|-----|-------------|---------------|----------|
| **Q1** | **Inline query editor in outline** - edit query filters directly on a #Query node without leaving the outline | Query results display inline, but editing requires navigating to workbench query builder | HIGH |
| **Q2** | **Checkbox operators** (TODO, DONE, NOT DONE, OVERDUE) as first-class query filters | Must manually construct property filters for checkbox/status fields | MEDIUM |
| **Q3** | **Temporal shorthand filters** ("CREATED LAST N DAYS", "EDITED LAST N DAYS", "DONE LAST N DAYS") | We have temporal filters but no convenient shorthand in the UI | MEDIUM |
| **Q4** | **Node type filters** (IS TAG, IS FIELD, IS SEARCH NODE, IS CALENDAR NODE) | Must use supertag filters manually | LOW |
| **Q5** | **Content media filters** (HAS IMAGE, HAS AUDIO, HAS VIDEO, HAS MEDIA) | Not applicable yet (no media support) | N/A |
| **Q6** | **PARENT/GRANDPARENT dot notation** for nested field traversal in queries | We have PathFilter but no dot-notation syntax in the UI | MEDIUM |
| **Q7** | **Regex support** in query filters (between forward slashes) | Not implemented | LOW |
| **Q8** | **View-as on query results** - display query results as table, kanban, calendar, cards | Query results show as flat grouped list only | HIGH |

---

## 2. Keyboard Navigation for Common Operations

### What Nxus Has
- Arrow Up/Down for selection, Shift+Arrow for multi-select
- Enter to edit, Space to collapse/expand
- Tab/Shift+Tab for indent/outdent
- Backspace/Delete to remove nodes
- `o` to create new node after selection
- Cmd+S for search, Cmd+K for command palette
- Escape to deselect

### What Tana Has That We're Missing

| Gap | Tana Feature | Current State | Priority |
|-----|-------------|---------------|----------|
| **K1** | **Cmd+Shift+Up/Down** to move nodes up/down in outline | Not implemented - must use drag & drop or manual reparent | HIGH |
| **K2** | **Cmd+. / Cmd+,** (or Alt+Right/Left on PC) to zoom in/out of nodes | Cmd+Click on bullet zooms in, but no keyboard shortcut to zoom in/out | HIGH |
| **K3** | **Cmd+Z / Cmd+Shift+Z** for undo/redo | No undo/redo system exists | HIGH |
| **K4** | **Cmd+Enter** to toggle checkbox/task status on a node | Not implemented | MEDIUM |
| **K5** | **Cmd+E** Quick Add (capture from anywhere) | Not implemented | LOW |
| **K6** | **Cmd+Shift+M** to open node in side panel | Not implemented (no panel system) | LOW |
| **K7** | **Text formatting shortcuts** (Cmd+B bold, Cmd+I italic, Cmd+U underline) | No rich text formatting in node content | MEDIUM |
| **K8** | **Custom keyboard shortcut system** - users can assign shortcuts to any command via Cmd+Shift+K | Not implemented | LOW |

---

## 3. Node Type Fields and Constraints

### What Nxus Has
- Supertags with inheritance via `extends`
- 11 field types: text, number, boolean, date, select, url, email, node, nodes, json
- Field definitions as nodes with type metadata
- Multi-value fields with ordering
- Fields inherited from ancestor supertags

### What Tana Has That We're Missing

| Gap | Tana Feature | Current State | Priority |
|-----|-------------|---------------|----------|
| **F1** | **Options from supertag** field type - dropdown populated by all nodes with a specific supertag (e.g., "Assignee" field shows all #Person nodes) | Only static options list on select fields | HIGH |
| **F2** | **Required field indicators** - visual warning when required fields are empty | No required field concept exists | MEDIUM |
| **F3** | **Hide field rules** (Never, When empty, When not empty, When default, Always) | All fields always visible when assigned | MEDIUM |
| **F4** | **Auto-initialize fields** based on context (ancestor values, current date, current user, ancestor day node, random supertag node) | No auto-initialization | MEDIUM |
| **F5** | **Default child supertags** - new children of a tagged node automatically get a specified supertag | Not implemented | HIGH |
| **F6** | **Content template** - supertag config defines default fields and child nodes that populate every new instance | Not implemented | MEDIUM |
| **F7** | **Pinned fields** - mark fields to appear at top and in view filter/sort/group menus first | Not implemented | MEDIUM |
| **F8** | **Title expression** - computed display name from field values (e.g., "#Meeting with {Attendee} on {Date}") | Not implemented | LOW |
| **F9** | **"Plain" field type** - accepts any content without type constraints | Our "text" type is close but doesn't support inline nodes/references | LOW |

---

## 4. Self-Collecting Values and Suggestions

### What Nxus Has
- Supertag autocomplete via `#` trigger (lists all supertags, filters by query)
- Field name autocomplete when adding fields (filters available fields)
- Select field shows options from field definition

### What Tana Has That We're Missing

| Gap | Tana Feature | Current State | Priority |
|-----|-------------|---------------|----------|
| **S1** | **Auto-collect values** on options fields - when a user types a new value not in the options list, it's automatically added to the options for future use | Options are static; new values typed in select fields are NOT collected | HIGH |
| **S2** | **Options from supertag suggestions** - typing a new value prompts creation of a new node with that supertag | Not implemented (no "options from supertag" field type) | HIGH |
| **S3** | **Field value suggestions from other nodes** - when editing a field, show what values other nodes have used for the same field | Not implemented | HIGH |
| **S4** | **Sources of options** - reference external node lists or search nodes as option sources | Options only from static list in field definition | MEDIUM |
| **S5** | **Recently used values** shown first in option lists | No usage tracking or recency sorting | LOW |

---

## 5. Different Views of Nodes

### What Nxus Has
- **Outline view** (tree/hierarchical) - the primary editor
- **Graph view** (2D/3D force-directed) - in workbench only
- **Gallery view** (cards) - in core app only, for app items
- **Table view** - in core app only, for app items
- **Calendar view** - separate app, only for #event nodes
- **Query results view** - grouped list in workbench

### What Tana Has That We're Missing

| Gap | Tana Feature | Current State | Priority |
|-----|-------------|---------------|----------|
| **V1** | **View-as on ANY node** - right-click any node and "View as" table, cards, calendar, list, tabs, side menu | Views are app-specific; outline has no view switching | HIGH |
| **V2** | **Table view in outline** - view children as rows with fields as columns, inline editing | No table view in editor | HIGH |
| **V3** | **Kanban/Board view** - group by a field (e.g., Status) and display as columns with drag-to-move | Not implemented anywhere | HIGH |
| **V4** | **Tabs view** - child nodes shown as horizontal tabs, clicking switches content | Not implemented | MEDIUM |
| **V5** | **Cards view in outline** - children displayed as cards with field previews | Gallery view exists but not in the outline editor | MEDIUM |
| **V6** | **List (navigation) view** - two-panel: list of nodes on left, full content on right | Not in outline editor | MEDIUM |
| **V7** | **Side menu view** - vertical menu navigation with content display | Not implemented | LOW |
| **V8** | **View toolbar** with Filter/Sort/Group/Display controls applicable to any view | Only in workbench query results, not on arbitrary nodes | HIGH |
| **V9** | **Calendar view on any date-field node** - inline calendar showing children by their date field | Calendar is a separate app, not inline | MEDIUM |

---

## 6. Core Tags and Fields Functionality

### What Nxus Has
- Supertag assignment via `#` autocomplete
- Supertag removal via X overlay on hover
- Field definitions with types inherited through supertag chain
- Inline field add via `>` trigger with autocomplete
- Field value editing per type (contenteditable, select dropdown, date picker, etc.)
- Backlinks section showing incoming references

### What Tana Has That We're Missing

| Gap | Tana Feature | Current State | Priority |
|-----|-------------|---------------|----------|
| **T1** | **Supertag configuration panel** - dedicated UI to configure a supertag's fields, template, commands, AI settings, advanced options | Supertag fields are defined in bootstrap code, no UI for configuration | HIGH |
| **T2** | **"Add to template" from ad-hoc fields** - right-click a field used on a node to add it to the supertag's field schema | Not implemented | MEDIUM |
| **T3** | **Supertag inheritance UI** - visual indicator and configuration of extends relationships | Inheritance works in code but no UI to configure it | MEDIUM |
| **T4** | **Base types** (Meeting, Task, Person, etc.) with specialized behavior | System supertags exist but no specialized behavior beyond field schemas | LOW |
| **T5** | **Field definition node in Schema** - moving field definitions to Schema makes them globally discoverable and prioritized in search | No Schema concept; fields are system-defined or scattered | MEDIUM |

---

## Priority Summary

### Critical (Must-Have for Tana Parity)

1. **S1 + S2 + S3**: Self-collecting options & field value suggestions
2. **F1**: Options from supertag field type
3. **V1 + V2 + V3 + V8**: View-as system (table, kanban) with toolbar
4. **K1 + K2 + K3**: Move nodes, zoom shortcuts, undo/redo
5. **Q1**: Inline query editor in outline
6. **F5**: Default child supertags
7. **T1**: Supertag configuration panel

### Important (Strong Differentiators)

8. **Q8**: View-as on query results
9. **F2 + F3**: Required fields & hide rules
10. **F4 + F6**: Auto-initialize & content templates
11. **K4 + K7**: Checkbox toggle & text formatting shortcuts
12. **V4 + V5 + V9**: Tabs, cards, inline calendar views
13. **F7**: Pinned fields
14. **T2 + T3**: Add-to-template & inheritance UI

### Nice-to-Have

15. **Q2 + Q3 + Q6**: Checkbox operators, temporal shorthands, dot notation
16. **K5 + K6 + K8**: Quick add, panels, custom shortcuts
17. **S4 + S5**: External option sources, recently-used sorting
18. **V6 + V7**: List navigation, side menu views
19. **F8 + F9 + T4 + T5**: Title expressions, plain type, base types, schema concept
