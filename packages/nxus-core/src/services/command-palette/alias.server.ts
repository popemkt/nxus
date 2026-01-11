import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import {
  getEphemeralDatabase,
  initEphemeralDatabase,
  saveEphemeralDatabase,
} from '@/db/client'
import { commandAliases } from '@/db/ephemeral-schema'

/**
 * Get all aliases as a map of alias → commandId
 */
export const getAliasesServerFn = createServerFn({ method: 'GET' }).handler(
  async () => {
    await initEphemeralDatabase()
    const db = getEphemeralDatabase()
    const rows = await db.select().from(commandAliases)

    const aliasMap: Record<string, string> = {}
    for (const row of rows) {
      aliasMap[row.alias] = row.commandId
    }
    return aliasMap
  },
)

/**
 * Set an alias for a command (upsert)
 */
export const setAliasServerFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { commandId: string; alias: string }) => data)
  .handler(async ({ data: { commandId, alias } }) => {
    await initEphemeralDatabase()
    const db = getEphemeralDatabase()

    // Check if this command already has an alias
    const existing = await db
      .select()
      .from(commandAliases)
      .where(eq(commandAliases.commandId, commandId))

    if (existing.length > 0) {
      // Update existing
      await db
        .update(commandAliases)
        .set({ alias, createdAt: new Date() })
        .where(eq(commandAliases.commandId, commandId))
    } else {
      // Insert new
      await db.insert(commandAliases).values({
        id: crypto.randomUUID(),
        commandId,
        alias,
        createdAt: new Date(),
      })
    }

    saveEphemeralDatabase()
    return { success: true }
  })

/**
 * Remove an alias for a command
 */
export const removeAliasServerFn = createServerFn({ method: 'POST' })
  .inputValidator((data: { commandId: string }) => data)
  .handler(async ({ data: { commandId } }) => {
    await initEphemeralDatabase()
    const db = getEphemeralDatabase()
    await db
      .delete(commandAliases)
      .where(eq(commandAliases.commandId, commandId))
    saveEphemeralDatabase()
    return { success: true }
  })

/**
 * Pure utility functions that can run on client
 * These work with pre-loaded alias data
 */
export const aliasUtils = {
  /**
   * Find exact alias match for a query
   */
  findExactMatch(
    query: string,
    allAliases: Record<string, string>,
  ): string | null {
    const lowerQuery = query.toLowerCase()
    for (const [alias, commandId] of Object.entries(allAliases)) {
      if (alias.toLowerCase() === lowerQuery) {
        return commandId
      }
    }
    return null
  },

  /**
   * Get command IDs that match an alias (exact or prefix match)
   */
  getCommandsForAlias(
    query: string,
    allAliases: Record<string, string>,
  ): { commandId: string; exact: boolean }[] {
    const lowerQuery = query.toLowerCase()
    const matches: { commandId: string; exact: boolean }[] = []

    for (const [alias, commandId] of Object.entries(allAliases)) {
      const lowerAlias = alias.toLowerCase()
      if (lowerAlias === lowerQuery) {
        matches.unshift({ commandId, exact: true })
      } else if (lowerAlias.startsWith(lowerQuery)) {
        matches.push({ commandId, exact: false })
      }
    }

    return matches
  },
}
