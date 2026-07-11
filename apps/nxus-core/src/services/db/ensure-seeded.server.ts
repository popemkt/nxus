/**
 * ensure-seeded.server.ts - Auto-seed database from manifests on first access
 *
 * Initializes the active architecture's database before first access. In node
 * mode it registers the SQLite manifest seed callback; in graph mode it
 * initializes the embedded SurrealDB schema/bootstrap directly.
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
      if (process.env.ARCHITECTURE_TYPE === 'graph') {
        const { initGraphDatabase } = await import('@nxus/db/server')
        await initGraphDatabase()
        registered = true
        return
      }

      const { registerSeedCallback, initDatabaseWithBootstrap } = await import(
        '@nxus/db/server'
      )

      registerSeedCallback(async () => {
        const { seedNodes } = await import('../../../scripts/seed-nodes.js')
        await seedNodes()
      })

      // This triggers bootstrap + auto-seed if db is empty
      await initDatabaseWithBootstrap()
      registered = true
    })()
    // A rejected promise must not be cached: one transient bootstrap
    // failure would otherwise poison every later request in this process
    // ("Error loading apps" for the process lifetime).
    readyPromise = readyPromise.catch((err) => {
      readyPromise = null
      throw err
    })
  }

  await readyPromise
}
