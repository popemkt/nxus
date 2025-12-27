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

interface AppState {
  installedApps: Record<string, InstalledAppRecord[]> // Array of installations per app
  osInfo: { platform: Platform; arch: string; homeDir: string } | null
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
        },
      }),
      {
        name: 'nxus-app-storage-v3', // Bumped version for new schema
        partialize: (state) => ({ installedApps: state.installedApps }),
        version: 3,
        migrate: (persistedState: unknown, version: number) => {
          // Migration from v1 (single install per app) to v2 (array of installs)
          if (version < 2) {
            const oldState = persistedState as {
              installedApps?: Record<
                string,
                { appId: string; installPath: string; installedAt: number }
              >
            }
            const newInstalledApps: Record<string, InstalledAppRecord[]> = {}

            if (oldState.installedApps) {
              for (const [appId, record] of Object.entries(
                oldState.installedApps,
              )) {
                newInstalledApps[appId] = [
                  {
                    id: generateId(),
                    appId: record.appId,
                    installPath: record.installPath,
                    installedAt: record.installedAt,
                  },
                ]
              }
            }

            return { installedApps: newInstalledApps }
          }
          // Migration from v2 to v3 (optional name field - no data change needed as it's optional)
          if (version < 3) {
            // Just return valid v2 state, name is optional
            return persistedState as object
          }
          return persistedState as object
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

// Re-export type for external use
export type { InstalledAppRecord }
