import type { App } from '@nxus-core/types/app';
import type { InstalledAppRecord } from '@nxus-core/services/state/app-state';
import type { TSCommand } from '@nxus-core/types/command';

/**
 * Context provided when executing a TypeScript handler command
 */
export interface CommandContext {
  app: App;
  instance?: InstalledAppRecord;
}

/**
 * TypeScript command handler function signature
 */
export type CommandHandler = (ctx: CommandContext) => Promise<void>;

/**
 * Module shape for command definitions in _commands/{folder}/index.ts
 */
interface CommandModule {
  commands: TSCommand[];
  handlers: Record<string, CommandHandler>;
}

/**
 * ⚠️ NOT TYPE-SAFE: Handler and command lookups are string-based.
 * Vite glob imports discover modules at build time.
 * App slug lookups have no compile-time guarantee.
 */
const commandModules = import.meta.glob<CommandModule>('./**/index.ts', {
  eager: true,
});

// Build registries from discovered modules
const commandsRegistry: TSCommand[] = [];
const handlersRegistry: Record<string, CommandHandler> = {};

for (const [path, module] of Object.entries(commandModules)) {
  // Skip the root index.ts (this file)
  if (path === './index.ts') continue;

  // Extract folder name from path like './_default/index.ts' -> '_default'
  const folderName = path.split('/')[1];

  // Collect commands
  if (module.commands) {
    commandsRegistry.push(...module.commands);
  }

  // Collect handlers with folder prefix to avoid collisions
  if (module.handlers) {
    for (const [name, handler] of Object.entries(module.handlers)) {
      // Store as 'folderName:handlerName' for qualified lookup
      // and plain 'handlerName' for unqualified lookup from _default
      if (folderName === '_default') {
        handlersRegistry[name] = handler;
      }
      handlersRegistry[`${folderName}:${name}`] = handler;
    }
  }
}

/**
 * Get all TypeScript handler commands
 */
export function getAllTSCommands(): TSCommand[] {
  return commandsRegistry;
}

/**
 * Get a handler by name
 * ⚠️ NOT TYPE-SAFE: Returns undefined if handler not found
 *
 * @param handlerName - Handler name, optionally prefixed with folder (e.g., 'pushToNotion' or 'linkwarden:customHandler')
 */
export function getHandler(handlerName: string): CommandHandler | undefined {
  return handlersRegistry[handlerName];
}
