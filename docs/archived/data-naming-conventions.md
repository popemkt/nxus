# Data Naming Conventions

This document defines the naming conventions for database tables, TypeScript exports, and types in Nxus.

## Table Naming Conventions

| Category                 | SQL Convention             | TS Export Convention     | Example                                      |
| ------------------------ | -------------------------- | ------------------------ | -------------------------------------------- |
| Entity tables            | `snake_case`, plural       | `camelCase`, plural      | `items`, `tags`                              |
| Related entity tables    | `{parent}_{child}`         | `{parent}{Child}`        | `item_commands` → `itemCommands`             |
| Junction tables          | `{parent}_{child}`         | `{parent}{Child}`        | `item_tags` → `itemTags`                     |
| Config/schema tables     | `*_schemas` or `*_configs` | `*Schemas` or `*Configs` | `tag_schemas` → `tagSchemas`                 |
| Cache tables (ephemeral) | `*_cache`                  | `*Cache`                 | `health_cache` → `healthCache`               |
| Local-only tables        | `local_*`                  | `local*`                 | `local_installations` → `localInstallations` |

## Current Tables

### Master Database (`nxus.db`)

| SQL Name           | TS Export        | Type            | Purpose                                  |
| ------------------ | ---------------- | --------------- | ---------------------------------------- |
| `items`            | `items`          | `Item`          | Master registry (apps, tools, repos)     |
| `item_commands`    | `itemCommands`   | `ItemCommand`   | Commands for items                       |
| `tags`             | `tags`           | `Tag`           | Hierarchical tag tree                    |
| `item_tags`        | `itemTags`       | `ItemTag`       | Junction: items ↔ tags                  |
| `tag_schemas`      | `tagSchemas`     | `TagSchema`     | Schema definitions for configurable tags |
| `item_tag_configs` | `itemTagConfigs` | `ItemTagConfig` | Per-item values for configurable tags    |
| `inbox`            | `inbox`          | `InboxEntry`    | Backlog items to process                 |

### Ephemeral Database (`~/.popemkt/.nxus/ephemeral.db`)

| SQL Name              | TS Export            | Type                | Purpose                            |
| --------------------- | -------------------- | ------------------- | ---------------------------------- |
| `local_installations` | `localInstallations` | `LocalInstallation` | Machine-specific install records   |
| `health_cache`        | `healthCache`        | `HealthCacheEntry`  | Cached tool health checks with TTL |
| `aliases`             | `aliases`            | `Alias`             | User-configured command shortcuts  |

## Type Naming

- Entity types: Singular, PascalCase (`Item`, `Tag`, `ItemCommand`)
- Insert types: Prefix with `New` (`NewItem`, `NewTag`)
- Use Drizzle's `$inferSelect` and `$inferInsert` for type inference

```typescript
export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert
```

## Rationale

1. **`items` not `apps`**: The registry stores apps, tools, and remote repos - "items" is more accurate
2. **`item_*` prefix**: Clarifies relationship to the parent `items` table
3. **`*_cache` suffix**: Indicates ephemeral/regenerable data
4. **`local_*` prefix**: Indicates machine-specific, non-portable data
5. **Simpler names**: `inbox` instead of `inbox_items`, `aliases` instead of `command_aliases`
