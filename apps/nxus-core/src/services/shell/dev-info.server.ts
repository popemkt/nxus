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
 */
export const getDevInfoServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DevInfo> => {
    const isDev = process.env.NODE_ENV !== 'production'
    const cwd = process.cwd()

    let nxusRootPath: string | null = null
    let devReposPath: string | null = null

    if (isDev) {
      let currentPath = cwd
      for (let i = 0; i < 5; i++) {
        const potentialReposPath = path.join(currentPath, 'packages', 'repos')
        try {
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

    const result = {
      isDevMode: isDev,
      devReposPath,
      nxusRootPath,
    }
    console.log('[getDevInfoServerFn] Result:', result)
    return result
  },
)
