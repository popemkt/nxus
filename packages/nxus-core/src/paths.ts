/**
 * Centralized path management for Nxus
 *
 * Uses __dirname pattern for ESM compatibility with environment variable overrides
 * for flexible deployment and testing.
 */

import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

// Get __dirname equivalent for ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Centralized path constants for Nxus
 *
 * Environment Variable Overrides:
 * - APP_DATA_ROOT: Override the apps data directory path
 * - APP_REPO_ROOT: Override the repository instances directory path
 */
export const PATHS = {
  /**
   * Root directory for app data (manifests, scripts, docs)
   * Default: packages/nxus-core/src/data/apps
   */
  appsData: process.env.APP_DATA_ROOT || path.resolve(__dirname, 'data/apps'),

  /**
   * Root directory for cloned repository instances
   * Default: ~/.nxus/repos
   */
  reposRoot: process.env.APP_REPO_ROOT || path.resolve(os.homedir(), '.nxus', 'repos'),

  /**
   * Get the path to a specific app's directory
   * @param appId - The app ID (e.g., 'github-cli', 'opencode')
   * @param parts - Additional path segments to join
   */
  app: (appId: string, ...parts: string[]) =>
    path.resolve(PATHS.appsData, appId, ...parts),

  /**
   * Get the path to a specific repository instance
   * @param instanceId - The instance ID
   * @param parts - Additional path segments to join
   */
  repo: (instanceId: string, ...parts: string[]) =>
    path.resolve(PATHS.reposRoot, instanceId, ...parts),

  /**
   * Get the path to the shared scripts directory
   * @param parts - Additional path segments to join
   */
  sharedScripts: (...parts: string[]) =>
    path.resolve(PATHS.appsData, '_scripts', ...parts),
} as const

/**
 * Type-safe path helper that ensures the path exists
 * @throws Error if the path does not exist
 */
export async function ensurePath(path: string): Promise<string> {
  const { existsSync } = await import('node:fs')
  if (!existsSync(path)) {
    throw new Error(`Path does not exist: ${path}`)
  }
  return path
}
