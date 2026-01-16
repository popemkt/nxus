---
description: How to add/modify database schema columns in Nxus
---

# Database Schema Changes Workflow

When adding or modifying columns in the Nxus database, follow these steps to ensure all related files are updated.

## Steps

### 1. Update the Drizzle Schema (Source of Truth)

Edit `packages/nxus-core/src/db/schema.ts` to add or modify columns:

```typescript
// In the appropriate table (e.g., commands)
export const commands = sqliteTable('commands', {
  // ... existing columns ...
  myNewColumn: json<MyType>()('my_new_column'), // JSON column
  myTextColumn: text('my_text_column'), // Text column
});
```

### 2. Update the CREATE TABLE Statement

Edit `packages/nxus-core/src/db/client.ts` to add the column in the `CREATE TABLE IF NOT EXISTS` statement:

```typescript
masterDb.exec(`
  CREATE TABLE IF NOT EXISTS commands (
    -- ... existing columns ...
    my_new_column TEXT,
    my_text_column TEXT
  )
`);
```

> [!IMPORTANT]
> This only affects NEW databases. Existing databases need migration.

### 3. Migrate Existing Database

Run ALTER TABLE to add columns to the existing database:

```bash
// turbo
sqlite3 packages/nxus-core/src/data/nxus.db "ALTER TABLE commands ADD COLUMN my_new_column TEXT; ALTER TABLE commands ADD COLUMN my_text_column TEXT;"
```

Verify the column was added:

```bash
// turbo
sqlite3 packages/nxus-core/src/data/nxus.db ".schema commands"
```

### 4. Update the Seed Script

Edit `packages/nxus-core/scripts/db-seed.ts` to include the new column in the record object:

```typescript
const commandRecord = {
  // ... existing fields ...
  myNewColumn: cmd.myNewColumn ?? null,
};
```

### 5. Update the Export Script

Edit `packages/nxus-core/scripts/db-export.ts` to include the new column in command mapping:

```typescript
manifest.commands = appCommands.map((cmd) => ({
  // ... existing fields ...
  ...(cmd.myNewColumn && { myNewColumn: parseJsonField(cmd.myNewColumn) }),
}));
```

### 6. Update Types (if applicable)

If the column is for AppCommand, update `packages/nxus-core/src/types/app.ts`:

```typescript
export const AppCommandSchema = z.object({
  // ... existing fields ...
  myNewColumn: z.array(MySchema).optional(),
});
```

### 7. Ensure Type Safety at Parse Layer

> [!IMPORTANT]
> If the column can be null/undefined, ensure the parse function defaults it properly.
> This prevents defensive checks from spreading throughout the codebase.

Update the relevant parse function in `apps.server.ts`:

```typescript
// In parseAppRecord or parseCommandRecord
function parseAppRecord(record) {
  // ✅ GOOD: Ensure defaults at parse time
  const metadata: AppMetadata = {
    tags: Array.isArray(record.metadata?.tags) ? record.metadata.tags : [],
    category: record.metadata?.category ?? 'uncategorized',
    myNewColumn: record.metadata?.myNewColumn ?? defaultValue,
  };
  return { ...record, metadata };
}
```

See [Data Architecture - Type Safety at Data Boundary](file:///stuff/WorkSpace/Nxus/nxus/docs/data-architecture.md) for details.

## Checklist

- [ ] `db/schema.ts` - Drizzle schema updated
- [ ] `db/client.ts` - CREATE TABLE statement updated
- [ ] Run ALTER TABLE on existing database
- [ ] `scripts/db-seed.ts` - Seed script updated
- [ ] `scripts/db-export.ts` - Export script updated
- [ ] `types/app.ts` - Types updated (if needed)
- [ ] **`apps.server.ts` - Parse layer ensures defaults**
- [ ] Restart dev server to pick up changes

## Common Issues

### "no such column: xxx"

This means the column exists in `schema.ts` but not in the actual database. Run the ALTER TABLE command to add it.

### Column not persisting

Ensure the seed script includes the field in the record object being inserted/updated.

---

## Future Improvement: Single Source of Truth

Currently, there's duplication across files. Here are ideas to centralize:

### Option A: Generate CREATE TABLE from Drizzle Schema

Create a script that reads `schema.ts` and generates the SQL:

```typescript
// scripts/generate-create-tables.ts
import { commands } from '../src/db/schema';
// Generate SQL from Drizzle schema definition
```

### Option B: Use Drizzle Migrations

Switch from manual CREATE TABLE to Drizzle Kit migrations:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

This auto-detects schema changes and generates migration SQL.

### Option C: Shared Field Mapper

Create a central mapping util used by both seed and export:

```typescript
// lib/command-fields.ts
export const COMMAND_JSON_FIELDS = [
  'platforms',
  'requires',
  'options',
  'requirements',
  'params',
] as const;

// Used in db-seed.ts and db-export.ts
```

> [!TIP]
> Option B (Drizzle Migrations) is the most robust long-term solution.
