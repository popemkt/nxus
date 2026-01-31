/**
 * @nxus/calendar/server - Server-side calendar operations
 *
 * This entry point exports server functions that require Node.js.
 * Only import this from server-side code (*.server.ts files).
 */

// Re-export everything from the main entry point
export * from './index.js'

// Server functions (require Node.js)
export * from './server/index.js'
