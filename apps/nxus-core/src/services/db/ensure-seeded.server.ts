/**
 * ensure-seeded.server.ts - Auto-seed database from manifests on first access
 *
 * Registers a seed callback with @nxus/db that runs seedNodes() when the
 * database is empty. Call ensureDatabaseReady() before any db access to
 * guarantee items are seeded.
 *
 * IMPORTANT: All @nxus/db/server imports are dynamic to prevent Vite from
 * bundling better-sqlite3 into the client bundle.
 */

let registered = false
let readyPromise: Promise<void> | null = null

/**
 * Ensure the database is initialized, bootstrapped, and seeded from manifests.
 * Idempotent and concurrency-safe (concurrent first calls share the same promise).
 */
export async function ensureDatabaseReady(): Promise<void> {
  if (registered) return

  if (!readyPromise) {
    readyPromise = (async () => {
      const { registerSeedCallback, initDatabaseWithBootstrap } =
        await import('@nxus/db/server')

      registerSeedCallback(async () => {
        const { seedNodes } = await import('../../../scripts/seed-nodes.js')
        await seedNodes()
      })

      // This triggers bootstrap + auto-seed if db is empty
      await initDatabaseWithBootstrap()
      registered = true
    })()
  }

  await readyPromise
}
