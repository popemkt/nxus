/**
 * Utility functions for executing commands from various UI contexts
 *
 * This ensures command definitions (requirements, params, execute logic)
 * are defined in ONE place (registry.ts) and reused everywhere.
 */

import type { GenericCommandContext } from '@nxus/db'
import { commandRegistry } from '@/services/command-palette/registry'
import { commandParamsModalService } from '@/stores/command-params-modal.store'

/**
 * Execute a GenericCommand by ID with the params modal if needed
 *
 * This is the single entry point for executing generic commands from:
 * - Command palette
 * - UI buttons (like Generate Thumbnail on app detail page)
 *
 * @param commandId - The GenericCommand.id to execute
 * @param targetId - Optional target (appId, instanceId, etc.)
 * @param targetPath - Optional target path
 */
export async function executeGenericCommandById(
  commandId: string,
  context: GenericCommandContext,
  targetId?: string,
  targetPath?: string,
): Promise<void> {
  const command = commandRegistry
    .getGenericCommands()
    .find((c) => c.id === commandId)

  if (!command) {
    console.error(`Command not found: ${commandId}`)
    return
  }

  // Check if command has requirements or params - show modal
  const hasRequirements =
    command.requirements && command.requirements.length > 0
  const hasParams = command.params && command.params.length > 0

  if (hasRequirements || hasParams) {
    commandParamsModalService.open({
      title: command.name,
      description: `Configure ${command.name}`,
      requirements: command.requirements,
      params: command.params,
      onComplete: (result) => {
        // Convert RequirementOption to expected format
        const reqContext: Record<
          string,
          { appId: string; value: Record<string, unknown> }
        > = {}
        for (const [name, opt] of Object.entries(result.requirements)) {
          reqContext[name] = { appId: opt.appId, value: opt.value }
        }
        Promise.resolve(
          command.execute(targetId, targetPath, {
            navigate: context.navigate,
            requirements: reqContext,
            params: result.params,
          }),
        ).catch((err: unknown) => {
          console.error(`Command '${commandId}' execution failed:`, err)
        })
      },
    })
  } else {
    // No requirements/params - execute directly
    await command.execute(targetId, targetPath, context)
  }
}
