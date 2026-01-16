---
description: How to add/modify database schema columns in Nxus
---

# Database Schema Changes Workflow

When adding or modifying columns in the Nxus database, follow these steps to ensure all related files are updated.

## Steps

### 1. Update the Drizzle Schema

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

### 5. Update Types (if applicable)

If the column is for AppCommand, update `packages/nxus-core/src/types/app.ts`:

```typescript
export const AppCommandSchema = z.object({
  // ... existing fields ...
  myNewColumn: z.array(MySchema).optional(),
});
```

## Checklist

- [ ] `db/schema.ts` - Drizzle schema updated
- [ ] `db/client.ts` - CREATE TABLE statement updated
- [ ] Run ALTER TABLE on existing database
- [ ] `scripts/db-seed.ts` - Seed script updated
- [ ] `types/app.ts` - Types updated (if needed)
- [ ] Restart dev server to pick up changes

## Common Issues

### "no such column: xxx"

This means the column exists in `schema.ts` but not in the actual database. Run the ALTER TABLE command to add it.

### Column not persisting

Ensure the seed script includes the field in the record object being inserted/updated.
