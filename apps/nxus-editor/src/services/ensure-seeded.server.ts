/**
 * ensure-seeded.server.ts - Auto-seed database from nxus-core manifests on first access
 *
 * Initializes the active architecture's database before first access. In node
 * mode it registers the SQLite manifest seed callback; in graph mode it
 * initializes the embedded SurrealDB schema/bootstrap directly.
 *
 * IMPORTANT: All @nxus/db/server imports are dynamic to prevent Vite from
 * bundling better-sqlite3 into the client bundle.
 */

let registered = false

/**
 * Initialize the database with bootstrap and seed dispatch for the active mode.
 */
export async function initDatabaseSeeded() {
  if (process.env.ARCHITECTURE_TYPE === 'graph') {
    const { initGraphDatabase } = await import('@nxus/db/server')
    await initGraphDatabase()
    registered = true
    return
  }

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
