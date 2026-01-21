# Scripts

Database and node-architecture maintenance scripts for Nxus.

## 🚀 Quick Start

**Run from Nxus app** (recommended): Use the **Nxus Development** (`_nxus-dev`) commands in the command palette.

**Run from CLI**:

```bash
# Fresh setup
npx tsx scripts/bootstrap-nodes.ts
npx tsx scripts/db-seed-nodes.ts
```

## Scripts Reference

| Script                | Reusable?  | Purpose                                     |
| --------------------- | ---------- | ------------------------------------------- |
| `bootstrap-nodes.ts`  | ✅         | Create system schema (supertags, fields)    |
| `db-seed-nodes.ts`    | ✅         | Seed all data: items, commands, tags, inbox |
| `db-seed.ts`          | ✅         | Legacy: seed items table from manifests     |
| `db-export.ts`        | ✅         | Export DB changes back to manifest files    |
| `inspect-node.ts`     | ✅         | Debug utility to view any node              |
| `migrate-to-nodes.ts` | ⚠️ One-off | Migrate legacy → nodes                      |
| `db-sync-tags.ts`     | ⚠️ One-off | Sync tags from JSON                         |
| Debug scripts         | 🔧         | Testing utilities                           |

## Workflows

### Fresh Database Setup

```bash
npx tsx scripts/bootstrap-nodes.ts
npx tsx scripts/db-seed-nodes.ts
```

### Reset Node Tables

```bash
sqlite3 src/data/nxus.db "DELETE FROM node_properties; DELETE FROM nodes;"
npx tsx scripts/bootstrap-nodes.ts
npx tsx scripts/db-seed-nodes.ts
```

### Export Changes

```bash
npx tsx scripts/db-export.ts
```

### Inspect a Node

```bash
npx tsx scripts/inspect-node.ts item:claude-code
npx tsx scripts/inspect-node.ts supertag:inbox
```

## What `db-seed-nodes.ts` Seeds

1. **Tags** from `tags.json`
2. **Items** from `manifest.json` files
3. **Commands** as child nodes
4. **Dependencies** between items
5. **Inbox items** from legacy table

## UUIDs

All node IDs use **UUIDv7** (time-ordered) for better SQLite B-tree performance.
