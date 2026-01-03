import * as React from 'react'
import * as PhosphorIcons from '@phosphor-icons/react'
import { QuestionIcon, WarningIcon, CodeIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useItemStatus } from '@/services/state/item-status-state'
import { useToolConfigured } from '@/services/state/tool-config-state'
import { useCommandExecution } from '@/hooks/use-command-execution'
import { configureModalService } from '@/stores/configure-modal.store'
import { ScriptPreviewModal } from '@/components/app/script-preview-modal'
import type { AppCommand, ToolApp, App } from '@/types/app'

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
  command: AppCommand
  app: App
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

  // Get health check for tools
  const healthCheck = useItemStatus(app.id)
  const isInstalled = healthCheck?.isInstalled ?? true // Default true for non-tools

  // Get configuration status
  const requiredFields = React.useMemo(() => {
    if (app.type !== 'tool') return []
    return (
      (app as ToolApp).configSchema?.fields
        .filter((f) => f.required)
        .map((f) => f.key) ?? []
    )
  }, [app])
  const isConfigured = useToolConfigured(app.id, requiredFields)

  // Check if command uses script mode
  const isScriptMode = command.mode === 'script'

  // Build full script path from app.id and relative command path
  const scriptPath = React.useMemo(() => {
    if (!isScriptMode) return null
    // command.command contains relative path like "install.ps1"
    // Build full path: data/apps/{appId}/{command.command}
    return `file:///stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/data/apps/${app.id}/${command.command}`
  }, [isScriptMode, app.id, command.command])

  const handleClick = async () => {
    switch (command.mode) {
      case 'execute':
        if (onExecute) {
          onExecute(command.command)
        } else {
          const parts = command.command.split(' ')
          const cmd = parts[0]
          const args = parts.slice(1)
          await executeCommand(cmd, args)
        }
        break
      case 'script':
        // Run the script via pwsh with full path
        if (onExecute) {
          const fullPath = `/stuff/WorkSpace/Nxus/nxus/packages/nxus-core/src/data/apps/${app.id}/${command.command}`
          onExecute(`pwsh ${fullPath}`)
        }
        // TODO: open terminal with script
        break
      case 'copy':
        await navigator.clipboard.writeText(command.command)
        break
      case 'terminal':
        // TODO: Implement terminal opening
        break
      case 'docs':
        window.open(command.command, '_blank', 'noopener,noreferrer')
        break
      case 'configure':
        configureModalService.open(app.id, command.id)
        break
      default:
        if (onExecute) {
          onExecute(command.command)
        }
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
              isScriptMode ? 'rounded-r-none border-r-0' : ''
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
          {isScriptMode && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-1.5 rounded-l-none"
              onClick={() => setPreviewOpen(true)}
              title="View script"
            >
              <CodeIcon className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        {isScriptMode && scriptPath && (
          <ScriptPreviewModal
            scriptPath={scriptPath}
            open={previewOpen}
            onOpenChange={setPreviewOpen}
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
            isScriptMode ? 'rounded-r-none border-r-0' : ''
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
        {isScriptMode && (
          <Button
            variant="outline"
            className="px-2 rounded-l-none"
            onClick={() => setPreviewOpen(true)}
            title="View script"
          >
            <CodeIcon className="h-4 w-4" />
          </Button>
        )}
      </div>
      {isScriptMode && scriptPath && (
        <ScriptPreviewModal
          scriptPath={scriptPath}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
    </>
  )
}
