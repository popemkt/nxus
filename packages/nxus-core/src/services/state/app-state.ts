import { create } from 'zustand'
import { persist, devtools } from 'zustand/middleware'
import type { Platform } from '../../types/app'

// --- Internal Store (Implementation Detail) ---

interface InstalledAppRecord {
  id: string // Unique ID for each installation
  appId: string
  installPath: string
  installedAt: number
  name?: string // Optional user-defined name
}

interface DevInfo {
  isDevMode: boolean
  devReposPath: string | null
  nxusRootPath: string | null
}

interface AppState {
  installedApps: Record<string, InstalledAppRecord[]> // Array of installations per app
  osInfo: { platform: Platform; arch: string; homeDir: string } | null
  devInfo: DevInfo | null
  actions: {
    addInstallation: (appId: string, path: string) => string // Returns installation ID
    removeInstallation: (appId: string, installationId: string) => void
    updateInstallationName: (
      appId: string,
      installationId: string,
      name: string,
    ) => void
    setOsInfo: (info: {
      platform: Platform
      arch: string
      homeDir: string
    }) => void
    setDevInfo: (info: DevInfo) => void
  }
}

function generateId(): string {
  return crypto.randomUUID()
}

const useStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        installedApps: {},
        osInfo: null,
        devInfo: null,
        actions: {
          addInstallation: (appId, path) => {
            const id = generateId()
            set((state) => ({
              installedApps: {
                ...state.installedApps,
                [appId]: [
                  ...(state.installedApps[appId] || []),
                  {
                    id,
                    appId,
                    installPath: path,
                    installedAt: Date.now(),
                  },
                ],
              },
            }))
            return id
          },
          removeInstallation: (appId, installationId) =>
            set((state) => {
              const installations = state.installedApps[appId] || []
              const filtered = installations.filter(
                (i) => i.id !== installationId,
              )

              if (filtered.length === 0) {
                // Remove the key entirely if no installations left
                const { [appId]: _, ...rest } = state.installedApps
                return { installedApps: rest }
              }

              return {
                installedApps: {
                  ...state.installedApps,
                  [appId]: filtered,
                },
              }
            }),
          updateInstallationName: (appId, installationId, name) =>
            set((state) => {
              const installations = state.installedApps[appId] || []
              const updated = installations.map((i) =>
                i.id === installationId ? { ...i, name } : i,
              )

              return {
                installedApps: {
                  ...state.installedApps,
                  [appId]: updated,
                },
              }
            }),
          setOsInfo: (info) => set({ osInfo: info }),
          setDevInfo: (info) => set({ devInfo: info }),
        },
      }),
      {
        name: 'nxus-app-storage-v4', // Bumped version for slug IDs
        partialize: (state) => ({ installedApps: state.installedApps }),
        version: 4,
        migrate: (persistedState: unknown, _version: number) => {
          return persistedState as any
        },
        merge: (persistedState, currentState) => ({
          ...currentState,
          ...(persistedState as object),
          actions: currentState.actions,
        }),
      },
    ),
  ),
)

// --- Public API ---

/**
 * Service object for imperative actions.
 * Returns Promises to allow for future migration to async backends (e.g., Convex, DB).
 */
export const appStateService = {
  addInstallation: async (appId: string, path: string): Promise<string> => {
    return useStore.getState().actions.addInstallation(appId, path)
  },
  /** @deprecated Use addInstallation instead */
  markAsInstalled: async (appId: string, path: string): Promise<void> => {
    useStore.getState().actions.addInstallation(appId, path)
  },
  removeInstallation: async (
    appId: string,
    installationId: string,
  ): Promise<void> => {
    useStore.getState().actions.removeInstallation(appId, installationId)
  },
  updateInstallationName: async (
    appId: string,
    installationId: string,
    name: string,
  ): Promise<void> => {
    useStore
      .getState()
      .actions.updateInstallationName(appId, installationId, name)
  },
  setOsInfo: (info: { platform: Platform; arch: string; homeDir: string }) => {
    useStore.getState().actions.setOsInfo(info)
  },
  setDevInfo: (info: DevInfo) => {
    useStore.getState().actions.setDevInfo(info)
  },
}

// Stable empty array to prevent infinite re-renders from new array references
const EMPTY_INSTALLATIONS: InstalledAppRecord[] = []

/**
 * Hook to get all installations for an app
 */
export const useAppInstallations = (appId: string): InstalledAppRecord[] => {
  const installations = useStore((state) => state.installedApps[appId])
  return installations ?? EMPTY_INSTALLATIONS
}

/**
 * Hook to check if an app is installed (has at least one installation).
 * Returns a reactive object with installation status.
 */
export const useAppCheck = (appId: string) => {
  const installations = useStore((state) => state.installedApps[appId])
  const safeInstallations = installations ?? EMPTY_INSTALLATIONS
  const isInstalled = safeInstallations.length > 0
  // For backwards compatibility, return the first installation's path
  const path = safeInstallations[0]?.installPath
  const installedAt = safeInstallations[0]?.installedAt

  return {
    isInstalled,
    path,
    installedAt,
    installationCount: safeInstallations.length,
  }
}

/**
 * Hook to get all installed apps
 */
export const useInstalledApps = () => {
  return useStore((state) => state.installedApps)
}

/**
 * Hook to get OS info
 */
export const useOsInfo = () => {
  return useStore((state) => state.osInfo)
}

/**
 * Hook to get dev mode info
 */
export const useDevInfo = () => {
  return useStore((state) => state.devInfo)
}

/**
 * Helper function to check if an installation path is a dev reference
 * (i.e., installed in the packages/repos folder for AI buildout reference)
 */
export function isDevReferencePath(
  installPath: string,
  devInfo: DevInfo | null,
): boolean {
  if (!devInfo?.isDevMode || !devInfo.devReposPath) {
    return false
  }
  return installPath.startsWith(devInfo.devReposPath)
}

// Re-export types for external use
export type { InstalledAppRecord, DevInfo }
