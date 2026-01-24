import { ScriptPreviewModal } from '@/components/features/app-detail/modals/script-preview-modal'
import { Button } from '@nxus/ui'
import { useCommandExecution } from '@/hooks/use-command-execution'
import { useToolHealth } from '@/hooks/use-tool-health'
import { handleCommandMode } from '@/lib/command-utils'
import { useToolConfigured } from '@/services/state/tool-config-state'
import { configureModalService } from '@/stores/configure-modal.store'
import type { Item, ItemCommand, ToolItem } from '@/types/item'
import { getCommandString } from '@/types/item'
import * as PhosphorIcons from '@phosphor-icons/react'
import { CodeIcon, QuestionIcon, WarningIcon } from '@phosphor-icons/react'
import * as React from 'react'

/**
 * Dynamic icon component that renders Phosphor icons by name
 */
function CommandIcon({
  iconName,
  className,
}: {
  iconName: string
  className?: string
}) {
  const iconKey = iconName.endsWith('Icon') ? iconName : `${iconName}Icon`
  const IconComponent = (
    PhosphorIcons as unknown as Record<
      string,
      React.ComponentType<{ className?: string }>
    >
  )[iconKey]

  if (IconComponent) {
    return <IconComponent className={className} />
  }

  return <QuestionIcon className={className} />
}

interface CommandButtonProps {
  command: ItemCommand
  app: Item
  /** Compact mode for inline rendering in docs */
  compact?: boolean
  /** Custom click handler - if not provided, uses default behavior */
  onExecute?: (command: string) => void
  className?: string
}

/**
 * Standalone command button that can be embedded in documentation
 * Handles all command modes: execute, copy, terminal, docs, configure
 */
export function CommandButton({
  command,
  app,
  compact = false,
  onExecute,
  className,
}: CommandButtonProps) {
  const { executeCommand } = useCommandExecution({})
  const [previewOpen, setPreviewOpen] = React.useState(false)

  // Get health check for tools - uses TanStack Query via domain hook
  const healthCheck = useToolHealth(app)
  const isInstalled = healthCheck.isInstalled

  // Get configuration status
  const requiredFields = React.useMemo(() => {
    if (app.type !== 'tool') return []
    return (
      (app as ToolItem).configSchema?.fields
        .filter((f) => f.required)
        .map((f) => f.key) ?? []
    )
  }, [app])
  const isConfigured = useToolConfigured(app.id, requiredFields)

  // Check if command uses script, execute, or terminal mode
  const isScriptMode = command.mode === 'script'
  const isExecuteMode = command.mode === 'execute'
  const isTerminalMode = command.mode === 'terminal'
  const showPreviewButton = isScriptMode || isExecuteMode || isTerminalMode

  const handleClick = async () => {
    // Handle workflow mode specially - requires async executor
    if (command.mode === 'workflow') {
      const { commandExecutor } = await import(
        '@/services/command-palette/executor'
      )
      const { useTerminalStore } = await import('@/stores/terminal.store')
      const terminalStore = useTerminalStore.getState()

      await commandExecutor.executeWorkflowCommand({
        appId: app.id,
        commandId: command.id,
        terminalStore,
        onNotify: (message, level) => {
          console.log(`[Workflow ${level}]: ${message}`)
          // TODO: Show toast notification
        },
      })
      return
    }

    // Use shared handler for most modes
    const cmdString = getCommandString(command)
    if (!cmdString) {
      console.warn(`Command ${command.id} does not have a command string`)
      return
    }
    const result = handleCommandMode(
      command.mode || 'execute',
      cmdString,
      app.id,
      {
        onExecute:
          onExecute ??
          ((cmd) => {
            const parts = cmd.split(' ')
            const cmdName = parts[0]
            const args = parts.slice(1)
            executeCommand(cmdName, args)
          }),
        onConfigure: () => configureModalService.open(app.id, command.id),
      },
    )

    // If not handled by shared utility, it's an unknown mode
    if (!result.handled) {
      console.warn(result.error)
    }
  }

  // Determine button state
  const getState = (): 'disabled' | 'needs-attention' | 'ready' => {
    if (command.id.startsWith('install-')) {
      return isInstalled ? 'disabled' : 'ready'
    }
    if (
      command.id.startsWith('update-') ||
      command.id.startsWith('uninstall-')
    ) {
      return !isInstalled ? 'disabled' : 'ready'
    }
    if (command.id === 'configure' || command.id.startsWith('configure-')) {
      return !isConfigured ? 'needs-attention' : 'ready'
    }
    return 'ready'
  }

  const state = getState()
  const isDisabled = state === 'disabled'
  const needsAttention = state === 'needs-attention'

  if (compact) {
    return (
      <>
        <div className="inline-flex">
          <Button
            variant="outline"
            size="sm"
            className={`inline-flex gap-1.5 h-7 px-2 ${
              showPreviewButton ? 'rounded-r-none border-r-0' : ''
            } ${
              needsAttention ? 'border-amber-500/50 hover:border-amber-500' : ''
            } ${className ?? ''}`}
            onClick={handleClick}
            disabled={isDisabled}
          >
            <CommandIcon iconName={command.icon} className="h-3.5 w-3.5" />
            <span className="text-xs">{command.name}</span>
            {needsAttention && (
              <WarningIcon className="h-3 w-3 text-amber-500" weight="fill" />
            )}
          </Button>
          {showPreviewButton && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-1.5 rounded-l-none"
              onClick={() => setPreviewOpen(true)}
              title={isScriptMode ? 'View script' : 'View command'}
            >
              <CodeIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {showPreviewButton && (
          <ScriptPreviewModal
            appId={app.id}
            scriptPath={getCommandString(command) ?? ''}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
            isInlineCommand={isExecuteMode || isTerminalMode}
          />
        )}
      </>
    )
  }

  return (
    <>
      <div className="flex w-full">
        <Button
          variant="outline"
          className={`flex-1 justify-start ${
            showPreviewButton ? 'rounded-r-none border-r-0' : ''
          } ${
            needsAttention ? 'border-amber-500/50 hover:border-amber-500' : ''
          } ${className ?? ''}`}
          onClick={handleClick}
          disabled={isDisabled}
        >
          <CommandIcon iconName={command.icon} className="h-4 w-4 mr-2" />
          <span className="flex-1 text-left">{command.name}</span>
          {needsAttention && (
            <WarningIcon className="h-4 w-4 text-amber-500" weight="fill" />
          )}
          {command.description && !needsAttention && (
            <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
              {command.description}
            </span>
          )}
        </Button>
        {showPreviewButton && (
          <Button
            variant="outline"
            className="px-2 rounded-l-none"
            onClick={() => setPreviewOpen(true)}
            title={isScriptMode ? 'View script' : 'View command'}
          >
            <CodeIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
      {showPreviewButton && (
        <ScriptPreviewModal
          appId={app.id}
          scriptPath={getCommandString(command) ?? ''}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          isInlineCommand={isExecuteMode || isTerminalMode}
        />
      )}
    </>
  )
}
