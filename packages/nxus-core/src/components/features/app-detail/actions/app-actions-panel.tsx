import { ConfigModal } from '@/components/features/app-detail/modals/config-modal'
import { ScriptParamsModal } from '@/components/features/app-detail/modals/script-params-modal'
import { ScriptPreviewModal } from '@/components/features/app-detail/modals/script-preview-modal'
import { WorkflowPreviewModal } from '@/components/features/app-detail/modals/workflow-preview-modal'
import { Button } from '@nxus/ui'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@nxus/ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@nxus/ui'
import { useToolHealth } from '@/hooks/use-tool-health'
import { handleCommandMode } from '@/lib/command-utils'
import { openTerminalWithCommandServerFn } from '@/services/shell/open-terminal-with-command.server'
import { parseScriptParamsServerFn } from '@/services/shell/parse-script-params.server'
import { getScriptFullPathServerFn } from '@/services/shell/read-script.server'
import type { ScriptParam } from '@/services/shell/script-param-adapters/types'
import { useToolConfigured } from '@/services/state/tool-config-state'
import type { Item, ItemCommand, ToolItem } from '@nxus/db'
import { getCommandString } from '@nxus/db'
import * as PhosphorIcons from '@phosphor-icons/react'
import {
  CodeIcon,
  DotsThree,
  FlowArrow,
  QuestionIcon,
  TerminalWindowIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { motion } from 'framer-motion'
import * as React from 'react'

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
  app: Item
  onRunCommand?: (command: string) => void
  onTerminal?: (command: string) => void
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
export function AppActionsPanel({
  app,
  onRunCommand,
  onTerminal,
}: AppActionsPanelProps) {
  const [error, setError] = React.useState<string | null>(null)
  const [configModalOpen, setConfigModalOpen] = React.useState(false)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [previewScriptPath, setPreviewScriptPath] = React.useState<
    string | null
  >(null)
  const [previewIsInline, setPreviewIsInline] = React.useState(false)
  const [workflowPreviewOpen, setWorkflowPreviewOpen] = React.useState(false)
  const [workflowPreviewCommand, setWorkflowPreviewCommand] =
    React.useState<ItemCommand | null>(null)

  // Script params modal state
  const [paramsModalOpen, setParamsModalOpen] = React.useState(false)
  const [scriptParams, setScriptParams] = React.useState<ScriptParam[]>([])
  const [pendingScriptCommand, setPendingScriptCommand] = React.useState<
    (ItemCommand & { mode: 'script' }) | null
  >(null)

  // Get health check for this tool (liveness) - uses TanStack Query via domain hook
  const healthCheck = useToolHealth(app)
  const isInstalled = healthCheck.isInstalled

  // Get configuration status (readiness)
  const requiredFields = React.useMemo(() => {
    if (app.type !== 'tool') return []
    const fields = (app as ToolItem).configSchema?.fields
    if (!Array.isArray(fields)) return []
    return fields.filter((f) => f.required).map((f) => f.key)
  }, [app])
  const isConfigured = useToolConfigured(app.id, requiredFields)

  // Get app-level commands
  const appCommands = React.useMemo(
    () => app.commands?.filter((cmd) => cmd.target === 'item') ?? [],
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

  const handleCommandClick = async (cmd: ItemCommand) => {
    console.log(
      '[handleCommandClick] Called with command:',
      cmd.id,
      'mode:',
      cmd.mode,
    )
    setError(null)

    // For script mode, check if script has parameters
    if (cmd.mode === 'script') {
      try {
        // Check if this is an interactive script
        const isInteractive =
          (cmd.options as { interactive?: boolean })?.interactive ?? false

        const result = await parseScriptParamsServerFn({
          data: {
            appId: app.id,
            scriptPath: cmd.command,
            scriptSource: cmd.scriptSource,
          },
        })

        if (result.success && result.params.length > 0) {
          // Has parameters - show modal
          setScriptParams(result.params)
          setPendingScriptCommand(cmd as ItemCommand & { mode: 'script' })
          setParamsModalOpen(true)
          return
        }

        // No parameters - resolve path and execute
        const resolved = await getScriptFullPathServerFn({
          data: {
            appId: app.id,
            scriptPath: cmd.command,
            scriptSource: cmd.scriptSource,
          },
        })
        const fullCommand = `pwsh "${resolved.fullPath}"`

        // Interactive scripts run in in-app PTY terminal (xterm.js), non-interactive run in background
        if (isInteractive) {
          onTerminal?.(fullCommand)
        } else {
          onRunCommand?.(fullCommand)
        }
        return
      } catch (err) {
        setError(`Failed to parse script parameters: ${(err as Error).message}`)
        return
      }
    }

    // Handle workflow mode specially - requires async executor
    if (cmd.mode === 'workflow') {
      console.log(
        '[Workflow] Detected workflow command:',
        cmd.id,
        'mode:',
        cmd.mode,
      )
      try {
        const { commandExecutor } = await import(
          '@/services/command-palette/executor'
        )
        console.log('[Workflow] Imported commandExecutor')
        const { useTerminalStore } = await import('@/stores/terminal.store')
        const terminalStore = useTerminalStore.getState()
        console.log('[Workflow] Got terminal store, executing workflow...')

        await commandExecutor.executeWorkflowCommand({
          appId: app.id,
          commandId: cmd.id,
          terminalStore,
          onNotify: (message, level) => {
            console.log(`[Workflow ${level}]: ${message}`)
            // TODO: Show toast notification
          },
        })
        console.log('[Workflow] Workflow execution completed')
      } catch (err) {
        console.error('[Workflow] Execution failed:', err)
        setError(`Workflow execution failed: ${(err as Error).message}`)
      }
      return
    }

    // Other modes handled by shared utility
    const cmdString = getCommandString(cmd)
    if (!cmdString) {
      setError(`Command ${cmd.id} does not have a command string`)
      return
    }
    const result = handleCommandMode(cmd.mode || 'execute', cmdString, app.id, {
      onExecute: onRunCommand,
      onTerminal: onTerminal,
      onConfigure: () => setConfigModalOpen(true),
    })

    if (!result.handled && result.error) {
      setError(result.error)
    }
  }

  // Handle script execution with parameters
  const handleScriptRun = async (
    values: Record<string, string | number | boolean>,
  ) => {
    if (!pendingScriptCommand) return

    // Check if this is an interactive script
    const isInteractive =
      (pendingScriptCommand.options as { interactive?: boolean })
        ?.interactive ?? false

    // Build command with parameters
    const params = Object.entries(values)
      .filter(([, v]) => v !== '' && v !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'boolean') {
          return value ? `-${key}` : ''
        }
        return `-${key} "${value}"`
      })
      .filter(Boolean)
      .join(' ')

    // Resolve script path using server-side resolver
    const resolved = await getScriptFullPathServerFn({
      data: {
        appId: app.id,
        scriptPath: pendingScriptCommand.command,
        scriptSource: pendingScriptCommand.scriptSource,
      },
    })

    const fullCommand = `pwsh "${resolved.fullPath}" ${params}`

    // Interactive scripts run in PTY terminal, non-interactive run in background
    if (isInteractive) {
      onTerminal?.(fullCommand)
    } else {
      onRunCommand?.(fullCommand)
    }
    setPendingScriptCommand(null)
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
                const isWorkflowMode = cmd.mode === 'workflow'
                const hasAuxButton =
                  isScriptMode ||
                  cmd.mode === 'execute' ||
                  cmd.mode === 'terminal' ||
                  isWorkflowMode

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
                          hasAuxButton ? 'rounded-r-none border-r-0' : ''
                        } ${
                          needsAttention
                            ? 'border-amber-500/50 hover:border-amber-500'
                            : ''
                        }`}
                        onClick={() => handleCommandClick(cmd)}
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
                      {/* Workflow preview button */}
                      {isWorkflowMode && cmd.workflow && (
                        <Button
                          variant="outline"
                          className="px-2 rounded-l-none"
                          onClick={() => {
                            setWorkflowPreviewCommand(cmd)
                            setWorkflowPreviewOpen(true)
                          }}
                          title="View workflow"
                        >
                          <FlowArrow className="h-4 w-4" />
                        </Button>
                      )}
                      {/* Auxiliary actions dropdown for script, execute, and terminal modes */}
                      {(isScriptMode ||
                        cmd.mode === 'execute' ||
                        cmd.mode === 'terminal') && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              className="px-2 rounded-l-none"
                              title="More actions"
                            >
                              <DotsThree className="h-4 w-4" weight="bold" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent
                            align="end"
                            className="min-w-[180px]"
                          >
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={() => {
                                setPreviewScriptPath(cmd.command)
                                setPreviewIsInline(
                                  cmd.mode === 'execute' ||
                                    cmd.mode === 'terminal',
                                )
                                setPreviewOpen(true)
                              }}
                            >
                              <CodeIcon className="h-4 w-4" />
                              <span>
                                {isScriptMode ? 'View Script' : 'View Command'}
                              </span>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="gap-2"
                              onClick={async () => {
                                // Resolve script path for terminal
                                let fullCommand: string
                                if (isScriptMode) {
                                  const resolved =
                                    await getScriptFullPathServerFn({
                                      data: {
                                        appId: app.id,
                                        scriptPath: cmd.command,
                                        scriptSource: cmd.scriptSource,
                                      },
                                    })
                                  fullCommand = `pwsh "${resolved.fullPath}"`
                                } else {
                                  fullCommand = cmd.command
                                }
                                await openTerminalWithCommandServerFn({
                                  data: { command: fullCommand },
                                })
                              }}
                            >
                              <TerminalWindowIcon className="h-4 w-4" />
                              <span>Open in Terminal</span>
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
      {app.type === 'tool' && (app as ToolItem).configSchema && (
        <ConfigModal
          app={app as ToolItem}
          open={configModalOpen}
          onOpenChange={setConfigModalOpen}
        />
      )}

      {/* Script/Command Preview Modal */}
      {previewScriptPath && (
        <ScriptPreviewModal
          appId={app.id}
          scriptPath={previewScriptPath}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          isInlineCommand={previewIsInline}
        />
      )}

      {/* Script Parameters Modal */}
      {pendingScriptCommand && (
        <ScriptParamsModal
          scriptName={pendingScriptCommand.command}
          params={scriptParams}
          open={paramsModalOpen}
          onOpenChange={setParamsModalOpen}
          onRun={handleScriptRun}
        />
      )}

      {/* Workflow Preview Modal */}
      {workflowPreviewCommand?.workflow && (
        <WorkflowPreviewModal
          commandName={workflowPreviewCommand.name}
          workflow={workflowPreviewCommand.workflow}
          open={workflowPreviewOpen}
          onOpenChange={setWorkflowPreviewOpen}
        />
      )}
    </>
  )
}
