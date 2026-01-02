import { useEffect, useRef, useMemo } from 'react'
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
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
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
  }, [toggle, close, isOpen, step, reset])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen, step])

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

    switch (selectedGenericCommand.id) {
      case 'generate-thumbnail':
        navigate({
          to: `/apps/${appId}`,
          search: { action: 'generate-thumbnail' },
        })
        break
      case 'open-folder': {
        // Note: For proper implementation, this should prompt for instance selection
        // For now, navigating to app page
        navigate({ to: `/apps/${appId}`, search: { action: 'open-folder' } })
        break
      }
      case 'open-terminal':
        // TODO: implement terminal opening
        break
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
                  ).genericCommands.map((cmd) => (
                    <button
                      key={cmd.id}
                      onClick={() => selectGenericCommand(cmd)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-muted text-left"
                    >
                      <DynamicIcon
                        name={cmd.icon}
                        className="h-4 w-4 text-muted-foreground"
                      />
                      <span>{cmd.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        → select {cmd.needsTarget}
                      </span>
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
                  ).appCommands.map((cmd) => (
                    <button
                      key={cmd.id}
                      onClick={() => executeAppCommand(cmd)}
                      className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-muted text-left"
                    >
                      <DynamicIcon
                        name={cmd.icon}
                        className="h-4 w-4 text-muted-foreground"
                      />
                      <span className="text-muted-foreground">
                        {cmd.appName}:
                      </span>
                      <span>{cmd.name}</span>
                      {cmd.description && (
                        <span className="ml-auto text-xs text-muted-foreground truncate max-w-[150px]">
                          {cmd.description}
                        </span>
                      )}
                    </button>
                  ))}
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
              ).map((app) => (
                <button
                  key={app.id}
                  onClick={() => executeGenericCommand(app.id)}
                  className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded-md hover:bg-muted text-left"
                >
                  <span>{app.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
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
