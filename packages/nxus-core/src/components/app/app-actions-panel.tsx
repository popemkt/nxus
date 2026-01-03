import * as React from 'react'
import { motion } from 'framer-motion'
import * as PhosphorIcons from '@phosphor-icons/react'
import { QuestionIcon, WarningIcon, CodeIcon } from '@phosphor-icons/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useItemStatus } from '@/services/state/item-status-state'
import { useToolConfigured } from '@/services/state/tool-config-state'
import { ConfigModal } from '@/components/app/config-modal'
import { ScriptPreviewModal } from '@/components/app/script-preview-modal'
import { handleCommandMode } from '@/lib/command-utils'
import type { App, ToolApp } from '@/types/app'

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
 *
 * Command States:
 * - Disabled: Liveness check failed (tool not installed)
 * - Needs Attention: Liveness OK but readiness failed (not configured)
 * - Ready: Both checks pass
 */
export function AppActionsPanel({ app, onRunCommand }: AppActionsPanelProps) {
  const [error, setError] = React.useState<string | null>(null)
  const [configModalOpen, setConfigModalOpen] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewScriptPath, setPreviewScriptPath] = React.useState<
    string | null
  >(null)

  // Get health check for this tool (liveness)
  const healthCheck = useItemStatus(app.id)
  const isInstalled = healthCheck?.isInstalled ?? false

  // Get configuration status (readiness)
  const requiredFields = React.useMemo(() => {
    if (app.type !== 'tool') return []
    return (
      (app as ToolApp).configSchema?.fields
        .filter((f) => f.required)
        .map((f) => f.key) ?? []
    )
  }, [app])
  const isConfigured = useToolConfigured(app.id, requiredFields)

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

  const handleCommandClick = (
    commandId: string,
    command: string,
    mode: string,
  ) => {
    setError(null)

    const result = handleCommandMode(mode, command, app.id, {
      onExecute: onRunCommand,
      onConfigure: () => setConfigModalOpen(true),
    })

    if (!result.handled && result.error) {
      setError(result.error)
    }
  }

  /**
   * Determine command state based on liveness and readiness checks
   * Returns: 'disabled' | 'needs-attention' | 'ready'
   */
  const getCommandState = (
    commandId: string,
  ): 'disabled' | 'needs-attention' | 'ready' => {
    // Install command: only enabled when NOT installed
    if (commandId.startsWith('install-')) {
      return isInstalled ? 'disabled' : 'ready'
    }

    // Update/Uninstall commands: only enabled when installed
    if (commandId.startsWith('update-') || commandId.startsWith('uninstall-')) {
      return !isInstalled ? 'disabled' : 'ready'
    }

    // Configure command: needs attention if not configured
    if (commandId === 'configure' || commandId.startsWith('configure-')) {
      if (!isConfigured) return 'needs-attention'
      return 'ready'
    }

    // Commands that depend on configuration (like env setup)
    if (
      commandId.includes('glm') ||
      commandId.includes('env') ||
      commandId.includes('setup')
    ) {
      if (!isInstalled) return 'disabled'
      if (!isConfigured) return 'needs-attention'
      return 'ready'
    }

    // All other commands: check liveness only
    return 'ready'
  }

  if (appCommands.length === 0) {
    return null
  }

  return (
    <>
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
                const state = getCommandState(cmd.id)
                const isDisabled = state === 'disabled'
                const needsAttention = state === 'needs-attention'
                const isScriptMode = cmd.mode === 'script'

                return (
                  <motion.div
                    key={cmd.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.15, delay: index * 0.05 }}
                  >
                    <div className="flex w-full">
                      <Button
                        variant="outline"
                        className={`flex-1 justify-start ${
                          isScriptMode ? 'rounded-r-none border-r-0' : ''
                        } ${
                          needsAttention
                            ? 'border-amber-500/50 hover:border-amber-500'
                            : ''
                        }`}
                        onClick={() =>
                          handleCommandClick(
                            cmd.id,
                            cmd.command,
                            cmd.mode || 'execute',
                          )
                        }
                        disabled={isDisabled}
                      >
                        <CommandIcon iconName={cmd.icon} />
                        <span className="flex-1 text-left">{cmd.name}</span>
                        {needsAttention && (
                          <WarningIcon
                            className="h-4 w-4 text-amber-500"
                            weight="fill"
                          />
                        )}
                        {cmd.description && !needsAttention && (
                          <span className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">
                            {cmd.description}
                          </span>
                        )}
                      </Button>
                      {isScriptMode && (
                        <Button
                          variant="outline"
                          className="px-2 rounded-l-none"
                          onClick={() => {
                            setPreviewScriptPath(cmd.command)
                            setPreviewOpen(true)
                          }}
                          disabled={isDisabled}
                          title="View script"
                        >
                          <CodeIcon className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Config Modal */}
      {app.type === 'tool' && (app as ToolApp).configSchema && (
        <ConfigModal
          app={app as ToolApp}
          open={configModalOpen}
          onOpenChange={setConfigModalOpen}
        />
      )}

      {/* Script Preview Modal */}
      {previewScriptPath && (
        <ScriptPreviewModal
          appId={app.id}
          scriptPath={previewScriptPath}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
    </>
  )
}
