import os from 'node:os'
import { createServerFn } from '@tanstack/react-start'
import type { Platform } from '@nxus/db'

export type OsInfo = {
  platform: Platform
  arch: string
  homeDir: string
}

export const getOsInfoServerFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<OsInfo> => {
    const platform = os.platform()
    let mappedPlatform: Platform = 'linux' // Default fallback

    if (platform === 'win32') {
      mappedPlatform = 'windows'
    } else if (platform === 'darwin') {
      mappedPlatform = 'macos'
    }

    console.log('[getOsInfoServerFn] Info:', {
      platform,
      mappedPlatform,
      arch: os.arch(),
      homeDir: os.homedir(),
    })

    return {
      platform: mappedPlatform,
      arch: os.arch(),
      homeDir: os.homedir(),
    }
  },
)
