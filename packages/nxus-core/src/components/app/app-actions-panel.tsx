import * as React from 'react'
import { motion } from 'framer-motion'
import * as PhosphorIcons from '@phosphor-icons/react'
import { QuestionIcon } from '@phosphor-icons/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToolHealth } from '@/services/state/tool-health-state'
import type { App } from '@/types/app'

/**
 * Dynamic icon component that renders Phosphor icons by name
 * Falls back to QuestionIcon if the icon is not found
 */
function CommandIcon({ iconName }: { iconName: string }) {
  const iconKey = iconName.endsWith('Icon') ? iconName : `${iconName}Icon`
  const IconComponent = (
    PhosphorIcons as unknown as Record<
      string,
      React.ComponentType<{ 'data-icon'?: string }>
    >
  )[iconKey]

  if (IconComponent) {
    return <IconComponent data-icon="inline-start" />
  }

  return <QuestionIcon data-icon="inline-start" />
}

interface AppActionsPanelProps {
  app: App
  onRunCommand?: (command: string) => void
}

/**
 * App-level actions panel for tools and app-scoped commands
 * Shows commands with target === 'app'
 */
export function AppActionsPanel({ app, onRunCommand }: AppActionsPanelProps) {
  const [error, setError] = React.useState<string | null>(null)

  // Get health check for this tool
  const healthCheck = useToolHealth(app.id)
  const isInstalled = healthCheck?.isInstalled ?? false

  // Get app-level commands
  const appCommands = React.useMemo(
    () => app.commands?.filter((cmd) => cmd.target === 'app') ?? [],
    [app.commands],
  )

  // Group commands by category
  const commandsByCategory = React.useMemo(() => {
    const groups: Record<string, typeof appCommands> = {}
    appCommands.forEach((cmd) => {
      if (!groups[cmd.category]) {
        groups[cmd.category] = []
      }
      groups[cmd.category].push(cmd)
    })
    return groups
  }, [appCommands])

  const handleCommandClick = (command: string, mode: string) => {
    setError(null)

    switch (mode) {
      case 'execute':
        onRunCommand?.(command)
        break
      case 'copy':
        // TODO: Show modal with copyable text
        navigator.clipboard.writeText(command)
        alert(`Copied to clipboard:\n\n${command}`)
        break
      case 'terminal':
        // TODO: Open terminal with command pre-filled
        alert(`Terminal mode not yet implemented:\n\n${command}`)
        break
      case 'docs':
        // Open URL in new tab
        window.open(command, '_blank', 'noopener,noreferrer')
        break
      default:
        setError(`Unknown command mode: ${mode}`)
    }
  }

  // Determine if a command should be disabled based on health check
  const isCommandDisabled = (commandId: string): boolean => {
    // Install command: only enabled when NOT installed
    if (commandId.startsWith('install-')) {
      return isInstalled
    }

    // Update/Uninstall commands: only enabled when installed
    if (commandId.startsWith('update-') || commandId.startsWith('uninstall-')) {
      return !isInstalled
    }

    // All other commands (docs, etc): always enabled
    return false
  }

  if (appCommands.length === 0) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>App Actions</CardTitle>
        <CardDescription>Manage and configure this tool</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-xs text-destructive">{error}</p>}

        {Object.entries(commandsByCategory).map(([category, commands]) => (
          <div key={category} className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {category}
            </p>
            {commands.map((cmd, index) => {
              const disabled = isCommandDisabled(cmd.id)

              return (
                <motion.div
                  key={cmd.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.15, delay: index * 0.05 }}
                >
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() =>
                      handleCommandClick(cmd.command, cmd.mode || 'execute')
                    }
                    disabled={disabled}
                  >
                    <CommandIcon iconName={cmd.icon} />
                    <span className="flex-1 text-left">{cmd.name}</span>
                    {cmd.description && (
                      <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                        {cmd.description}
                      </span>
                    )}
                  </Button>
                </motion.div>
              )
            })}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
