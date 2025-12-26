import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppCheck, useOsInfo } from '@/services/app-state'
import { getOsDefaultWorkspacePath } from '@/lib/path-resolver'

/**
 * Hook to manage installation path configuration for an app.
 *
 * Composes the pure path-resolver utility with React state,
 * handling the logic of:
 * - Using saved path if app is already installed (for first installation only)
 * - Using OS-specific default path otherwise
 * - Updating when OS info loads asynchronously
 * - Not overriding user's manual input
 *
 * @param appId - The app ID to check for existing installation
 * @returns Object with installPath state and setInstallPath setter
 */
export function useInstallPath(appId: string) {
  const { path: savedPath } = useAppCheck(appId)
  const osInfo = useOsInfo()
  const hasInitialized = useRef(false)

  const getDefaultPath = useCallback(() => {
    if (savedPath) return savedPath
    return getOsDefaultWorkspacePath(osInfo)
  }, [savedPath, osInfo])

  const [installPath, setInstallPath] = useState(getDefaultPath)

  // Only set path on initial mount, don't keep overriding user input
  useEffect(() => {
    if (hasInitialized.current) return

    const defaultPath = getOsDefaultWorkspacePath(null) // Initial fallback value
    if (savedPath) {
      setInstallPath(savedPath)
      hasInitialized.current = true
    } else if (osInfo && installPath === defaultPath) {
      setInstallPath(getDefaultPath())
      hasInitialized.current = true
    }
  }, [savedPath, osInfo, getDefaultPath, installPath])

  return {
    installPath,
    setInstallPath,
    savedPath,
  }
}
