import { create } from 'zustand'
import { persist, devtools } from 'zustand/middleware'

// --- Internal Store (Implementation Detail) ---

interface InstalledAppRecord {
  appId: string
  installPath: string
  installedAt: number
  // Potentially other metadata like version
}

interface AppState {
  installedApps: Record<string, InstalledAppRecord>
  actions: {
    markAsInstalled: (appId: string, path: string) => void
    removeInstallation: (appId: string) => void
  }
}

const useStore = create<AppState>()(
  devtools(
    persist(
      (set) => ({
        installedApps: {},
        actions: {
          markAsInstalled: (appId, path) =>
            set((state) => ({
              installedApps: {
                ...state.installedApps,
                [appId]: {
                  appId,
                  installPath: path,
                  installedAt: Date.now(),
                },
              },
            })),
          removeInstallation: (appId) =>
            set((state) => {
              const { [appId]: _, ...rest } = state.installedApps
              return { installedApps: rest }
            }),
        },
      }),
      {
        name: 'nxus-app-storage',
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
  markAsInstalled: async (id: string, path: string): Promise<void> => {
    useStore.getState().actions.markAsInstalled(id, path)
  },
  removeInstallation: async (id: string): Promise<void> => {
    useStore.getState().actions.removeInstallation(id)
  },
}

/**
 * Hook to check if an app is installed.
 * Returns a reactive object with installation status and path.
 */
/**
 * Hook to check if an app is installed.
 * Returns a reactive object with installation status and path.
 */
export const useAppCheck = (appId: string) => {
  const isInstalled = useStore((state) => !!state.installedApps[appId])
  const path = useStore((state) => state.installedApps[appId]?.installPath)
  const installedAt = useStore(
    (state) => state.installedApps[appId]?.installedAt,
  )

  return { isInstalled, path, installedAt }
}

/**
 * Hook to get all installed apps
 */
export const useInstalledApps = () => {
  return useStore((state) => state.installedApps)
}
