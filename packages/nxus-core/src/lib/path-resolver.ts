import type { Platform } from '@/types/app'

export interface OsInfo {
  platform: Platform
  arch: string
  homeDir: string
}

/**
 * Returns the default workspace path based on the OS platform.
 * This is a pure function with no side effects, making it easily testable.
 *
 * @param osInfo - The OS information object, or null if not yet loaded
 * @returns The default workspace path for the given platform
 */
export function getOsDefaultWorkspacePath(osInfo: OsInfo | null): string {
  if (!osInfo) {
    // Fallback when OS info hasn't loaded yet
    return '/home/popemkt/nxus-apps'
  }

  if (osInfo.platform === 'windows') {
    return 'C:\\workspace\\_playground'
  }

  // Linux/MacOS
  return '/stuff/WorkSpace'
}
