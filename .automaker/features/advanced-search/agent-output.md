I'll explore the codebase to understand the existing structure before generating the specification.

🔧 Tool: Task
Input: {
  "description": "Explore database and search structure",
  "prompt": "I need to understand the codebase structure for implementing SQLite FTS5 full-text search. Please explore and find:\n\n1. Database schema and node structure - how are nodes stored? What tables exist?\n2. Any existing search functionality\n3. How queries are evaluated (look at evaluateQuery and related functions)\n4. The architecture modes (table, node, graph) mentioned in codebase-rules.md\n5. How the UI currently handles search or filtering\n6. The @nxus/db package structure (both client-safe and server exports)\n\nFocus on libs/nxus-db and apps/nxus-core. Provide file paths and key code snippets.",
  "subagent_type": "Explore"
}

🔧 Tool: Bash
Input: {
  "command": "find /home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o -type f -name \"*.ts\" -o -name \"*.tsx\" | head -20",
  "description": "List sample files in the codebase"
}

🔧 Tool: Glob
Input: {
  "pattern": "libs/nxus-db/**/*.ts",
  "path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o"
}

🔧 Tool: Glob
Input: {
  "pattern": "apps/nxus-core/**/*.ts",
  "path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/index.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/server.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/schemas/node-schema.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/services/query-evaluator.service.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/types/query.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/apps/nxus-core/src/config/feature-flags.ts"
}

🔧 Tool: Grep
Input: {
  "pattern": "evaluateQuery|search|Search|FTS|fts",
  "type": "ts",
  "path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/apps/nxus-core/src",
  "output_mode": "files_with_matches"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/services/node.service.ts",
  "limit": 200
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/client/master-client.ts",
  "limit": 100
}

🔧 Tool: Grep
Input: {
  "pattern": "evaluateQuery",
  "type": "ts",
  "path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/apps/nxus-core/src",
  "output_mode": "files_with_matches"
}

🔧 Tool: Bash
Input: {
  "command": "find /home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/apps/nxus-core/src -name \"*query*\" -type f",
  "description": "Find query-related files in nxus-core"
}

🔧 Tool: Bash
Input: {
  "command": "find /home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/services -name \"*query*\" -type f",
  "description": "Find query service files"
}

🔧 Tool: Grep
Input: {
  "pattern": "createServerFn.*query|evaluateQuery|ContentFilter",
  "type": "ts",
  "path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o",
  "output_mode": "files_with_matches"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-workbench/src/server/query.server.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-workbench/src/features/query-builder/filters/content-filter.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/apps/nxus-core/src/lib/query-client.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/apps/nxus-core/drizzle.config.ts"
}

🔧 Tool: Bash
Input: {
  "command": "ls -la /home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/schemas/",
  "description": "List schema files"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/types/node.ts",
  "limit": 150
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/services/bootstrap.ts",
  "limit": 150
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/services/index.ts"
}

🔧 Tool: Bash
Input: {
  "command": "find /home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src -name \"*migration*\" -o -name \"*migrate*\"",
  "description": "Find migration files"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/services/query-evaluator.service.test.ts",
  "limit": 200
}

🔧 Tool: Bash
Input: {
  "command": "find /home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o -type f -name \"*.db\" | head -5",
  "description": "Find database files to understand structure"
}

🔧 Tool: Bash
Input: {
  "command": "grep -r \"contentPlain\\|content_plain\" /home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src --include=\"*.ts\" | head -20",
  "description": "Find references to contentPlain field"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/services/node.service.ts",
  "offset": 200,
  "limit": 200
}

🔧 Tool: Bash
Input: {
  "command": "grep -n \"CREATE TABLE\" /home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/client/master-client.ts",
  "description": "Find table creation SQL"
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/client/master-client.ts",
  "offset": 210,
  "limit": 150
}

🔧 Tool: Read
Input: {
  "file_path": "/home/popemkt/repos/nxus/.worktrees/feature-main-1770649897578-dx3o/libs/nxus-db/src/services/node.service.ts",
  "offset": 400,
  "limit": 200
}
Now I have a comprehensive understanding of the codebase. Let me generate the specification.

---

## 1. Problem

Users need to search across all node content and property values efficiently. The current substring matching is slow, doesn't support fuzzy matching or phrase search, and only searches node titles—not property values stored in the `node_properties` table.

## 2. Solution

