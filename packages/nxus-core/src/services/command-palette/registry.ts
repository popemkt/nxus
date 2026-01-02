import { appRegistryService } from '@/services/apps/registry.service'
import type { App, CommandMode } from '@/types/app'

/**
 * Command extended with app context for palette display
 */
export interface PaletteCommand {
  id: string
  commandId: string
  appId: string
  appName: string
  name: string
  description?: string
  icon: string
  mode: CommandMode
  command: string
  target: 'app' | 'instance'
}

/**
 * Generic command that may need target selection
 */
export interface GenericCommand {
  id: string
  name: string
  icon: string
  needsTarget?: 'app' | 'instance' | false
  execute: (targetId?: string, targetPath?: string) => void
}

/**
 * Generic commands available globally
 */
export const genericCommands: GenericCommand[] = [
  {
    id: 'go-to-settings',
    name: 'Settings',
    icon: 'Gear',
    needsTarget: false,
    execute: () => {
      window.location.href = '/settings'
    },
  },
  {
    id: 'go-to-app',
    name: 'Go to App',
    icon: 'ArrowSquareOut',
    needsTarget: 'app',
    execute: (appId) => {
      window.location.href = `/apps/${appId}`
    },
  },
  {
    id: 'generate-thumbnail',
    name: 'Generate Thumbnail',
    icon: 'Image',
    needsTarget: 'app',
    execute: (appId) => {
      window.location.href = `/apps/${appId}?action=generate-thumbnail`
    },
  },
  {
    id: 'open-folder',
    name: 'Open in File Explorer',
    icon: 'FolderOpen',
    needsTarget: 'instance',
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
    needsTarget: 'instance',
    execute: (_appId, instancePath) => {
      if (instancePath) {
        // Will be handled by the palette executor
      }
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
          commandId: cmd.id,
          appId: app.id,
          appName: app.name,
          name: cmd.name,
          description: cmd.description,
          icon: cmd.icon,
          mode: cmd.mode ?? 'execute',
          command: cmd.command,
          target: cmd.target,
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
   * Search commands by query
   */
  search(query: string): {
    appCommands: PaletteCommand[]
    genericCommands: GenericCommand[]
  } {
    const lowerQuery = query.toLowerCase().trim()

    if (!lowerQuery) {
      return {
        appCommands: this.getAllAppCommands(),
        genericCommands: this.getGenericCommands(),
      }
    }

    const appCommands = this.getAllAppCommands().filter(
      (cmd) =>
        cmd.name.toLowerCase().includes(lowerQuery) ||
        cmd.appName.toLowerCase().includes(lowerQuery) ||
        cmd.description?.toLowerCase().includes(lowerQuery),
    )

    const generic = this.getGenericCommands().filter((cmd) =>
      cmd.name.toLowerCase().includes(lowerQuery),
    )

    return { appCommands, genericCommands: generic }
  }

  /**
   * Get apps for target selection
   */
  getAppsForTargetSelection(): App[] {
    const result = appRegistryService.getAllApps()
    return result.success ? result.data : []
  }

  /**
   * Determine execution action based on mode
   */
  getExecutionAction(
    cmd: PaletteCommand,
  ):
    | { type: 'navigate'; url: string }
    | { type: 'execute'; command: string }
    | { type: 'copy'; text: string }
    | { type: 'docs'; url: string }
    | { type: 'configure'; appId: string; commandId: string } {
    switch (cmd.mode) {
      case 'configure':
        return {
          type: 'configure',
          appId: cmd.appId,
          commandId: cmd.commandId,
        }
      case 'docs':
        return { type: 'docs', url: cmd.command }
      case 'copy':
        return { type: 'copy', text: cmd.command }
      case 'terminal':
        return {
          type: 'navigate',
          url: `/apps/${cmd.appId}?action=${cmd.commandId}`,
        }
      case 'execute':
      default:
        return { type: 'execute', command: cmd.command }
    }
  }
}

export const commandRegistry = new CommandRegistry()
