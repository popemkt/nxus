/**
 * @nxus/db/server - Server-side database operations
 *
 * This entry point exports database clients and services that require Node.js.
 * Only import this from server-side code (*.server.ts files).
 */

// Re-export everything from the main entry point
export * from './index.js'

// Database clients (require Node.js)
export * from './client/index.js'

// Services (require database clients)
export * from './services/index.js'

// Re-export Drizzle ORM to ensure type compatibility (avoids "private property" mismatches)
export * from 'drizzle-orm'
