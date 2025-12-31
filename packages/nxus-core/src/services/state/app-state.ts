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
        migrate: (persistedState: unknown, version: number) => {
          let state = persistedState as any

          // Migration from v1 to v2
          if (version < 2) {
            const newInstalledApps: Record<string, InstalledAppRecord[]> = {}
            if (state.installedApps) {
              for (const [appId, record] of Object.entries(
                state.installedApps,
              ) as any) {
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
            state = { ...state, installedApps: newInstalledApps }
          }

          // Migration to v4 (UUID to slug IDs)
          if (version < 4) {
            const ID_MAP: Record<string, string> = {
              '550e8400-e29b-41d4-a716-446655440001': 'sample-html',
              'a1b2c3d4-e5f6-7890-abcd-ef1234567890': 'remote-example',
              'b3c4d5e6-f7a8-4012-a123-4b3456789012': 'chrome-new-tab',
              'c5d6e7f8-a9b0-4123-b234-5c4567890123': 'automaker',
              'd6e7f8a9-b0c1-4234-8345-6d5678901234': 'client-side-databases',
              'e7f8a9b0-c1d2-4345-8456-7e6789012345': 'linkwarden',
              'f5e6d7c8-b9a0-4123-8c34-5d4567890123': 'openrecall',
            }

            const migratedApps: Record<string, InstalledAppRecord[]> = {}
            if (state.installedApps) {
              for (const [appId, installations] of Object.entries(
                state.installedApps,
              )) {
                const newId = ID_MAP[appId] || appId
                migratedApps[newId] = (
                  installations as InstalledAppRecord[]
                ).map((i) => ({
                  ...i,
                  appId: newId,
                }))
              }
            }
            state = { ...state, installedApps: migratedApps }
          }

          return state
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
