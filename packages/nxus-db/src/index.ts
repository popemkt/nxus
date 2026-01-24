/**
 * @nxus/db - Database layer for Nxus mini-apps
 *
 * This is the main entry point for shared types and schemas that can be
 * used in both client and server code.
 *
 * For server-side database operations, use '@nxus/db/server' instead.
 */

// Schemas (Drizzle table definitions - can be used for type inference)
export * from './schemas/index.js'

// Types (Zod schemas and TypeScript types)
export * from './types/index.js'
