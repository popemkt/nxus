import * as React from 'react'
import * as PhosphorIcons from '@phosphor-icons/react'
import { QuestionIcon, WarningIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useToolHealth } from '@/services/state/item-status-state'
import { useToolConfigured } from '@/services/state/tool-config-state'
import { useCommandExecution } from '@/hooks/use-command-execution'
import { configureModalService } from '@/stores/configure-modal.store'
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

  // Get health check for tools
  const healthCheck = useToolHealth(app.id)
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
      <Button
        variant="outline"
        size="sm"
        className={`inline-flex gap-1.5 h-7 px-2 ${
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
    )
  }

  return (
    <Button
      variant="outline"
      className={`w-full justify-start ${
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
  )
}
