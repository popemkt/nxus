import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger, Button ,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle, Checkbox , Separator 
} from '@nxus/ui'
import { getCommandString, hasCommandString } from '@nxus/db'
import * as PhosphorIcons from '@phosphor-icons/react'
import {
  ArrowsClockwiseIcon,
  FolderOpenIcon,
  HammerIcon,
  PackageIcon,
  PlayIcon,
  QuestionIcon,
  TerminalWindowIcon,
  TrashIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'framer-motion'
import * as React from 'react'
import type { Item, ItemType } from '@nxus/db'
import type {GitStatus} from '@/services/apps/git-status.server';
import type {InstalledAppRecord} from '@/services/state/app-state';
import {
  
  checkGitStatusServerFn
} from '@/services/apps/git-status.server'
import { uninstallAppServerFn } from '@/services/apps/uninstall.server'
import { openPathServerFn } from '@/services/shell/open-path.server'
import { openTerminalServerFn } from '@/services/shell/open-terminal.server'
import {
  
  appStateService
} from '@/services/state/app-state'

/**
 * Dynamic icon component that renders Phosphor icons by name
 * Falls back to QuestionIcon if the icon is not found
 */
function CommandIcon({ iconName }: { iconName: string }) {
  // Try to find the icon in Phosphor (add "Icon" suffix if not present)
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

  // Fallback
  return <QuestionIcon data-icon="inline-start" />
}

interface InstanceAction {
  id: string
  label: string
  description?: string
  icon: React.ComponentType<{ className?: string }>
  command?: string
  handler?: 'open-folder' | 'open-terminal' | 'remove'
  variant?: 'default' | 'destructive'
}

interface InstanceActionsPanelProps {
  instance: InstalledAppRecord | null
  app: Item
  onRunCommand?: (command: string, cwd: string) => void
  /** Increment this to trigger git status refresh (e.g., after git pull) */
  gitStatusRefreshKey?: number
}

/**
 * Dynamic actions panel for the selected instance
 * Shows type-specific actions based on the app type
 */
export function InstanceActionsPanel({
  instance,
  app,
  onRunCommand,
  gitStatusRefreshKey = 0,
}: InstanceActionsPanelProps) {
  const [error, setError] = React.useState<string | null>(null)
  const [isRemoving, setIsRemoving] = React.useState(false)
  const [deleteFromDisk, setDeleteFromDisk] = React.useState(false)
  const [gitStatus, setGitStatus] = React.useState<GitStatus | null>(null)
  const [checkingGit, setCheckingGit] = React.useState(false)

  // Get type-specific actions - merge from all types
  const defaultActions = React.useMemo(
    () => getActionsForTypes(app.types ?? []),
    [app.types],
  )

  // Get custom commands from app config
  const customCommands = app.commands ?? []

  // Merge defaults with custom commands, applying overrides
  const actions = React.useMemo(() => {
    const merged = { ...defaultActions }

    // Apply overrides from custom commands to default actions
    customCommands.forEach((cmd) => {
      if (cmd.override) {
        // Find the default action to override
        const primaryIndex = merged.primary.findIndex(
          (a) => a.id === cmd.override,
        )
        if (primaryIndex !== -1) {
          // Replace with custom command
          merged.primary[primaryIndex] = {
            id: cmd.id,
            label: cmd.name,
            description: cmd.description,
            icon: HammerIcon, // Will use CommandIcon dynamically
            command: hasCommandString(cmd) ? cmd.command : undefined,
          }
        }
      }
    })

    return merged
  }, [defaultActions, customCommands, app.type])

  // Check git status when instance changes or refresh key increments
  React.useEffect(() => {
    if (!instance || !app.types?.includes('remote-repo')) {
      setGitStatus(null)
      return
    }

    const checkGit = async () => {
      setCheckingGit(true)
      try {
        const status = await checkGitStatusServerFn({
          data: { path: instance.installPath },
        })
        setGitStatus(status)
      } catch (err) {
        console.error('Failed to check git status:', err)
        setGitStatus(null)
      } finally {
        setCheckingGit(false)
      }
    }

    checkGit()
  }, [instance, app.types, gitStatusRefreshKey])

  if (!instance) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Instance Actions</CardTitle>
          <CardDescription>
            Select an instance to see available actions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <FolderOpenIcon className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground">
              No instance selected
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const handleOpenFolder = async () => {
    setError(null)
    try {
      const result = await openPathServerFn({
        data: { path: instance.installPath },
      })
      if (!result.success) {
        setError(result.error || 'Failed to open folder')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const handleOpenTerminal = async () => {
    setError(null)
    try {
      const result = await openTerminalServerFn({
        data: { path: instance.installPath },
      })
      if (!result.success) {
        setError(result.error || 'Failed to open terminal')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    }
  }

  const handleRunCommand = (command: string) => {
    onRunCommand?.(command, instance.installPath)
  }

  const handleRemove = async () => {
    setIsRemoving(true)
    setError(null)

    try {
      if (deleteFromDisk) {
        const result = await uninstallAppServerFn({
          data: {
            installPath: instance.installPath,
            deleteFromDisk: true,
          },
        })

        if (!result.success) {
          setError(result.error || 'Failed to delete files')
          setIsRemoving(false)
          return
        }
      }

      await appStateService.removeInstallation(app.id, instance.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setIsRemoving(false)
      setDeleteFromDisk(false)
    }
  }

  const handleAction = (action: InstanceAction) => {
    if (action.handler === 'open-folder') {
      handleOpenFolder()
    } else if (action.command) {
      handleRunCommand(action.command)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Instance Actions</CardTitle>
        <AnimatePresence mode="wait">
          <motion.div
            key={instance.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <CardDescription
              className="font-mono text-xs truncate"
              title={instance.installPath}
            >
              {instance.installPath}
            </CardDescription>
          </motion.div>
        </AnimatePresence>
      </CardHeader>
      <AnimatePresence mode="wait">
        <motion.div
          key={instance.id}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <CardContent className="space-y-4">
            {error && <p className="text-xs text-destructive">{error}</p>}

            {/* Primary Actions */}
            {actions.primary.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Development
                </p>
                {actions.primary.map((action, index) => {
                  const Icon = action.icon
                  return (
                    <motion.div
                      key={action.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15, delay: index * 0.05 }}
                    >
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => handleAction(action)}
                      >
                        <Icon data-icon="inline-start" />
                        <span className="flex-1 text-left">{action.label}</span>
                        {action.description && (
                          <span className="text-xs text-muted-foreground font-mono">
                            {action.description}
                          </span>
                        )}
                      </Button>
                    </motion.div>
                  )
                })}
              </div>
            )}

            {/* Git Updates for remote repos */}
            {app.types?.includes('remote-repo') &&
              actions.secondary.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Updates
                  </p>
                  {actions.secondary.map((action, index) => {
                    const Icon = action.icon
                    const hasUpdates =
                      gitStatus?.behindBy && gitStatus.behindBy > 0
                    const isGitPull = action.id === 'git-pull'

                    return (
                      <motion.div
                        key={action.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.15, delay: index * 0.05 }}
                      >
                        <Button
                          variant={
                            hasUpdates && isGitPull ? 'default' : 'outline'
                          }
                          className="w-full justify-start"
                          onClick={() => handleAction(action)}
                          disabled={
                            checkingGit ||
                            (isGitPull && !gitStatus?.gitInstalled)
                          }
                        >
                          <Icon data-icon="inline-start" />
                          <span className="flex-1 text-left">
                            {action.label}
                          </span>
                          {checkingGit && isGitPull && (
                            <span className="text-xs text-muted-foreground">
                              Checking...
                            </span>
                          )}
                          {!checkingGit && hasUpdates && isGitPull && (
                            <span className="text-xs font-mono">
                              {gitStatus.behindBy} behind
                            </span>
                          )}
                          {!checkingGit &&
                            gitStatus?.isUpToDate &&
                            isGitPull && (
                              <span className="text-xs text-muted-foreground">
                                Up to date
                              </span>
                            )}
                          {!checkingGit &&
                            gitStatus &&
                            !gitStatus.gitInstalled &&
                            isGitPull && (
                              <span className="text-xs text-destructive">
                                Git not installed
                              </span>
                            )}
                        </Button>
                      </motion.div>
                    )
                  })}
                </div>
              )}

            {/* Custom Commands from app config */}
            {customCommands.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Custom Commands
                </p>
                {customCommands
                  .filter((cmd) => cmd.target === 'instance' && !cmd.override)
                  .map((cmd, index) => (
                    <motion.div
                      key={cmd.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.15, delay: index * 0.05 }}
                    >
                      <Button
                        variant="outline"
                        className="w-full justify-start"
                        onClick={() => {
                          const cmdString = getCommandString(cmd)
                          if (cmdString) handleRunCommand(cmdString)
                        }}
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
                  ))}
              </div>
            )}

            {/* Quick Actions */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Quick Actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={handleOpenFolder}
                >
                  <FolderOpenIcon data-icon="inline-start" />
                  Open Folder
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="justify-start"
                  onClick={handleOpenTerminal}
                >
                  <TerminalWindowIcon data-icon="inline-start" />
                  Terminal
                </Button>
              </div>
            </div>

            <Separator />

            {/* Danger Zone */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Manage
              </p>

              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-destructive hover:text-destructive hover:bg-destructive/10"
                      disabled={isRemoving}
                    />
                  }
                >
                  <TrashIcon data-icon="inline-start" />
                  Remove Instance
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogMedia className="bg-destructive/10 text-destructive">
                      <WarningIcon className="h-5 w-5" />
                    </AlertDialogMedia>
                    <AlertDialogTitle>Remove Instance</AlertDialogTitle>
                    <AlertDialogDescription>
                      <span className="font-mono text-xs break-all block mb-3">
                        {instance.installPath}
                      </span>
                      Choose how to remove this instance.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="flex items-center gap-2 py-2">
                    <Checkbox
                      id="delete-from-disk"
                      checked={deleteFromDisk}
                      onCheckedChange={(checked: boolean) =>
                        setDeleteFromDisk(checked)
                      }
                    />
                    <label
                      htmlFor="delete-from-disk"
                      className="text-sm cursor-pointer select-none"
                    >
                      Also delete files from disk
                    </label>
                  </div>

                  {deleteFromDisk && (
                    <p className="text-xs text-destructive">
                      ⚠️ This will permanently delete all files in this folder!
                    </p>
                  )}

                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleRemove}
                      variant={deleteFromDisk ? 'destructive' : 'default'}
                    >
                      {deleteFromDisk ? 'Delete from Disk' : 'Forget Instance'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </motion.div>
      </AnimatePresence>
    </Card>
  )
}

/**
 * Actions defined per type - used for merging when item has multiple types
 */
const TYPE_ACTIONS: Record<
  ItemType,
  { primary: Array<InstanceAction>; secondary: Array<InstanceAction> }
> = {
  'remote-repo': {
    primary: [
      {
        id: 'install-deps',
        label: 'Install Dependencies',
        description: 'npm install',
        icon: PackageIcon,
        command: 'npm install',
      },
      {
        id: 'build',
        label: 'Build',
        description: 'npm run build',
        icon: HammerIcon,
        command: 'npm run build',
      },
      {
        id: 'start',
        label: 'Start Dev Server',
        description: 'npm run dev',
        icon: PlayIcon,
        command: 'npm run dev',
      },
    ],
    secondary: [
      {
        id: 'git-pull',
        label: 'Pull Latest',
        icon: ArrowsClockwiseIcon,
        command: 'git pull',
      },
    ],
  },
  typescript: {
    primary: [
      {
        id: 'build',
        label: 'Build',
        description: 'npm run build',
        icon: HammerIcon,
        command: 'npm run build',
      },
      {
        id: 'start',
        label: 'Start',
        description: 'npm run start',
        icon: PlayIcon,
        command: 'npm run start',
      },
    ],
    secondary: [],
  },
  html: {
    primary: [
      {
        id: 'open-browser',
        label: 'Open in Browser',
        icon: PlayIcon,
        handler: 'open-folder',
      },
    ],
    secondary: [],
  },
  tool: {
    primary: [],
    secondary: [],
  },
}

/**
 * Get merged actions from all types.
 * Actions are deduplicated by ID (first occurrence wins).
 */
function getActionsForTypes(types: Array<ItemType>): {
  primary: Array<InstanceAction>
  secondary: Array<InstanceAction>
} {
  const primaryMap = new Map<string, InstanceAction>()
  const secondaryMap = new Map<string, InstanceAction>()

  for (const type of types) {
    const actions = TYPE_ACTIONS[type]
    if (!actions) continue

    // Add primary actions (deduplicate by ID)
    for (const action of actions.primary) {
      if (!primaryMap.has(action.id)) {
        primaryMap.set(action.id, action)
      }
    }

    // Add secondary actions (deduplicate by ID)
    for (const action of actions.secondary) {
      if (!secondaryMap.has(action.id)) {
        secondaryMap.set(action.id, action)
      }
    }
  }

  return {
    primary: Array.from(primaryMap.values()),
    secondary: Array.from(secondaryMap.values()),
  }
}
