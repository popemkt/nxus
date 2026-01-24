import { checkCommandAvailability } from '@/hooks/use-command'
import { commandExecutor } from '@/services/command-palette/executor'
import {
  commandRegistry,
  type PaletteCommand,
} from '@/services/command-palette/registry'
import {
  useCommandPaletteStore,
  type ActionPanelCommand,
} from '@/stores/command-palette.store'
import { configureModalService } from '@/stores/configure-modal.store'
import { matchesKeybinding, useSettingsStore } from '@/stores/settings.store'
import { useTerminalStore } from '@/stores/terminal.store'
import type { GenericCommand } from '@nxus/db'
import * as PhosphorIcons from '@phosphor-icons/react'
import {
  ArrowLeftIcon,
  CaretRightIcon,
  CommandIcon,
  CopyIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  PlayIcon,
  QuestionIcon,
  TerminalWindowIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'

import { ScriptParamsModal } from '@/components/features/app-detail/modals/script-params-modal'
import {
  aliasUtils,
  getAliasesServerFn,
} from '@/services/command-palette/alias.server'
import { openTerminalWithCommandServerFn } from '@/services/shell/open-terminal-with-command.server'
import type { ScriptParam } from '@/services/shell/script-param-adapters/types'
import type { ItemType } from '@nxus/db'
import { getCommandString } from '@nxus/db'

function DynamicIcon({
  name,
  className,
}: {
  name: string
  className?: string
}) {
  const iconKey = name.endsWith('Icon') ? name : `${name}Icon`
  const IconComponent = (
    PhosphorIcons as unknown as Record<
      string,
      React.ComponentType<{ className?: string }>
    >
  )[iconKey]
  return IconComponent ? (
    <IconComponent className={className} />
  ) : (
    <QuestionIcon className={className} />
  )
}

/**
 * Get available actions for a command based on its mode
 */
function getActionsForCommand(cmd: ActionPanelCommand) {
  const actions = []

  // Run is always available for executable commands
  if (['execute', 'script', 'terminal'].includes(cmd.mode)) {
    actions.push({
      id: 'run',
      name: cmd.mode === 'terminal' ? 'Run in Terminal' : 'Run',
      icon: cmd.mode === 'terminal' ? TerminalWindowIcon : PlayIcon,
      shortcut: '↵',
    })
  }

  // Preview/View Script
  if (['execute', 'script', 'terminal'].includes(cmd.mode)) {
    actions.push({
      id: 'preview',
      name: cmd.mode === 'script' ? 'View Script' : 'Preview Command',
      icon: EyeIcon,
      shortcut: '⌘P',
    })
  }

  // Open in Terminal (for executable commands that aren't already terminal mode)
  if (['execute', 'script'].includes(cmd.mode)) {
    actions.push({
      id: 'open-terminal',
      name: 'Open in Terminal',
      icon: TerminalWindowIcon,
      shortcut: '⌘T',
    })
  }

  // Copy
  if (cmd.command) {
    actions.push({
      id: 'copy',
      name: 'Copy Command',
      icon: CopyIcon,
      shortcut: '⌘C',
    })
  }

  return actions
}

/**
 * ActionPanel - Shows auxiliary actions for a selected command
 */
function ActionPanel({
  command,
  onAction,
  onBack,
}: {
  command: ActionPanelCommand
  onAction: (actionId: string) => void
  onBack: () => void
}) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const actions = getActionsForCommand(command)

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % actions.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + actions.length) % actions.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      onAction(actions[selectedIndex].id)
    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault()
      onBack()
    }
  }

  return (
    <div className="p-2" onKeyDown={handleKeyDown} tabIndex={0}>
      <div className="flex items-center gap-2 px-2 py-1 mb-2">
        <button
          onClick={onBack}
          className="p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <span className="text-xs font-medium text-muted-foreground uppercase">
          Actions for
        </span>
        <span className="text-xs font-medium truncate">{command.name}</span>
      </div>

      {actions.map((action, idx) => {
        const Icon = action.icon
        const isSelected = selectedIndex === idx
        return (
          <button
            key={action.id}
            onClick={() => onAction(action.id)}
            className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md text-left ${
              isSelected
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted'
            }`}
          >
            <Icon
              className={`h-4 w-4 ${isSelected ? 'text-primary-foreground' : 'text-muted-foreground'}`}
            />
            <span>{action.name}</span>
            <span
              className={`ml-auto text-xs ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
            >
              {action.shortcut}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export function CommandPalette() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedItemRef = useRef<HTMLButtonElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [aliases, setAliases] = useState<Record<string, string>>({})

  // Script params modal state
  const [scriptParamsModalOpen, setScriptParamsModalOpen] = useState(false)
  const [scriptParams, setScriptParams] = useState<ScriptParam[]>([])
  const [pendingScriptExecution, setPendingScriptExecution] = useState<{
    appId: string
    appType: ItemType
    appName: string
    commandName: string
    scriptPath: string
    scriptSource?: string
    interactive?: boolean
  } | null>(null)

  const {
    isOpen,
    isFromGallery,
    step,
    query,
    selectedCommand,
    actionPanelCommand,
    close,
    toggle,
    setQuery,
    selectCommand,
    openActions,
    closeActions,
    reset,
  } = useCommandPaletteStore()
  const { createTab, createInteractiveTab, addLog, setStatus } =
    useTerminalStore()

  // Detect if we're on the gallery (home) route
  const routerState = useRouterState()
  const isGalleryView = routerState.location.pathname === '/'

  // Note: Command availability reactivity is now handled by TanStack Query
  // via checkCommandAvailability which reads from the query cache

  // Global keyboard shortcut
  const commandPaletteBinding = useSettingsStore(
    (s) => s.keybindings.commandPalette,
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matchesKeybinding(e, commandPaletteBinding)) {
        e.preventDefault()
        toggle(isGalleryView)
      }
      if (e.key === 'Escape' && isOpen) {
        if (step === 'target') {
          reset()
        } else {
          close()
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [toggle, close, isOpen, step, reset, commandPaletteBinding, isGalleryView])

  // Load aliases when palette opens (ensures fresh data from settings)
  useEffect(() => {
    if (isOpen) {
      getAliasesServerFn().then(setAliases)
    }
  }, [isOpen])

  // Search results
  const results = useMemo(() => {
    if (step === 'target') {
      // Show apps or instances for target selection, filtered by command
      // Look up full command from registry
      const fullCommand =
        selectedCommand?.source === 'generic'
          ? commandRegistry
              .getGenericCommands()
              .find((c) => c.id === selectedCommand.command.id)
          : undefined
      const apps = commandRegistry.getAppsForTargetSelection(fullCommand)
      const lowerQuery = query.toLowerCase()
      return apps.filter(
        (app) =>
          !lowerQuery ||
          app.name.toLowerCase().includes(lowerQuery) ||
          app.id.toLowerCase().includes(lowerQuery),
      )
    }
    return commandRegistry.search(query, aliases)
  }, [query, step, selectedCommand, aliases])

  // Flatten results for keyboard navigation
  const items = useMemo(() => {
    if (step === 'target') {
      return results as ReturnType<
        typeof commandRegistry.getAppsForTargetSelection
      >
    }
    const searchResults = results as ReturnType<typeof commandRegistry.search>
    return [...searchResults.genericCommands, ...searchResults.appCommands]
  }, [results, step])

  // Create command ID → alias lookup for badge display
  const commandToAlias = useMemo(() => {
    const map: Record<string, string> = {}
    for (const [alias, commandId] of Object.entries(aliases)) {
      map[commandId] = alias
    }
    return map
  }, [aliases])

  // Helper function to find the next enabled item index
  const findNextEnabledIndex = (
    startIndex: number,
    direction: 'forward' | 'backward',
  ): number => {
    if (step !== 'command' || items.length === 0) return startIndex

    let currentIndex = startIndex
    let iterations = 0
    const maxIterations = items.length

    while (iterations < maxIterations) {
      const item = items[currentIndex]
      // Check if it's an app command and if it's disabled
      if ('app' in item) {
        const availability = getCommandAvailability(item as PaletteCommand)
        if (availability.canExecute) return currentIndex
      } else {
        // Generic commands are never disabled
        return currentIndex
      }

      // Move to next/previous index
      if (direction === 'forward') {
        currentIndex = (currentIndex + 1) % items.length
      } else {
        currentIndex = (currentIndex - 1 + items.length) % items.length
      }
      iterations++
    }

    // If all items are disabled, return the start index
    return startIndex
  }

  // Focus input when opened and select first enabled item
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      const firstEnabledIndex = findNextEnabledIndex(0, 'forward')
      setSelectedIndex(firstEnabledIndex)
    }
  }, [isOpen, step])

  // Reset selection to first enabled item when query changes
  useEffect(() => {
    const firstEnabledIndex = findNextEnabledIndex(0, 'forward')
    setSelectedIndex(firstEnabledIndex)
  }, [query])

  // Scroll selected item into view
  useEffect(() => {
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'auto', // Instant scroll, no animation
      })
    }
  }, [selectedIndex])

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle ArrowLeft/Escape in actions step to go back
    if (step === 'actions' && (e.key === 'ArrowLeft' || e.key === 'Escape')) {
      e.preventDefault()
      e.stopPropagation()
      closeActions()
      return
    }

    // Handle space key for alias-to-target auto-advance
    if (e.key === ' ' && step === 'command') {
      const trimmedQuery = query.trim()
      // Check if query matches an alias exactly
      const matchedCommandId = aliasUtils.findExactMatch(trimmedQuery, aliases)
      if (matchedCommandId) {
        // Find the command in genericCommands
        const cmd = commandRegistry
          .getGenericCommands()
          .find((c) => c.id === matchedCommandId)
        if (cmd?.target && cmd.target !== 'none') {
          e.preventDefault()
          selectCommand({ source: 'generic', id: cmd.id, command: cmd })
          return
        }
      }
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev: number) => {
        const nextIndex = (prev + 1) % items.length
        return findNextEnabledIndex(nextIndex, 'forward')
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev: number) => {
        const nextIndex = (prev - 1 + items.length) % items.length
        return findNextEnabledIndex(nextIndex, 'backward')
      })
    } else if (e.key === 'Tab' || e.key === 'ArrowRight') {
      // Open action panel for app commands
      e.preventDefault()
      if (step !== 'command' || items.length === 0) return

      const selectedItem = items[selectedIndex]
      // Only app commands have auxiliary actions, not generic commands
      if (!('target' in selectedItem) && 'command' in selectedItem) {
        const cmd = selectedItem as PaletteCommand
        openActions({
          id: cmd.id,
          name: cmd.command.name,
          appId: cmd.app.id,
          appName: cmd.app.name,
          mode: cmd.command.mode || 'execute',
          command: getCommandString(cmd.command) || '',
        })
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items.length === 0) return

      const selectedItem = items[selectedIndex]
      if (step === 'target') {
        executeGenericCommand((selectedItem as any).id)
      } else if (step === 'actions') {
        // Actions panel handles its own Enter key
        return
      } else {
        // Check if it's a generic command or app command
        if ('target' in selectedItem && 'execute' in selectedItem) {
          // Generic command
          const cmd = selectedItem as GenericCommand
          const cmdTarget = cmd.target ?? 'none'
          if (cmdTarget !== 'none') {
            selectCommand({ source: 'generic', id: cmd.id, command: cmd })
          } else {
            close()
            cmd.execute()
          }
        } else {
          // App command
          executeAppCommand(selectedItem as any)
        }
      }
    }
  }

  // Check command availability using declarative requirements
  const getCommandAvailability = (cmd: PaletteCommand) => {
    // Use the command's declared requirements (not app dependencies)
    // This is the key change - commands only check their own requirements

    // Get the app's checkCommand for self-installation checks
    const selfCheckCommand =
      cmd.app.type === 'tool' ? (cmd.app as any).checkCommand : undefined

    return checkCommandAvailability(
      {
        ...cmd.command,
        mode: cmd.command.mode ?? 'execute',
        category: '',
      },
      {
        appId: cmd.app.id,
        appType: cmd.app.type,
      },
      selfCheckCommand,
    )
  }

  // Execute app command
  const executeAppCommand = async (cmd: PaletteCommand) => {
    // Check availability first
    const availability = getCommandAvailability(cmd)
    if (!availability.canExecute) {
      // Don't execute disabled commands
      return
    }

    const action = commandRegistry.getExecutionAction(cmd)
    close()

    switch (action.type) {
      case 'navigate':
        navigate({ to: action.url })
        break
      case 'docs':
        window.open(action.url, '_blank', 'noopener,noreferrer')
        break
      case 'copy':
        await navigator.clipboard.writeText(action.text)
        break
      case 'configure':
        configureModalService.open(action.appId, action.commandId)
        break
      case 'script': {
        // Use centralized script executor which handles interactive option
        const result = await commandExecutor.executeScript({
          appId: action.appId,
          appType: cmd.app.type,
          scriptPath: action.scriptPath,
          scriptSource: action.scriptSource,
          interactive: action.interactive,
          tabName: `${cmd.app.name}: ${cmd.command.name}`,
          terminalStore: { createTab, createInteractiveTab, addLog, setStatus },
          onNeedsParams: (params) => {
            // Script has parameters - open modal to collect them
            setScriptParams(params as ScriptParam[])
            setPendingScriptExecution({
              appId: action.appId,
              appType: cmd.app.type,
              appName: cmd.app.name,
              commandName: cmd.command.name,
              scriptPath: action.scriptPath,
              scriptSource: action.scriptSource,
              interactive: action.interactive,
            })
            setScriptParamsModalOpen(true)
          },
        })

        // If needs params, modal will handle execution - don't close palette yet
        // (modal is already open from onNeedsParams callback)
        if (!result.needsParams) {
          // Script executed without params
        }
        break
      }
      case 'execute': {
        // Use centralized executor
        await commandExecutor.executeStreaming({
          command: action.command,
          appId: cmd.app.id,
          appType: cmd.app.type,
          tabName: `${cmd.app.name}: ${cmd.command.name}`,
          terminalStore: { createTab, createInteractiveTab, addLog, setStatus },
        })
        break
      }
      case 'workflow': {
        // Execute workflow command
        await commandExecutor.executeWorkflowCommand({
          appId: action.appId,
          commandId: action.commandId,
          terminalStore: { createTab, createInteractiveTab, addLog, setStatus },
          onNotify: (message, level) => {
            // TODO: Show toast notification
            console.log(`[Workflow ${level}]: ${message}`)
          },
        })
        break
      }
    }
  }

  // Execute generic command - uses centralized utility for single source of truth
  const executeGenericCommand = async (appId: string) => {
    if (!selectedCommand || selectedCommand.source !== 'generic') return
    close()

    // Use centralized utility to ensure command definition is in ONE place
    const { executeGenericCommandById } = await import(
      '@/lib/command-execution'
    )
    await executeGenericCommandById(selectedCommand.command.id, appId)
  }

  // Handle action panel action execution
  const handleActionPanelAction = async (actionId: string) => {
    if (!actionPanelCommand) return

    switch (actionId) {
      case 'run': {
        // Execute the command normally
        const cmd = commandRegistry
          .search('')
          .appCommands.find(
            (c) =>
              c.appId === actionPanelCommand.appId &&
              c.id === actionPanelCommand.id,
          )
        if (cmd) {
          executeAppCommand(cmd)
        }
        break
      }
      case 'preview': {
        // For now, copy to clipboard with a "preview" message
        // In the future, this could open a preview modal
        close()
        alert(`Command: ${actionPanelCommand.command}`)
        break
      }
      case 'open-terminal': {
        // Open command in OS terminal
        close()
        await openTerminalWithCommandServerFn({
          data: { command: actionPanelCommand.command },
        })
        break
      }
      case 'copy': {
        close()
        await navigator.clipboard.writeText(actionPanelCommand.command)
        break
      }
    }
  }

  // Handle script params modal submit
  const handleScriptParamsSubmit = async (
    values: Record<string, string | number | boolean>,
  ) => {
    if (!pendingScriptExecution) return

    const {
      appId,
      appType,
      appName,
      commandName,
      scriptPath,
      scriptSource,
      interactive,
    } = pendingScriptExecution

    // Execute with collected params
    await commandExecutor.executeScript({
      appId,
      appType,
      scriptPath,
      scriptSource,
      interactive,
      params: values,
      tabName: `${appName}: ${commandName}`,
      terminalStore: { createTab, createInteractiveTab, addLog, setStatus },
    })

    // Clean up
    setPendingScriptExecution(null)
    setScriptParams([])
    close()
  }

  if (!isOpen && !scriptParamsModalOpen) return null

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              onClick={close}
            />

            {/* Palette - HUD bar styling */}
            <motion.div
              layoutId={isFromGallery && isGalleryView ? 'hud-bar' : undefined}
              initial={
                isFromGallery && isGalleryView
                  ? undefined
                  : { opacity: 0, scale: 0.95, y: -10 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={
                isFromGallery && isGalleryView
                  ? undefined
                  : { opacity: 0, scale: 0.95, y: -10 }
              }
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="relative w-full max-w-xl bg-background/85 backdrop-blur-xl border border-foreground/10 radius-panel shadow-[0_20px_40px_rgba(0,0,0,0.25)] overflow-hidden"
            >
              {/* Header - HUD bar pill style */}
              <div className="flex items-center gap-2 h-[52px] px-4">
                {step === 'target' && (
                  <button
                    onClick={reset}
                    className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-foreground/10 transition-colors"
                  >
                    <ArrowLeftIcon className="h-4 w-4" />
                  </button>
                )}
                <MagnifyingGlassIcon className="h-4 w-4 text-foreground/40 shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    step === 'target' && selectedCommand?.source === 'generic'
                      ? `Select target for "${selectedCommand.command.name}"...`
                      : 'Search commands...'
                  }
                  className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-foreground/40"
                />
                <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-1 text-[10px] text-foreground/50 bg-foreground/8 rounded-md">
                  <CommandIcon className="h-3 w-3" />
                  <span>K</span>
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto">
                {step === 'command' ? (
                  <>
                    {/* Generic commands */}
                    {(results as ReturnType<typeof commandRegistry.search>)
                      .genericCommands.length > 0 && (
                      <div className="p-2">
                        <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                          Actions
                        </p>
                        {(
                          results as ReturnType<typeof commandRegistry.search>
                        ).genericCommands.map((cmd, idx) => (
                          <button
                            key={cmd.id}
                            ref={selectedIndex === idx ? selectedItemRef : null}
                            onClick={() => {
                              const cmdTarget = cmd.target ?? 'none'
                              if (cmdTarget !== 'none') {
                                selectCommand({
                                  source: 'generic',
                                  id: cmd.id,
                                  command: cmd,
                                })
                              } else {
                                close()
                                cmd.execute()
                              }
                            }}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md text-left ${
                              selectedIndex === idx
                                ? 'bg-primary text-primary-foreground'
                                : 'hover:bg-muted'
                            }`}
                          >
                            <DynamicIcon
                              name={cmd.icon}
                              className={`h-4 w-4 ${selectedIndex === idx ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                            />
                            <span>{cmd.name}</span>
                            {commandToAlias[cmd.id] && (
                              <code
                                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                  selectedIndex === idx
                                    ? 'bg-primary-foreground/20 text-primary-foreground'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {commandToAlias[cmd.id]}
                              </code>
                            )}
                            {cmd.target && cmd.target !== 'none' && (
                              <span
                                className={`ml-auto text-xs ${selectedIndex === idx ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                              >
                                → select {cmd.target}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* App commands */}
                    {(results as ReturnType<typeof commandRegistry.search>)
                      .appCommands.length > 0 && (
                      <div className="p-2 border-t border-border">
                        <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                          App Commands
                        </p>
                        {(
                          results as ReturnType<typeof commandRegistry.search>
                        ).appCommands.map((cmd, idx) => {
                          const globalIdx =
                            (
                              results as ReturnType<
                                typeof commandRegistry.search
                              >
                            ).genericCommands.length + idx
                          const availability = getCommandAvailability(cmd)
                          const isDisabled = !availability.canExecute
                          const isSelected = selectedIndex === globalIdx

                          return (
                            <button
                              key={cmd.id}
                              ref={isSelected ? selectedItemRef : null}
                              onClick={() =>
                                !isDisabled && executeAppCommand(cmd)
                              }
                              disabled={isDisabled}
                              className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md text-left ${
                                isDisabled
                                  ? 'opacity-50 cursor-not-allowed'
                                  : isSelected
                                    ? 'bg-primary text-primary-foreground'
                                    : 'hover:bg-muted'
                              }`}
                              title={
                                isDisabled ? availability.reason : undefined
                              }
                            >
                              <DynamicIcon
                                name={cmd.command.icon}
                                className={`h-4 w-4 ${
                                  isDisabled
                                    ? 'text-muted-foreground'
                                    : isSelected
                                      ? 'text-primary-foreground'
                                      : 'text-muted-foreground'
                                }`}
                              />
                              <span
                                className={
                                  isSelected && !isDisabled
                                    ? ''
                                    : 'text-muted-foreground'
                                }
                              >
                                {cmd.app.name}:
                              </span>
                              <span
                                className={
                                  isDisabled ? 'text-muted-foreground' : ''
                                }
                              >
                                {cmd.command.name}
                              </span>
                              {commandToAlias[cmd.id] && (
                                <code
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                                    isDisabled
                                      ? 'bg-muted/50 text-muted-foreground'
                                      : isSelected
                                        ? 'bg-primary-foreground/20 text-primary-foreground'
                                        : 'bg-muted text-muted-foreground'
                                  }`}
                                >
                                  {commandToAlias[cmd.id]}
                                </code>
                              )}
                              {/* Show disabled reason OR description */}
                              {isDisabled ? (
                                <span className="ml-auto flex items-center gap-1 text-xs text-warning">
                                  <WarningCircleIcon className="h-3 w-3" />
                                  {availability.reason}
                                </span>
                              ) : (
                                <span
                                  className={`ml-auto flex items-center gap-2 ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                                >
                                  {cmd.command.description && (
                                    <span className="text-xs truncate max-w-[120px]">
                                      {cmd.command.description}
                                    </span>
                                  )}
                                  {/* Tab indicator for actions */}
                                  {isSelected && (
                                    <span className="flex items-center gap-1 text-xs opacity-70">
                                      <CaretRightIcon className="h-3 w-3" />
                                      <span className="hidden sm:inline">
                                        Tab
                                      </span>
                                    </span>
                                  )}
                                </span>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {(results as ReturnType<typeof commandRegistry.search>)
                      .appCommands.length === 0 &&
                      (results as ReturnType<typeof commandRegistry.search>)
                        .genericCommands.length === 0 && (
                        <div className="p-8 text-center text-muted-foreground">
                          No commands found
                        </div>
                      )}
                  </>
                ) : step === 'actions' && actionPanelCommand ? (
                  // Action panel for selected command
                  <ActionPanel
                    command={actionPanelCommand}
                    onAction={handleActionPanelAction}
                    onBack={closeActions}
                  />
                ) : (
                  // Target selection step
                  <div className="p-2">
                    <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                      Select{' '}
                      {selectedCommand?.source === 'generic'
                        ? selectedCommand.command.target
                        : 'target'}
                    </p>
                    {(
                      results as ReturnType<
                        typeof commandRegistry.getAppsForTargetSelection
                      >
                    ).map((app, idx) => (
                      <button
                        key={app.id}
                        ref={selectedIndex === idx ? selectedItemRef : null}
                        onClick={() => executeGenericCommand(app.id)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md text-left ${
                          selectedIndex === idx
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <span>{app.name}</span>
                        <span
                          className={`ml-auto text-xs ${selectedIndex === idx ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                        >
                          {app.type}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Script Parameters Modal */}
      <ScriptParamsModal
        scriptName={pendingScriptExecution?.scriptPath ?? ''}
        params={scriptParams}
        open={scriptParamsModalOpen}
        onOpenChange={(open) => {
          setScriptParamsModalOpen(open)
          if (!open) {
            setPendingScriptExecution(null)
            setScriptParams([])
          }
        }}
        onRun={handleScriptParamsSubmit}
      />
    </>
  )
}