Implement SQLite FTS5 full-text search by creating virtual tables that index both `nodes.content` and `node_properties.value`, with triggers to keep indexes synchronized. Extend the existing `ContentFilter` to support FTS5 query syntax including fuzzy matching, phrase search, and result highlighting.

## 3. Acceptance Criteria

- **GIVEN** a user searches for "meeting notes", **WHEN** they execute the search, **THEN** results include nodes where content OR any property value contains matching terms, ranked by relevance
- **GIVEN** a user searches with a phrase like `"project plan"`, **WHEN** they execute the search, **THEN** only exact phrase matches are returned
- **GIVEN** a user searches for "configur*", **WHEN** using wildcard/fuzzy mode, **THEN** results include "configure", "configuration", "configured", etc.
- **GIVEN** search results are returned, **WHEN** displayed in the UI, **THEN** matching terms are highlighted with `<mark>` tags
- **GIVEN** the FTS index exists, **WHEN** nodes or properties are created/updated/deleted, **THEN** the FTS index is automatically synchronized via triggers

## 4. Files to Modify

| File | Purpose | Action |
|------|---------|--------|
| `libs/nxus-db/src/schemas/fts-schema.ts` | FTS5 virtual table definitions and triggers | create |
| `libs/nxus-db/src/schemas/index.ts` | Export FTS schema | modify |
| `libs/nxus-db/src/client/master-client.ts` | Initialize FTS tables on database setup | modify |
| `libs/nxus-db/src/types/query.ts` | Extend ContentFilter with FTS options | modify |
| `libs/nxus-db/src/services/fts.service.ts` | FTS search and highlighting functions | create |
| `libs/nxus-db/src/services/query-evaluator.service.ts` | Integrate FTS in content filter evaluation | modify |
| `libs/nxus-db/src/services/index.ts` | Export FTS service | modify |
| `libs/nxus-db/src/server.ts` | Export FTS service for server usage | modify |
| `libs/nxus-workbench/src/features/query-builder/filters/content-filter.tsx` | Add FTS mode toggle and options | modify |
| `libs/nxus-workbench/src/components/search-highlight.tsx` | Component to render highlighted search results | create |

## 5. Implementation Tasks

```tasks
- [ ] T001: Create FTS5 virtual table schema with triggers | File: libs/nxus-db/src/schemas/fts-schema.ts
- [ ] T002: Export FTS schema from schemas index | File: libs/nxus-db/src/schemas/index.ts
- [ ] T003: Add FTS table initialization to master client | File: libs/nxus-db/src/client/master-client.ts
- [ ] T004: Create initial FTS index population function | File: libs/nxus-db/src/services/fts.service.ts
- [ ] T005: Extend ContentFilter schema with FTS options (fuzzy, phrase, highlight) | File: libs/nxus-db/src/types/query.ts
- [ ] T006: Implement FTS search function with ranking and highlighting | File: libs/nxus-db/src/services/fts.service.ts
- [ ] T007: Integrate FTS into evaluateContentFilter | File: libs/nxus-db/src/services/query-evaluator.service.ts
- [ ] T008: Export FTS service from services index and server.ts | File: libs/nxus-db/src/services/index.ts
- [ ] T009: Create SearchHighlight component for result rendering | File: libs/nxus-workbench/src/components/search-highlight.tsx
- [ ] T010: Update ContentFilterEditor with FTS mode options | File: libs/nxus-workbench/src/features/query-builder/filters/content-filter.tsx
- [ ] T011: Create Playwright verification test for FTS search | File: e2e/fts-search-verification.spec.ts
```

## 6. Verification

1. **Manual Testing**: Create several nodes with various content and properties, then search using:
   - Simple terms (e.g., "meeting")
   - Phrase search (e.g., `"project meeting"`)
   - Wildcard search (e.g., "config*")
   - Verify highlighting in search results

2. **Playwright E2E Test**: 
   - Create test nodes with known content
   - Execute searches via the query builder UI
   - Verify correct results appear with highlighting
   - Test phrase and fuzzy search modes

3. **Database Verification**:
   - Confirm FTS tables are created on app startup
   - Confirm triggers sync data on CRUD operations
   - Run `SELECT * FROM nodes_fts WHERE nodes_fts MATCH 'test'` directly

---

[SPEC_GENERATED] Please review the specification above. Reply with 'approved' to proceed or provide feedback for revisions.