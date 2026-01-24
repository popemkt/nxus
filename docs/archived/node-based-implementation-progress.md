# Node Architecture Migration Roadmap

## Overview

The node-based architecture provides a unified data model where everything is a node with properties. This document outlines the migration path from legacy tables to pure node operations.

---

## Current State

| Component                                                                                                                        | Status                               |
| -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Schema ([nodes](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/adapters.ts#148-166), `node_properties`) | ✅ Complete                          |
| Bootstrap (system nodes)                                                                                                         | ✅ 39 nodes                          |
| Migration script                                                                                                                 | ✅ Works                             |
| Direct seed ([db-seed-nodes.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/scripts/db-seed-nodes.ts))                  | ✅ Works                             |
| Read API                                                                                                                         | ✅ Complete                          |
| Write API                                                                                                                        | ✅ Complete                          |
| Adapters (legacy compat)                                                                                                         | ✅ Complete                          |
| Feature toggle                                                                                                                   | ✅ `NODE_BASED_ARCHITECTURE_ENABLED` |

---

## Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│                    UI Components                        │
├─────────────────────────────────────────────────────────┤
│  Server Functions (nodes.server.ts, apps.server.ts)     │
├─────────────────┬───────────────────────────────────────┤
│   Adapters      │      Direct Node API                  │
│  (legacy compat)│    (new mini-apps)                    │
├─────────────────┴───────────────────────────────────────┤
│              node.service.ts                            │
│   - findNodeById, findNodeBySystemId                    │
│   - createNode, setProperty, linkNodes                  │
│   - getNodesBySupertagWithInheritance                   │
├─────────────────────────────────────────────────────────┤
│            nodes + node_properties tables               │
└─────────────────────────────────────────────────────────┘
```

---

## Phase Plan

### Phase 1: Foundation ✅ COMPLETE

- [x] 2-table schema ([nodes](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/adapters.ts#148-166), `node_properties`)
- [x] Bootstrap system nodes (supertags, fields)
- [x] Migration from legacy tables
- [x] Direct JSON seed script

### Phase 2: Service Layer ✅ COMPLETE

- [x] Read API ([assembleNode](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#125-224), [findNodeById](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#83-94), [getNodesBySupertagWithInheritance](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#474-486))
- [x] Write API ([createNode](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#229-262), [setProperty](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#294-336), [linkNodes](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#394-410))
- [x] Split [findNode](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#111-124) into [findNodeById](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#83-94) and [findNodeBySystemId](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#95-110)
- [x] Adapters for backward compatibility

### Phase 3: Feature Toggle ✅ COMPLETE

- [x] `NODE_BASED_ARCHITECTURE_ENABLED` env var
- [x] `getAllAppsServerFn` switches based on toggle
- [x] Testing with toggle enabled

### Phase 4: UI Migration (NEXT)

Goal: Update UI to work with both legacy and node paths.

| Component       | Change Required             |
| --------------- | --------------------------- |
| Gallery view    | Use `apps` from either path |
| Item detail     | Use `item` from either path |
| Tag editor      | Add node-based tag CRUD     |
| Command palette | Works with both             |

**No breaking changes** - toggle controls which path is used.

### Phase 5: Write Operations

Goal: Add node-based mutations alongside legacy.

| Operation   | Legacy          | Node Version                                                                                                   |
| ----------- | --------------- | -------------------------------------------------------------------------------------------------------------- |
| Create item | `insertApp()`   | `createItemFromNodesServerFn()`                                                                                |
| Update item | `updateApp()`   | `updateItemFromNodesServerFn()`                                                                                |
| Delete item | `deleteApp()`   | `deleteItemFromNodesServerFn()`                                                                                |
| Tag item    | `addTagToApp()` | [linkNodes()](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#394-410) |

**Toggle applies to writes too**.

Phase 5.5 is about UI Migration - leveraging the node architecture in the frontend. Here's what it could include:

Phase 5.5 Options
Feature Description Complexity
Backlinks Panel Show "referenced by" for any node (items referencing tags, commands referencing items) Medium
Graph View Upgrade Use node_relations for edges instead of hardcoded dependencies Low
Supertag Browser Browse nodes by supertag (#Tool, #Tag, #Command) with inheritance Medium
Universal Search Search across all nodes by content, not just items Low
Node Inspector UI Visual version of
inspect-node.ts
for debugging Low
Recommendations
Quick wins:

Add backlinks to item detail page - "Items with this tag" or "Commands for this item"
Bigger changes: 3. Graph view from node relations - True relationship visualization 4. Supertag filtering - Filter items by #Tool vs #Repo dynamically

### Phase 6: Remove Legacy Dependency

Goal: Stop seeding legacy tables, node-only operation.

1. [ ] Set `NODE_BASED_ARCHITECTURE_ENABLED=true` as default
2. [ ] Verify all reads work from nodes
3. [ ] Verify all writes work to nodes
4. [ ] Stop running [db-seed.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/scripts/db-seed.ts) (use [db-seed-nodes.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/scripts/db-seed-nodes.ts) only)
5. [ ] Remove feature toggle (always use nodes)

### Phase 7: Remove Adapters

Goal: UI works directly with [AssembledNode](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/scripts/inspect-node.ts#17-36).

| Current                                                                                           | Future                                                                                                                       |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [Item](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/db/schema.ts#111-112) type        | [AssembledNode](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/scripts/inspect-node.ts#17-36) with `#Tool` supertag    |
| [Tag](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/db/schema.ts#50-51) type           | [AssembledNode](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/scripts/inspect-node.ts#17-36) with `#Tag` supertag     |
| [ItemCommand](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/db/schema.ts#170-171) type | [AssembledNode](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/scripts/inspect-node.ts#17-36) with `#Command` supertag |

**Steps:**

1. [ ] Create node-aware components (e.g., `<NodeCard>`)
2. [ ] Replace [Item](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/db/schema.ts#111-112) props with [AssembledNode](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/scripts/inspect-node.ts#17-36) props
3. [ ] Use [getProperty()](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/nodes/node.service.ts#491-502) instead of direct field access
4. [ ] Remove adapter functions

### Phase 8: Drop Legacy Tables

Goal: Remove old schema entirely.

1. [ ] Remove `items`, `itemCommands`, `itemTags`, `tags` tables
2. [ ] Remove legacy seed scripts
3. [ ] Remove [apps.server.ts](file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/services/apps/apps.server.ts) legacy code paths
4. [ ] Clean up unused types

---

## New Mini-App Pattern

For new apps (Notes, Tasks, Bookmarks), skip adapters entirely:

```typescript
// Create a note
const noteId = createNode(db, {
  content: 'My Note Title',
  supertagSystemId: 'supertag:note',
});
setProperty(db, noteId, SYSTEM_FIELDS.DESCRIPTION, 'Note body...');
linkNodes(db, noteId, SYSTEM_FIELDS.PARENT, parentFolderId);

// Query notes
const notes = getNodesBySupertagWithInheritance(db, 'supertag:note');

// Read properties
for (const note of notes) {
  const title = note.content;
  const body = getProperty<string>(note, 'description');
  const parent = getProperty<string>(note, 'parent');
}
```

---

## Usage

### Development (dual mode)

```bash
# Default: uses legacy tables
npx nx dev nxus-core

# Node mode: uses node tables
NODE_BASED_ARCHITECTURE_ENABLED=true npx nx dev nxus-core
```

### Seed Scripts

```bash
# Legacy path
npx tsx scripts/db-seed.ts

# Node path (recommended)
npx tsx scripts/bootstrap-nodes.ts
npx tsx scripts/db-seed-nodes.ts
```

### Dev Tools

```bash
npx tsx scripts/inspect-node.ts item:claude-code
npx tsx scripts/assemble-full-items.ts claude-code
```

---

## Timeline Estimate

| Phase                 | Effort   | Status |
| --------------------- | -------- | ------ |
| 1-3                   | Done     | ✅     |
| 4 (UI reads)          | 2-3 days | 🔜     |
| 5 (UI writes)         | 2-3 days |        |
| 6 (remove legacy dep) | 1 day    |        |
| 7 (remove adapters)   | 3-5 days |        |
| 8 (drop tables)       | 1 day    |        |
