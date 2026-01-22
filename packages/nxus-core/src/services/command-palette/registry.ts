import { SYSTEM_TAGS } from '@/lib/system-tags'
import { getAppManifestPathServerFn } from '@/services/apps/docs.server'
import { appRegistryService } from '@/services/apps/registry.service'
import { openPathServerFn } from '@/services/shell/open-path.server'
import type {
    GenericBoundCommand,
    GenericCommand,
    ItemBoundCommand,
    UnifiedCommand,
} from '@/types/command'
import type { Item, ItemCommand } from '@/types/item'

/**
 * Command extended with app context for palette display
 * Uses composition pattern: embeds full App and AppCommand instead of flattening
 */
export interface PaletteCommand {
  /** Composite ID for keying: `${app.id}:${command.id}` */
  id: string
  /** Full app entity this command belongs to */
  app: Item
  /** Full command definition */
  command: ItemCommand
}

// Re-export GenericCommand for consumers that import from registry
export type { GenericCommand } from '@/types/command'

/**
 * Generic commands available globally
 */
export const genericCommands: GenericCommand[] = [
  {
    id: 'go-to-settings',
    name: 'Settings',
    icon: 'Gear',
    target: 'none',
    execute: () => {
      window.location.href = '/settings'
    },
  },
  {
    id: 'go-to-inbox',
    name: 'Go to Inbox',
    icon: 'Tray',
    target: 'none',
    execute: () => {
      window.location.href = '/inbox'
    },
  },
  {
    id: 'add-to-inbox',
    name: 'Add to Inbox',
    icon: 'Plus',
    target: 'none',
    execute: async () => {
      const { inboxModalService } = await import('@/stores/inbox-modal.store')
      inboxModalService.open()
    },
  },
  {
    id: 'go-to-app',
    name: 'Go to App',
    icon: 'ArrowSquareOut',
    target: 'item',
    execute: (appId) => {
      window.location.href = `/apps/${appId}`
    },
  },
  {
    id: 'generate-thumbnail',
    name: 'Generate Thumbnail',
    icon: 'Image',
    target: 'item',
    requirements: [
      {
        name: 'provider',
        tagId: SYSTEM_TAGS.AI_PROVIDER.id,
        label: 'AI Provider',
        description: 'Select which AI CLI to use for generation',
      },
    ],
    params: [
      {
        name: 'additionalPrompt',
        dataType: 'string',
        uiType: 'textarea',
        label: 'Additional Instructions',
        description: 'Extra prompt to append to default thumbnail prompt',
      },
    ],
    execute: async (appId, _targetPath, context) => {
      if (!appId) return

      const provider = context?.requirements?.provider
      const additionalPrompt = context?.params?.additionalPrompt as
        | string
        | undefined

      if (!provider) {
        console.error('No AI provider selected')
        return
      }

      const cliCommand = (provider.value as { cliCommand?: string })?.cliCommand
      if (!cliCommand) {
        console.error('AI provider has no cliCommand configured')
        return
      }

      // Get app details for the prompt
      const { appRegistryService } = await import(
        '@/services/apps/registry.service'
      )
      const appResult = appRegistryService.getAppById(appId)
      if (!appResult.success) return

      const app = appResult.data

      // Build the prompt
      const basePrompt = `Generate SVG image for app ${app.name}. ${app.description}. Style: Modern vibrant colors, simple iconic design, 800x450 aspect ratio, no text labels.`
      const fullPrompt = additionalPrompt
        ? `${basePrompt} Additional: ${additionalPrompt}`
        : basePrompt

      // Get paths
      const { getPackageRootServerFn } = await import(
        '@/services/db/db-actions.server'
      )
      const { path: nxusRoot } = await getPackageRootServerFn()

      const thumbnailFilename = `${app.id}.svg`
      const thumbnailsDir = `${nxusRoot}/public/thumbnails`

      // Build command - cliCommand should include any provider-specific flags
      // e.g., gemini -y, claude --allow-dangerously-skip-permissions, etc.
      const command = `${cliCommand} "${fullPrompt.replace(/"/g, '\\"')} Save it as SVG file named ${thumbnailFilename} in directory ${thumbnailsDir}."`

      // Execute in terminal
      const { commandExecutor } = await import(
        '@/services/command-palette/executor'
      )
      const { useTerminalStore } = await import('@/stores/terminal.store')
      const terminalStore = useTerminalStore.getState()

      await commandExecutor.executeInteractive({
        command,
        cwd: nxusRoot,
        tabName: `Generate Thumbnail: ${app.name}`,
        terminalStore,
      })
    },
  },
  {
    id: 'edit-manifest',
    name: 'Edit Manifest',
    icon: 'PencilSimple',
    target: 'item',
    execute: async (appId) => {
      if (!appId) return
      const paths = await getAppManifestPathServerFn({ data: { appId } })
      await openPathServerFn({ data: { path: paths.manifestPath } })
    },
  },
  {
    id: 'edit-docs',
    name: 'Edit Docs',
    icon: 'BookOpen',
    target: 'item',
    execute: async (appId) => {
      if (!appId) return
      const paths = await getAppManifestPathServerFn({ data: { appId } })
      if (paths.docsPath) {
        await openPathServerFn({ data: { path: paths.docsPath } })
      }
    },
  },
  {
    id: 'add-instance',
    name: 'Add Instance',
    icon: 'Plus',
    target: 'item',
    targetFilter: (app) => app.type === 'remote-repo',
    execute: async (appId) => {
      if (!appId) return
      // Import dynamically to avoid circular deps
      const { installModalService } = await import(
        '@/stores/install-modal.store'
      )
      const { appRegistryService } = await import(
        '@/services/apps/registry.service'
      )
      const result = appRegistryService.getAppById(appId)
      if (result.success && result.data.type === 'remote-repo') {
        installModalService.open(result.data)
      }
    },
  },
  {
    id: 'choose-existing-instance',
    name: 'Choose Existing Instance',
    icon: 'FolderPlus',
    target: 'item',
    targetFilter: (app) => app.type === 'remote-repo',
    execute: async (appId) => {
      if (!appId) return
      const { openFolderPickerServerFn } = await import(
        '@/services/shell/folder-picker.server'
      )
      const { appStateService } = await import('@/services/state/app-state')
      const { appRegistryService } = await import(
        '@/services/apps/registry.service'
      )
      const appResult = appRegistryService.getAppById(appId)
      if (!appResult.success) return

      const result = await openFolderPickerServerFn({
        data: { title: `Choose existing ${appResult.data.name} installation` },
      })
      if (result.success && result.path) {
        await appStateService.addInstallation(appId, result.path)
      }
    },
  },
  {
    id: 'open-folder',
    name: 'Open in File Explorer',
    icon: 'FolderOpen',
    target: 'instance',
    execute: (_appId, instancePath) => {
      if (instancePath) {
        // Will be handled by the palette executor
      }
    },
  },
  {
    id: 'open-terminal',
    name: 'Open Terminal Here',
    icon: 'Terminal',
    target: 'instance',
    execute: (_appId, instancePath) => {
      if (instancePath) {
        // Will be handled by the palette executor
      }
    },
  },
  // Database sync commands - run in terminal for visibility
  {
    id: 'db-seed',
    name: 'DB: Sync JSON → Database',
    icon: 'ArrowDown',
    target: 'none',
    execute: async () => {
      const { getPackageRootServerFn } = await import(
        '@/services/db/db-actions.server'
      )
      const { commandExecutor } = await import(
        '@/services/command-palette/executor'
      )
      const { useTerminalStore } = await import('@/stores/terminal.store')
      const { path: cwd } = await getPackageRootServerFn()
      const terminalStore = useTerminalStore.getState()
      await commandExecutor.executeInteractive({
        command: 'pnpm db:seed',
        cwd,
        tabName: 'DB: JSON → Database',
        terminalStore,
      })
    },
  },
  {
    id: 'db-export',
    name: 'DB: Sync Database → JSON',
    icon: 'ArrowUp',
    target: 'none',
    execute: async () => {
      const { getPackageRootServerFn } = await import(
        '@/services/db/db-actions.server'
      )
      const { commandExecutor } = await import(
        '@/services/command-palette/executor'
      )
      const { useTerminalStore } = await import('@/stores/terminal.store')
      const { path: cwd } = await getPackageRootServerFn()
      const terminalStore = useTerminalStore.getState()
      await commandExecutor.executeInteractive({
        command: 'pnpm db:export',
        cwd,
        tabName: 'DB: Database → JSON',
        terminalStore,
      })
    },
  },
  {
    id: 'db-migrate',
    name: 'DB: Migrate Manifests (One-time)',
    icon: 'Database',
    target: 'none',
    execute: async () => {
      const { getPackageRootServerFn } = await import(
        '@/services/db/db-actions.server'
      )
      const { commandExecutor } = await import(
        '@/services/command-palette/executor'
      )
      const { useTerminalStore } = await import('@/stores/terminal.store')
      const { path: cwd } = await getPackageRootServerFn()
      const terminalStore = useTerminalStore.getState()
      await commandExecutor.executeInteractive({
        command: 'pnpm db:migrate',
        cwd,
        tabName: 'DB: Migrate Manifests',
        terminalStore,
      })
    },
  },
]

