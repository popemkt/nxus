# Tana Gap Analysis & Node Workbench Enhancement Plan

## Executive Summary

This document analyzes the feature gap between Nxus's current node-based architecture and Tana's implementation, then proposes a plan to transform the `/debug` view into a first-class "Node Workbench" experience.

---

## Part 1: Tana Core Concepts (from docs research)

### 1.1 Nodes & References

| Tana Concept    | Description                                           |
| --------------- | ----------------------------------------------------- |
| **Node**        | Atomic container for information with unique `nodeId` |
| **Reference**   | Mirror copy of a node (same ID, different location)   |
| **Owner**       | The _one_ node that "owns" this node (home address)   |
| **Parent**      | Can have many parents via references                  |
| **Breadcrumbs** | Always shows where content lives via owner chain      |

### 1.2 Outline Editor

- Graph database with outline editor interface
- Expand/collapse, zoom in/out
- Tab/Shift+Tab for indent/outdent
- Move nodes: drag, keyboard, or "Move to" finder
- View options: Outline, Table, Cards, Calendar

### 1.3 Live Search (Search Nodes)

- **Saved queries** that return live results
- Query builder with AND/OR operators
- Field-based filtering: `Status == "Active"`, `Due date < TODAY`
- Scope operators: `OWNED BY`, `CHILD OF`, `PARENTS DESCENDANTS`
- Special keywords: `TODO`, `NOT DONE`, `DONE`, `DONE LAST X DAYS`

### 1.4 Fields

- **9 field types**: Plain, Options, Options from supertag, Date, Number, Tana user, URL, Email, Checkbox
- **Auto-initialize**: Fields can auto-populate from ancestor values
- **Pinned fields**: Show prominently on nodes
- **System fields**: Created, Updated, Done, etc.
- **Semantic fields**: Fields with special meaning (dates, owners)

---

## Part 2: Current Nxus Architecture

### 2.1 Database Schema ✅ (Already Tana-like)

```
nodes
├── id (UUID)
├── content (display text)
├── content_plain (lowercase for FTS)
├── systemId (for system nodes)
├── ownerId (parent node)
├── createdAt, updatedAt, deletedAt

node_properties
├── nodeId → nodes.id
├── fieldNodeId → nodes.id (field definition)
├── value (JSON-encoded)
├── order (for multi-value)
```

**Assessment**: ✅ Solid foundation. Our schema is very similar to Tana's.

### 2.2 Node Service ([node.service.ts](file:///c:/workspace/repos/nxus/packages/nxus-core/src/services/nodes/node.service.ts))

