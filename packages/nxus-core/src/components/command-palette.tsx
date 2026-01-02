import { useEffect, useRef, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import * as PhosphorIcons from '@phosphor-icons/react'
import {
  MagnifyingGlassIcon,
  ArrowLeftIcon,
  CommandIcon,
  QuestionIcon,
} from '@phosphor-icons/react'
import { useCommandPaletteStore } from '@/stores/command-palette.store'
import { useTerminalStore } from '@/stores/terminal.store'
import { useSettingsStore, matchesKeybinding } from '@/stores/settings.store'
import {
  commandRegistry,
  type PaletteCommand,
} from '@/services/command-palette/registry'
import { executeCommandServerFn } from '@/services/shell/command.server'

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

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setSelectedIndex(0) // Auto-select first item
    }
  }, [isOpen, step])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Search results
  const results = useMemo(() => {
    if (step === 'target') {
      // Show apps or instances for target selection
      const apps = commandRegistry.getAppsForTargetSelection()
      const lowerQuery = query.toLowerCase()
      return apps.filter(
        (app) =>
          !lowerQuery ||
          app.name.toLowerCase().includes(lowerQuery) ||
          app.id.toLowerCase().includes(lowerQuery),
      )
    }
    return commandRegistry.search(query)
  }, [query, step])

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

  // Keyboard navigation handler
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev: number) => (prev + 1) % items.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(
        (prev: number) => (prev - 1 + items.length) % items.length,
      )
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

  // Execute app command
  const executeAppCommand = async (cmd: PaletteCommand) => {
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
      case 'execute': {
        // Run in terminal panel
        const tabId = createTab(`${cmd.appName}: ${cmd.name}`)
        setStatus(tabId, 'running')
        addLog(tabId, {
          timestamp: Date.now(),
          type: 'info',
          message: `$ ${action.command}\n`,
        })

        try {
          const parts = action.command.split(' ')
          const result = await executeCommandServerFn({
            data: { command: parts[0], args: parts.slice(1) },
          })

          if (result.success) {
            if (result.data.stdout) {
              addLog(tabId, {
                timestamp: Date.now(),
                type: 'stdout',
                message: result.data.stdout,
              })
            }
            if (result.data.stderr) {
              addLog(tabId, {
                timestamp: Date.now(),
                type: 'stderr',
                message: result.data.stderr,
              })
            }
            setStatus(tabId, result.data.exitCode === 0 ? 'success' : 'error')
            addLog(tabId, {
              timestamp: Date.now(),
              type: result.data.exitCode === 0 ? 'success' : 'error',
              message: `\n${result.data.exitCode === 0 ? '✓' : '✗'} Exit code: ${result.data.exitCode}\n`,
            })
          } else {
            setStatus(tabId, 'error')
            addLog(tabId, {
              timestamp: Date.now(),
              type: 'error',
              message: `\n✗ ${result.error}\n`,
            })
          }
        } catch (error) {
          setStatus(tabId, 'error')
          addLog(tabId, {
            timestamp: Date.now(),
            type: 'error',
            message: `\n✗ ${error instanceof Error ? error.message : 'Unknown error'}\n`,
          })
        }
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
                      onClick={() => {
                        if (cmd.needsTarget) {
                          selectGenericCommand(cmd)
                        } else {
                          close()
                          cmd.execute()
                        }
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md text-left transition-colors ${
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
                    return (
                      <button
                        key={cmd.id}
                        onClick={() => executeAppCommand(cmd)}
                        className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md text-left transition-colors ${
                          selectedIndex === globalIdx
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        }`}
                      >
                        <DynamicIcon
                          name={cmd.icon}
                          className={`h-4 w-4 ${selectedIndex === globalIdx ? 'text-primary-foreground' : 'text-muted-foreground'}`}
                        />
                        <span
                          className={
                            selectedIndex === globalIdx
                              ? ''
                              : 'text-muted-foreground'
                          }
                        >
                          {cmd.appName}:
                        </span>
                        <span>{cmd.name}</span>
                        {cmd.description && (
                          <span
                            className={`ml-auto text-xs truncate max-w-[150px] ${selectedIndex === globalIdx ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}
                          >
                            {cmd.description}
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
                  onClick={() => executeGenericCommand(app.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md text-left transition-colors ${
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