class CommandRegistry {
  /**
   * Get all app-bound commands with app context
   */
  getAllAppCommands(): PaletteCommand[] {
    const appsResult = appRegistryService.getAllApps()
    if (!appsResult.success) return []

    const commands: PaletteCommand[] = []

    for (const app of appsResult.data) {
      if (!app.commands) continue

      for (const cmd of app.commands) {
        commands.push({
          id: `${app.id}:${cmd.id}`,
          app,
          command: cmd,
        })
      }
    }

    return commands
  }

  /**
   * Get all generic commands
   */
  getGenericCommands(): GenericCommand[] {
    return genericCommands
  }

  /**
   * Get all commands as unified type
   */
  getAllUnified(): UnifiedCommand[] {
    const itemCommands: ItemBoundCommand[] = this.getAllAppCommands().map(
      (pc) => ({
        source: 'item' as const,
        id: pc.id,
        app: pc.app,
        command: pc.command,
      }),
    )

    const genericCmds: GenericBoundCommand[] = genericCommands.map((gc) => ({
      source: 'generic' as const,
      id: gc.id,
      command: gc,
    }))

    return [...itemCommands, ...genericCmds]
  }

  /**
   * Search commands by query, with optional alias prioritization
   */
  search(
    query: string,
    aliases?: Record<string, string>,
  ): {
    appCommands: PaletteCommand[]
    genericCommands: GenericCommand[]
    aliasMatch?: { commandId: string; exact: boolean }
  } {
    const lowerQuery = query.toLowerCase().trim()

    if (!lowerQuery) {
      return {
        appCommands: this.getAllAppCommands(),
        genericCommands: this.getGenericCommands(),
      }
    }

    // Check for alias matches first
    let aliasMatch: { commandId: string; exact: boolean } | undefined
    const aliasMatchedIds = new Set<string>()

    if (aliases) {
      for (const [alias, commandId] of Object.entries(aliases)) {
        const lowerAlias = alias.toLowerCase()
        if (lowerAlias === lowerQuery) {
          aliasMatch = { commandId, exact: true }
          aliasMatchedIds.add(commandId)
        } else if (lowerAlias.startsWith(lowerQuery)) {
          if (!aliasMatch) {
            aliasMatch = { commandId, exact: false }
          }
          aliasMatchedIds.add(commandId)
        }
      }
    }

    // Get all commands that match by text
    const allAppCommands = this.getAllAppCommands()
    const textMatchedAppCommands = allAppCommands.filter(
      (cmd) =>
        cmd.command.name.toLowerCase().includes(lowerQuery) ||
        cmd.app.name.toLowerCase().includes(lowerQuery) ||
        cmd.command.description?.toLowerCase().includes(lowerQuery),
    )

    const allGenericCommands = this.getGenericCommands()
    const textMatchedGeneric = allGenericCommands.filter((cmd) =>
      cmd.name.toLowerCase().includes(lowerQuery),
    )

    // Sort: alias-matched commands first
    const sortByAlias = <T extends { id?: string }>(commands: T[]): T[] => {
      if (aliasMatchedIds.size === 0) return commands

      return [...commands].sort((a, b) => {
        const aId = 'id' in a ? a.id : undefined
        const bId = 'id' in b ? b.id : undefined
        const aIsAlias = aId && aliasMatchedIds.has(aId)
        const bIsAlias = bId && aliasMatchedIds.has(bId)
        if (aIsAlias && !bIsAlias) return -1
        if (!aIsAlias && bIsAlias) return 1
        return 0
      })
    }

    // Include alias-matched commands even if they don't match text query
    const aliasOnlyAppCommands = allAppCommands.filter(
      (cmd) =>
        aliasMatchedIds.has(cmd.id) &&
        !textMatchedAppCommands.some((tc) => tc.id === cmd.id),
    )
    const aliasOnlyGenericCommands = allGenericCommands.filter(
      (cmd) =>
        aliasMatchedIds.has(cmd.id) &&
        !textMatchedGeneric.some((tc) => tc.id === cmd.id),
    )

    const appCommands = sortByAlias([
      ...aliasOnlyAppCommands,
      ...textMatchedAppCommands,
    ])
    const generic = sortByAlias([
      ...aliasOnlyGenericCommands,
      ...textMatchedGeneric,
    ])

    return { appCommands, genericCommands: generic, aliasMatch }
  }

