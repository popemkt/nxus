/**
 * @nxus/mastra/server - Server-only entry point
 *
 * Exports AI agents that require @mastra/core (Node.js runtime).
 * Only import this from server-side code via dynamic imports.
 */

// Re-export client-safe schemas
export * from './index.js'

// Server-only agents
export * from './agents/index.js'
