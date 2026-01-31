/**
 * @nxus/calendar - Calendar and schedule management for Nxus mini-apps
 *
 * This is the main entry point for shared types and client-side components
 * that can be used in both client and server code.
 *
 * For server-side calendar operations, use '@nxus/calendar/server' instead.
 */

// Types (TypeScript types and Zod schemas)
export * from './types/index.js'

// Utilities (pure functions - no React deps)
export * from './lib/index.js'

// React components (for client-side use)
export * from './components/index.js'

// React hooks
export * from './hooks/index.js'

// Zustand stores
export * from './stores/index.js'

// Package version
export const CALENDAR_VERSION = '0.0.1'
