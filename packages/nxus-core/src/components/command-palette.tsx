import { useEffect, useRef, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import * as PhosphorIcons from '@phosphor-icons/react'
import {
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  CommandIcon,
  QuestionIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useCommandPaletteStore } from '@/stores/command-palette.store'
import { useTerminalStore } from '@/stores/terminal.store'
import { useSettingsStore, matchesKeybinding } from '@/stores/settings.store'
import {
  commandRegistry,
  type PaletteCommand,
} from '@/services/command-palette/registry'
import { configureModalService } from '@/stores/configure-modal.store'
import { commandExecutor } from '@/services/command-palette/executor'
import { checkCommandAvailability } from '@/hooks/use-command'
import { appRegistryService } from '@/services/apps/registry.service'
import { useAllItemStatus } from '@/services/state/item-status-state'

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

export function CommandPalette() {
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)
  const selectedItemRef = useRef<HTMLButtonElement>(null)
  const [selectedIndex, setSelectedIndex] = useState(0)

  const {
    isOpen,
    step,
    query,
    selectedGenericCommand,
    close,
    toggle,
    setQuery,
    selectGenericCommand,
    reset,
  } = useCommandPaletteStore()
  const { createTab, addLog, setStatus } = useTerminalStore()

  // Subscribe to health changes so command availability updates reactively
  // This is used by getCommandAvailability to trigger re-renders when health changes
  const _itemStatuses = useAllItemStatus()

  // Global keyboard shortcut
  const commandPaletteBinding = useSettingsStore(
    (s) => s.keybindings.commandPalette,
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (matchesKeybinding(e, commandPaletteBinding)) {
        e.preventDefault()
        toggle()
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
  }, [toggle, close, isOpen, step, reset, commandPaletteBinding])

  // Search results
  const results = useMemo(() => {
    if (step === 'target') {
      // Show apps or instances for target selection, filtered by command
      const apps = commandRegistry.getAppsForTargetSelection(
        selectedGenericCommand ?? undefined,
      )
      const lowerQuery = query.toLowerCase()
      return apps.filter(
        (app) =>
          !lowerQuery ||
          app.name.toLowerCase().includes(lowerQuery) ||
          app.id.toLowerCase().includes(lowerQuery),
      )
    }
    return commandRegistry.search(query)
  }, [query, step, selectedGenericCommand])

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
      if ('appId' in item) {
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
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (items.length === 0) return

      const selectedItem = items[selectedIndex]
      if (step === 'target') {
        executeGenericCommand((selectedItem as any).id)
      } else {
        // Check if it's a generic command or app command
        if ('needsTarget' in selectedItem) {
          // Generic command
          const cmd = selectedItem as any
          if (cmd.needsTarget) {
            selectGenericCommand(cmd)
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
    const appResult = appRegistryService.getAppById(cmd.appId)
    if (!appResult.success) {
      return { canExecute: false, reason: 'App not found' }
    }

    // Use the command's declared requirements (not app dependencies)
    // This is the key change - commands only check their own requirements
    const appCommand = appResult.data.commands?.find(
      (c) => c.id === cmd.commandId,
    )

    return checkCommandAvailability(
      {
        ...cmd,
        mode: cmd.mode ?? 'execute',
        category: '',
        requires: appCommand?.requires,
      },
      {
        appId: cmd.appId,
        appType: appResult.data.type,
      },
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
      case 'execute': {
        // Get app info for post-execution effects
        const appResult = appRegistryService.getAppById(cmd.appId)
        const appType = appResult.success ? appResult.data.type : undefined

        // Use centralized executor
        await commandExecutor.execute({
          command: action.command,
          appId: cmd.appId,
          appType,
          tabName: `${cmd.appName}: ${cmd.name}`,
          terminalStore: { createTab, addLog, setStatus },
        })
        break
      }
    }
  }

  // Execute generic command
  const executeGenericCommand = async (appId: string) => {
    if (!selectedGenericCommand) return
    close()

    // Find the full command object from registry
    const fullCommand = commandRegistry
      .getGenericCommands()
      .find((c) => c.id === selectedGenericCommand.id)

    if (fullCommand) {
      fullCommand.execute(appId)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={close}
      />

      {/* Palette */}
      <div className="relative w-full max-w-xl bg-background border border-border rounded-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          {step === 'target' && (
            <button onClick={reset} className="p-1 hover:bg-muted rounded">
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
          )}
          <MagnifyingGlassIcon className="h-5 w-5 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              step === 'target'
                ? `Select target for "${selectedGenericCommand?.name}"...`
                : 'Search commands...'
            }
            className="flex-1 bg-transparent outline-none text-sm"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-xs text-muted-foreground bg-muted rounded">
            <CommandIcon className="h-3 w-3" /> Shift P
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
                        if (cmd.needsTarget) {
                          selectGenericCommand(cmd)
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
                      {cmd.needsTarget && (
                        <span
                          className={`ml-auto text-xs ${selectedIndex === idx ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                        >
                          → select {cmd.needsTarget}
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
                      (results as ReturnType<typeof commandRegistry.search>)
                        .genericCommands.length + idx
                    const availability = getCommandAvailability(cmd)
                    const isDisabled = !availability.canExecute
                    const isSelected = selectedIndex === globalIdx

                    return (
                      <button
                        key={cmd.id}
                        ref={isSelected ? selectedItemRef : null}
                        onClick={() => !isDisabled && executeAppCommand(cmd)}
                        disabled={isDisabled}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md text-left ${
                          isDisabled
                            ? 'opacity-50 cursor-not-allowed'
                            : isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'hover:bg-muted'
                        }`}
                        title={isDisabled ? availability.reason : undefined}
                      >
                        <DynamicIcon
                          name={cmd.icon}
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
                          {cmd.appName}:
                        </span>
                        <span
                          className={isDisabled ? 'text-muted-foreground' : ''}
                        >
                          {cmd.name}
                        </span>
                        {/* Show disabled reason OR description */}
                        {isDisabled ? (
                          <span className="ml-auto flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                            <WarningCircleIcon className="h-3 w-3" />
                            {availability.reason}
                          </span>
                        ) : cmd.description ? (
                          <span
                            className={`ml-auto text-xs truncate max-w-[150px] ${isSelected ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                          >
                            {cmd.description}
                          </span>
                        ) : null}
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
          ) : (
            // Target selection step
            <div className="p-2">
              <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase">
                Select {selectedGenericCommand?.needsTarget}
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
      </div>
    </div>
  )
}
