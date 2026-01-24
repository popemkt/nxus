import { sql } from 'drizzle-orm'
import { initDatabase, getDatabase, saveDatabase } from '@nxus/db/server'

async function dropSlugColumn() {
  console.log('Starting slug column removal migration...')

  initDatabase()
  const db = getDatabase()

  try {
    // SQLite doesn't support ALTER TABLE DROP COLUMN directly
    // We need to recreate the table without the slug column

    console.log('Step 1: Creating new tags table without slug...')
    db.run(sql`
      CREATE TABLE tags_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER,
        "order" INTEGER NOT NULL DEFAULT 0,
        color TEXT,
        icon TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)

    console.log('Step 2: Copying data from old table...')
    db.run(sql`
      INSERT INTO tags_new (id, name, parent_id, "order", color, icon, created_at, updated_at)
      SELECT id, name, parent_id, "order", color, icon, created_at, updated_at
      FROM tags
    `)

    console.log('Step 3: Dropping old table...')
    db.run(sql`DROP TABLE tags`)

    console.log('Step 4: Renaming new table...')
    db.run(sql`ALTER TABLE tags_new RENAME TO tags`)

    saveDatabase()
    console.log('✅ Migration complete! Slug column removed.')
    console.log('You can now export tags with: npm run export-tags')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    throw error
  }
}

dropSlugColumn()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Migration error:', err)
    process.exit(1)
  })
