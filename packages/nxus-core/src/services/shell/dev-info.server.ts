import { createServerFn } from '@tanstack/react-start'
import path from 'path'

export type DevInfo = {
  isDevMode: boolean
  devReposPath: string | null
  nxusRootPath: string | null
}

/**
 * Server function to detect if the app is running in development mode
 * and provide the dev repos path for quick installation.
 *
 * Dev mode is detected by:
 * - NODE_ENV !== 'production'
 * - Or process.cwd() containing the nxus monorepo structure
 */
export const getDevInfoServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DevInfo> => {
    const isDev = process.env.NODE_ENV !== 'production'
    const cwd = process.cwd()

    // Find the nxus root (where packages/repos would be)
    // The app runs from packages/nxus-core, so we go up to find the monorepo root
    let nxusRootPath: string | null = null
    let devReposPath: string | null = null

    if (isDev) {
      // Try to find the monorepo root by looking for packages/repos
      // Starting from cwd, go up until we find it
      let currentPath = cwd
      for (let i = 0; i < 5; i++) {
        const potentialReposPath = path.join(currentPath, 'packages', 'repos')
        try {
          // Check if the path exists (we're on server, can use sync check)
          const fs = await import('fs/promises')
          const stat = await fs.stat(potentialReposPath)
          if (stat.isDirectory()) {
            nxusRootPath = currentPath
            devReposPath = potentialReposPath
            break
          }
        } catch {
          // Not found at this level, go up
        }
        currentPath = path.dirname(currentPath)
      }
    }

    console.log('Dev Info:', {
      isDevMode: isDev,
      devReposPath,
      nxusRootPath,
      cwd,
    })

    return {
      isDevMode: isDev,
      devReposPath,
      nxusRootPath,
    }
  },
)
