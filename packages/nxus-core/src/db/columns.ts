/**
 * Custom Drizzle column types for SQLite
 *
 * Since SQLite has no native JSON type, we create a custom column type
 * that auto-parses JSON on read and stringifies on write.
 */

import { customType } from 'drizzle-orm/sqlite-core'

/**
 * Custom JSON column type for SQLite
 *
 * Stores JSON as TEXT but automatically:
 * - Parses JSON string to object on read
 * - Stringifies object to JSON on write
 * - Returns undefined for null/invalid JSON
 *
 * @example
 * ```ts
 * // In schema.ts
 * metadata: json<AppMetadata>()('metadata'),
 *
 * // Usage - no manual JSON.parse needed!
 * const app = db.select().from(apps).get()
 * console.log(app.metadata.category) // Already parsed!
 * ```
 */
export const json = <T>() =>
  customType<{ data: T; driverData: string | null }>({
    dataType() {
      return 'text'
    },
    toDriver(value: T): string | null {
      if (value === undefined || value === null) {
        return null
      }
      return JSON.stringify(value)
    },
    fromDriver(value: string | null): T {
      if (value === null || value === undefined) {
        return undefined as T
      }
      try {
        return JSON.parse(value) as T
      } catch {
        return undefined as T
      }
    },
  })
