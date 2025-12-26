import { useState } from 'react'
import { useAppCheck, useOsInfo } from '@/services/app-state'
import { getOsDefaultWorkspacePath } from '@/lib/path-resolver'

/**
 * Hook to manage installation path configuration for an app.
 *
 * Provides a default path based on:
 * - First installation's path if app is already installed
 * - OS-specific default path otherwise
 *
 * User can override the default by typing in the input field.
 *
 * @param appId - The app ID to check for existing installation
 * @returns Object with installPath state and setInstallPath setter
 */
export function useInstallPath(appId: string) {
  const { path: firstInstallPath } = useAppCheck(appId)
  const osInfo = useOsInfo()

  // ✅ Calculate default - no useEffect needed
  const defaultPath = firstInstallPath || getOsDefaultWorkspacePath(osInfo)

  // ✅ Initialize once with calculated value
  const [installPath, setInstallPath] = useState(defaultPath)

  return {
    installPath,
    setInstallPath,
    savedPath: firstInstallPath,
  }
}