  /**
   * Get apps for target selection, optionally filtered by command
   */
  getAppsForTargetSelection(command?: GenericCommand): Item[] {
    const result = appRegistryService.getAllApps()
    if (!result.success) return []

    // Apply command's target filter if present
    if (command?.targetFilter) {
      return result.data.filter(command.targetFilter)
    }
    return result.data
  }

  /**
   * Determine execution action based on mode
   */
  getExecutionAction(cmd: PaletteCommand):
    | { type: 'navigate'; url: string }
    | { type: 'execute'; command: string }
    | { type: 'copy'; text: string }
    | { type: 'docs'; url: string }
    | { type: 'configure'; appId: string; commandId: string }
    | {
        type: 'script'
        appId: string
        scriptPath: string
        scriptSource?: string
        interactive: boolean
      }
    | { type: 'workflow'; appId: string; commandId: string } {
    const mode = cmd.command.mode ?? 'execute'
    switch (mode) {
      case 'configure':
        return {
          type: 'configure',
          appId: cmd.app.id,
          commandId: cmd.command.id,
        }
      case 'docs':
        return { type: 'docs', url: cmd.command.command }
      case 'copy':
        return { type: 'copy', text: cmd.command.command }
      case 'terminal':
        return {
          type: 'navigate',
          url: `/apps/${cmd.app.id}?action=${cmd.command.id}`,
        }
      case 'script':
        return {
          type: 'script',
          appId: cmd.app.id,
          scriptPath: cmd.command.command,
          scriptSource: cmd.command.scriptSource,
          interactive:
            (cmd.command.options as { interactive?: boolean })?.interactive ??
            false,
        }
      case 'workflow':
        return {
          type: 'workflow',
          appId: cmd.app.id,
          commandId: cmd.command.id,
        }
      case 'execute':
      default:
        return { type: 'execute', command: cmd.command.command }
    }
  }
}

export const commandRegistry = new CommandRegistry()