| Function                                                                                                                             | Status   |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| [createNode()](file:///c:/workspace/repos/nxus/packages/nxus-core/src/services/nodes/node.service.ts#229-262)                        | ✅ Works |
| [assembleNode()](file:///c:/workspace/repos/nxus/packages/nxus-core/src/services/nodes/node.service.ts#125-224)                      | ✅ Works |
| [setProperty()](file:///c:/workspace/repos/nxus/packages/nxus-core/src/services/nodes/node.service.ts#294-336)                       | ✅ Works |
| [addPropertyValue()](file:///c:/workspace/repos/nxus/packages/nxus-core/src/services/nodes/node.service.ts#337-370)                  | ✅ Works |
| [getNodesBySupertagWithInheritance()](file:///c:/workspace/repos/nxus/packages/nxus-core/src/services/nodes/node.service.ts#474-486) | ✅ Works |
| [linkNodes()](file:///c:/workspace/repos/nxus/packages/nxus-core/src/services/nodes/node.service.ts#394-410)                         | ✅ Works |

**Assessment**: ✅ Core CRUD is solid.

### 2.3 UI Components

| Component        | Location                                                                                                                                            | Status                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Node Browser     | [routes/debug.tsx](file:///c:/workspace/repos/nxus/packages/nxus-core/src/routes/debug.tsx)                                                         | ⚠️ Basic list         |
| Node Inspector   | [components/features/debug/node-inspector.tsx](file:///c:/workspace/repos/nxus/packages/nxus-core/src/components/features/debug/node-inspector.tsx) | ✅ Good but read-only |
| Supertag Sidebar | [routes/debug.tsx](file:///c:/workspace/repos/nxus/packages/nxus-core/src/routes/debug.tsx)                                                         | ⚠️ Basic filter       |

---

## Part 3: Feature Gap Analysis

### 3.1 UI Experience Gaps

| Tana Feature                      | Nxus Current         | Gap Level   |
| --------------------------------- | -------------------- | ----------- |
| **Outline editing**               | ❌ None              | 🔴 Critical |
| **Inline node creation**          | ❌ None              | 🔴 Critical |
| **Collapse/expand hierarchy**     | ⚠️ By supertag only  | 🟡 Medium   |
| **Breadcrumb navigation**         | ⚠️ In inspector only | 🟡 Medium   |
| **Keyboard navigation**           | ❌ None              | 🔴 Critical |
| **Drag & drop reordering**        | ❌ None              | 🟡 Medium   |
| **Move to finder**                | ❌ None              | 🟡 Medium   |
| **Multiple views** (table, cards) | ❌ Only list         | 🟡 Medium   |

### 3.2 Search & Query Gaps

| Tana Feature              | Nxus Current          | Gap Level   |
| ------------------------- | --------------------- | ----------- |
| **Live search nodes**     | ❌ None               | 🔴 Critical |
| **Query builder UI**      | ❌ None               | 🔴 Critical |
| **Field-based filtering** | ❌ Manual search only | 🔴 Critical |
| **Saved searches**        | ❌ None               | 🟡 Medium   |
| **Scope operators**       | ❌ None               | 🟡 Medium   |

### 3.3 Field System Gaps

| Tana Feature                 | Nxus Current            | Gap Level |
| ---------------------------- | ----------------------- | --------- |
| **Field type validation**    | ⚠️ Only in `tag-config` | 🟡 Medium |
| **Auto-initialize**          | ❌ None                 | 🟢 Low    |
| **Pinned fields**            | ❌ None                 | 🟢 Low    |
| **Options from supertag**    | ❌ None                 | 🟡 Medium |
| **Date field with calendar** | ❌ None                 | 🟡 Medium |

### 3.4 Node Operations Gaps

| Tana Feature            | Nxus Current    | Gap Level |
| ----------------------- | --------------- | --------- |
| **Create reference**    | ⚠️ Backend only | 🟡 Medium |
| **Merge nodes**         | ❌ None         | 🟢 Low    |
| **Checkbox/Done state** | ❌ None         | 🟡 Medium |
| **Node versioning**     | ❌ None         | 🟢 Low    |

---

## Part 4: Code Organization Issues

### 4.1 Current Problems

1. **Mixed concerns in [debug.tsx](file:///c:/workspace/repos/nxus/packages/nxus-core/src/routes/debug.tsx)**
   - Route file contains 250+ lines of component logic
   - Should be split into smaller components

2. **Only 1 component in `/debug` folder**
   - [node-inspector.tsx](file:///c:/workspace/repos/nxus/packages/nxus-core/src/components/features/debug/node-inspector.tsx) is the only dedicated component
   - Missing: NodeBrowser, OutlineEditor, QueryBuilder, etc.

3. **Server functions scattered**
   - [search-nodes.server.ts](file:///c:/workspace/repos/nxus/packages/nxus-core/src/services/nodes/search-nodes.server.ts) in `/nodes`
   - Mixed with other services

4. **No dedicated node UI module**
   - Node components live in "debug" folder
   - Should be its own feature module

### 4.2 Proposed Structure

```
src/
├── components/
│   └── features/
│       └── nodes/                    # NEW: Dedicated node UI module
│           ├── node-browser/
│           │   ├── NodeBrowser.tsx
│           │   ├── NodeList.tsx
│           │   ├── NodeListItem.tsx
│           │   └── index.ts
│           ├── node-inspector/
│           │   ├── NodeInspector.tsx
│           │   ├── PropertySection.tsx
│           │   ├── BacklinksSection.tsx
│           │   └── index.ts
│           ├── node-editor/          # NEW
│           │   ├── OutlineEditor.tsx
│           │   ├── NodeLine.tsx
│           │   ├── useOutlineKeys.ts
│           │   └── index.ts
│           ├── query-builder/        # NEW
│           │   ├── QueryBuilder.tsx
│           │   ├── QueryCondition.tsx
│           │   ├── FieldSelector.tsx
│           │   └── index.ts
│           ├── supertag-sidebar/
│           │   ├── SupertagSidebar.tsx
│           │   └── index.ts
│           └── shared/
│               ├── NodeBadge.tsx
│               ├── SupertagChip.tsx
│               └── NodeLink.tsx
│
├── services/
│   └── nodes/
│       ├── node.service.ts           # Core operations
│       ├── nodes.server.ts           # Server functions
│       ├── search-nodes.server.ts    # Search functions
│       ├── query-builder.server.ts   # NEW: Live search queries
│       ├── adapters.ts               # Legacy adapters
│       └── index.ts
│
└── routes/
    ├── nodes.tsx                     # NEW: Main node workbench
    ├── nodes.$nodeId.tsx             # NEW: Single node view
    └── debug.tsx                     # DEPRECATED → redirect to /nodes
```

---

## Part 5: Implementation Phases

### Phase 1: Code Reorganization (Foundation)

**Goal**: Clean separation without breaking existing functionality

- [ ] Create `components/features/nodes/` directory structure
- [ ] Extract [NodeInspector](file:///c:/workspace/repos/nxus/packages/nxus-core/src/components/features/debug/node-inspector.tsx#36-282) from debug to nodes module
- [ ] Create `NodeBrowser` component from debug.tsx inline code
- [ ] Create `SupertagSidebar` component
- [ ] Create `/nodes` route that imports from new module
- [ ] Keep `/debug` as alias (redirect or re-export)

### Phase 2: Outline Editor (Core Experience)

**Goal**: Tana-like node editing experience

- [ ] Create `OutlineEditor` component with hierarchical view
- [ ] Implement keyboard navigation (up/down/enter/tab)
- [ ] Add inline node creation (Enter = new sibling, Tab = child)
- [ ] Implement expand/collapse for child nodes
- [ ] Add node indentation (Tab/Shift+Tab)
- [ ] Implement drag & drop reordering

### Phase 3: Live Search & Query Builder

**Goal**: Dynamic, saveable searches

- [ ] Create `QueryBuilder` component
- [ ] Implement query condition types:
  - Supertag filter (has #Tag)
  - Field equals/contains
  - Date comparisons
  - AND/OR grouping
- [ ] Create "Search Node" capability:
  - `createSearchNode()` that stores query as properties
  - Live results based on query
- [ ] Add search result grouping by supertag

### Phase 4: Enhanced Field System

**Goal**: Rich field input/display

- [ ] Create field-specific input components:
  - `DateFieldInput` with calendar picker
  - `OptionsFieldInput` with dropdown
  - `NodeRefField` with node search
- [ ] Implement pinned fields display
- [ ] Add field type validation on input
- [ ] Create field configuration UI

### Phase 5: Polish & UX

**Goal**: Premium Tana-like feel

- [ ] Add keyboard shortcuts panel
- [ ] Implement Command Palette integration for node ops
- [ ] Add breadcrumb navigation in all views
- [ ] Create multiple view modes (outline, table, cards)
- [ ] Implement "Move to" finder dialog
- [ ] Add undo/redo for node operations

---

## Part 6: Quick Wins (Start Here)

### 6.1 Immediate Improvements (< 1 day each)

1. **Extract components from debug.tsx** ✅
   - Pull inline code into dedicated files
   - No functionality change, just organization

2. **Add keyboard navigation** ✅
   - Arrow keys to move between nodes
   - Enter to select/edit
   - Escape to deselect

3. **Better breadcrumbs** ✅
   - Show full owner chain
   - Clickable navigation

4. **Node content editing** ✅
   - Double-click to edit node content inline
   - Auto-save on blur

5. **Search with field filters**
   - Add dropdown to filter by specific field
   - Type-ahead for field values

### 6.2 Node Inspector QoL Improvements

1. **Field & Supertag Navigation**
   - Make field names and supertag pills clickable.
   - Navigate straight to the Field/Supertag definition node.

2. **Dedicated Commands Section**
   - For item nodes, add a collapsible section listing all owned commands.
   - Leverages the `ownerId` hierarchy.

3. **Enhanced Backlinks Rendering**
   - Render backlinks using the `NodeBadge` component.
   - Show icons and supertags for referencing nodes.

4. **Property Type Visuals**
   - Add icons to indicate property types (text, reference, JSON).

5. **UUIDv7 Migration** ✅
   - Ensure all new nodes use time-ordered UUIDs for performance.

---

## Questions for User

1. **Routing**: Should we create a new `/nodes` route or enhance `/debug`?
2. **Priority**: Which phase should we tackle first?
3. **Outline editing**: How deep should we go? Full Tana-level or simpler version first?
4. **Mini-app integration**: Should the gallery/app detail continue using adapters, or migrate to pure node UI?

---

## Appendix: Tana Keyboard Shortcuts Reference

| Action             | Shortcut      |
| ------------------ | ------------- |
| New sibling        | Enter         |
| New child          | Tab           |
| Outdent            | Shift+Tab     |
| Move up/down       | Cmd+Shift+↑/↓ |
| Expand/collapse    | Cmd+↑/↓       |
| Toggle checkbox    | Cmd+Enter     |
| Open command line  | Cmd+K         |
| Create reference   | @             |
| Create search node | ?             |
| Zoom into node     | Cmd+.         |
| Go back            | Cmd+[         |
