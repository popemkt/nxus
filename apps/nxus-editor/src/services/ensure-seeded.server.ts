/**
 * ensure-seeded.server.ts - Auto-seed database from nxus-core manifests on first access
 *
 * Registers a seed callback with @nxus/db that runs seedNodes() when the
 * database is empty. Call initDatabaseSeeded() in place of initDatabaseWithBootstrap()
 * to guarantee items are seeded.
 *
 * IMPORTANT: All @nxus/db/server imports are dynamic to prevent Vite from
 * bundling better-sqlite3 into the client bundle.
 */

let registered = false

/**
 * Initialize the database with bootstrap AND full data seeding.
 * Registers the nxus-core seed callback on first call, then delegates
 * to initDatabaseWithBootstrap() which auto-seeds if db is empty.
 */
export async function initDatabaseSeeded() {
  const { registerSeedCallback, initDatabaseWithBootstrap } = await import(
    '@nxus/db/server'
  )

  if (!registered) {
    registerSeedCallback(async () => {
      const { seedNodes } = await import(
        '../../../nxus-core/scripts/seed-nodes.js'
      )
      await seedNodes()
    })
    registered = true
  }

  return await initDatabaseWithBootstrap()
}
