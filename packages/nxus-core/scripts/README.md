# Scripts

Database and node-architecture maintenance scripts for Nxus.

## Quick Reference

| Script                       | Reusable?   | Purpose                                        |
| ---------------------------- | ----------- | ---------------------------------------------- |
| `bootstrap-nodes.ts`         | ✅ Reusable | Create system schema (fields, supertags)       |
| `db-seed-nodes.ts`           | ✅ Reusable | Seed items/commands from `manifest.json` files |
| `db-seed.ts`                 | ✅ Reusable | Legacy: seed items table from manifests        |
| `db-export.ts`               | ✅ Reusable | Export DB back to `manifest.json` files        |
| `inspect-node.ts`            | ✅ Reusable | Debug utility to view assembled nodes          |
| `migrate-to-nodes.ts`        | ⚠️ One-off  | Migrate legacy tables → node tables            |
| `db-sync-tags.ts`            | ⚠️ One-off  | Sync tags from JSON → DB                       |
| `migrate-manifests.ts`       | ⚠️ One-off  | Update manifest format                         |
| `remove-slug-migration.ts`   | ⚠️ One-off  | Remove slug field                              |
| `assemble-full-items.ts`     | 🔧 Debug    | Test full item assembly                        |
| `compare-legacy-vs-nodes.ts` | 🔧 Debug    | Compare legacy vs node output                  |
| `test-node-service.ts`       | 🔧 Debug    | Test node service functions                    |

## Common Workflows

### Fresh Database Setup (Recommended)

```bash
# 1. Bootstrap system nodes (fields, supertags)
npx tsx scripts/bootstrap-nodes.ts

# 2. Seed items from manifest.json files
npx tsx scripts/db-seed-nodes.ts
```

### Reset Node Tables Only

```bash
# Wipe nodes (keeps legacy tables intact)
sqlite3 src/data/nxus.db "DELETE FROM node_properties; DELETE FROM nodes;"

# Re-run bootstrap + seed
npx tsx scripts/bootstrap-nodes.ts
npx tsx scripts/db-seed-nodes.ts
```

### Export Changes Back to JSON

```bash
npx tsx scripts/db-export.ts
```

### Inspect a Specific Node

```bash
# By systemId
npx tsx scripts/inspect-node.ts item:claude-code

# By UUID
npx tsx scripts/inspect-node.ts 019bdbd5-500f-710e-8f77-bf177ad9de53
```

## Script Details

### `bootstrap-nodes.ts` ✅

Creates the foundational system nodes:

- **Core fields**: `supertag`, `extends`, `fieldType`
- **Meta-supertags**: `#Supertag`, `#Field`, `#System`
- **Entity supertags**: `#Item`, `#Tool`, `#Repo`, `#Tag`, `#Command`
- **Common fields**: `type`, `path`, `homepage`, `description`, etc.

**Run this first** before any other node operations.

### `db-seed-nodes.ts` ✅

Reads `manifest.json` files from `src/data/apps/*/` and creates nodes:

- Creates item nodes with `#Tool`, `#Repo`, or `#Item` supertag
- Creates command nodes as children
- Resolves dependencies between items
- Creates tag nodes as needed

**Validation errors** skip items that don't match `ItemSchema`:

- `tool` type requires `checkCommand`
- `remote-repo` type requires valid URL in `path`

### `db-export.ts` ✅

Exports database back to `manifest.json` files. Useful after making changes in the UI.

### `migrate-to-nodes.ts` ⚠️

**One-time migration** from legacy `items`/`item_commands` tables to node architecture. Only run once during initial migration.

## UUIDs

All node IDs use **UUIDv7** (time-ordered) for better SQLite B-tree performance:

- Sequential by creation time
- Format: `019bdbd5-xxxx-7xxx-xxxx-xxxxxxxxxxxx`
- First 48 bits encode timestamp
