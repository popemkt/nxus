import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'

/**
 * Inbox items - backlog of tools/apps to add later via add-item workflow
 */
export const inboxItems = sqliteTable('inbox_items', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  notes: text('notes'),
  status: text('status', { enum: ['pending', 'processing', 'done'] })
    .default('pending')
    .notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .$defaultFn(() => new Date())
    .notNull(),
})

export type InboxItem = typeof inboxItems.$inferSelect
export type NewInboxItem = typeof inboxItems.$inferInsert
