import { useEffect, useRef, useCallback } from 'react'
import {
  TerminalWindowIcon,
  XIcon,
  MinusIcon,
  CaretUpIcon,
  CopyIcon,
  CheckIcon,
  CircleNotchIcon,
  CheckCircleIcon,
  XCircleIcon,
  DotsSixVerticalIcon,
} from '@phosphor-icons/react'
import { Button } from '@nxus/ui'
import { useTerminalStore, type TerminalTab } from '@/stores/terminal.store'
import { useState } from 'react'
import { InteractiveTerminal } from './interactive-terminal'
import { closePtySessionServerFn } from '@/services/shell/pty.server'

function getLogColor(type: string) {
  switch (type) {
    case 'stdout':
      return 'text-foreground'
    case 'stderr':
      return 'text-orange-400'
    case 'error':
      return 'text-red-400'
    case 'success':
      return 'text-green-400'
    case 'info':
      return 'text-blue-400'
    default:
      return 'text-muted-foreground'
  }
}

function StatusIcon({ status }: { status: TerminalTab['status'] }) {
  switch (status) {
    case 'running':
      return <CircleNotchIcon className="h-3 w-3 animate-spin text-primary" />
    case 'success':
      return (
        <CheckCircleIcon className="h-3 w-3 text-green-500" weight="fill" />
      )
    case 'error':
      return <XCircleIcon className="h-3 w-3 text-red-500" weight="fill" />
    default:
      return null
  }
}

/**
 * Resize handle component for dragging to resize the terminal panel
 */
function ResizeHandle({ onResize }: { onResize: (deltaY: number) => void }) {
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      let lastY = e.clientY

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const currentY = moveEvent.clientY
        const deltaY = lastY - currentY // positive when moving up
        lastY = currentY
        if (deltaY !== 0) {
          onResize(deltaY)
        }
      }

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'ns-resize'
      document.body.style.userSelect = 'none'
    },
    [onResize],
  )

  return (
    <div
      className="absolute top-0 left-0 right-0 h-1 cursor-ns-resize hover:bg-primary/50 transition-colors group flex items-center justify-center"
      onMouseDown={handleMouseDown}
    >
      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
        <DotsSixVerticalIcon className="h-3 w-3 text-muted-foreground rotate-90" />
      </div>
    </div>
  )
}

export function TerminalPanel() {
  const {
    tabs,
    activeTabId,
    isOpen,
    isMinimized,
    panelHeight,
    setActiveTab,
    closeTab,
    minimize,
    maximize,
    close,
    setPanelHeight,
  } = useTerminalStore()

  const [copied, setCopied] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const currentHeightRef = useRef(panelHeight)

  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Keep ref in sync with state
  useEffect(() => {
    currentHeightRef.current = panelHeight
  }, [panelHeight])

  // Auto-scroll to bottom for readonly tabs
  useEffect(() => {
    if (
      activeTab?.mode === 'readonly' &&
      shouldAutoScrollRef.current &&
      logContainerRef.current
    ) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [activeTab?.logs, activeTab?.mode])

  const handleScroll = () => {
    if (!logContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50
  }

  const handleCopyLogs = async () => {
    if (!activeTab || activeTab.mode !== 'readonly') return
    const logText = activeTab.logs.map((log) => log.message).join('')
    await navigator.clipboard.writeText(logText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleResize = useCallback(
    (deltaY: number) => {
      // Calculate new height (deltaY is positive when dragging up)
      const newHeight = Math.max(
        100,
        Math.min(window.innerHeight * 0.8, currentHeightRef.current + deltaY),
      )
      currentHeightRef.current = newHeight
      setPanelHeight(newHeight)
    },
    [setPanelHeight],
  )

  const handleCloseTab = useCallback(
    async (tabId: string) => {
      const tab = tabs.find((t) => t.id === tabId)
      // Close PTY session if interactive
      if (tab?.mode === 'interactive' && tab.ptySessionId) {
        try {
          await closePtySessionServerFn({
            data: { sessionId: tab.ptySessionId },
          })
        } catch (err) {
          console.error('[TerminalPanel] Failed to close PTY session:', err)
        }
      }
      closeTab(tabId)
    },
    [tabs, closeTab],
  )

  if (!isOpen || tabs.length === 0) return null

  // Minimized view - just show tab bar
  if (isMinimized) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border">
        <div className="flex items-center px-2 h-10">
          <Button
            variant="ghost"
            size="sm"
            onClick={maximize}
            className="gap-2"
          >
            <TerminalWindowIcon className="h-4 w-4" />
            Terminal
            <CaretUpIcon className="h-3 w-3" />
          </Button>
          <div className="flex-1 flex items-center gap-1 ml-2 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id)
                  maximize()
                }}
                className={`flex items-center gap-1.5 px-2 py-1 text-xs rounded hover:bg-muted ${
                  tab.id === activeTabId ? 'bg-muted' : ''
                }`}
              >
                <StatusIcon status={tab.status} />
                <span className="truncate max-w-[100px]">{tab.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Expanded view
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border flex flex-col"
      style={{ height: panelHeight }}
    >
      {/* Resize handle */}
      <ResizeHandle onResize={handleResize} />

      {/* Header */}
      <div className="flex items-center justify-between px-2 h-10 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <TerminalWindowIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Terminal</span>
        </div>
        <div className="flex items-center gap-1">
          {activeTab?.mode === 'readonly' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopyLogs}
              disabled={!activeTab}
            >
              {copied ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={minimize}>
            <MinusIcon className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={close}>
            <XIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border bg-muted/30 shrink-0 overflow-x-auto">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`group flex items-center gap-1.5 px-2 py-1 text-xs rounded cursor-pointer ${
              tab.id === activeTabId
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            onClick={() => setActiveTab(tab.id)}
            onAuxClick={(e) => {
              // Middle mouse button (button 1)
              if (e.button === 1) {
                e.preventDefault()
                handleCloseTab(tab.id)
              }
            }}
          >
            <StatusIcon status={tab.status} />
            <span className="truncate max-w-[120px]">{tab.label}</span>
            {tab.mode === 'interactive' && (
              <span className="text-[10px] text-muted-foreground">●</span>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleCloseTab(tab.id)
              }}
              className="opacity-0 group-hover:opacity-100 hover:text-destructive ml-1"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Content - either readonly logs or interactive terminal */}
      {activeTab?.mode === 'interactive' && activeTab.ptySessionId ? (
        <div className="flex-1 overflow-hidden">
          <InteractiveTerminal
            tabId={activeTab.id}
            ptySessionId={activeTab.ptySessionId}
          />
        </div>
      ) : (
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className="flex-1 bg-black/90 font-mono text-sm overflow-y-auto p-3"
        >
          {activeTab ? (
            activeTab.logs.length === 0 ? (
              <p className="text-muted-foreground italic">
                Waiting for output...
              </p>
            ) : (
              activeTab.logs.map((log, index) => (
                <div
                  key={index}
                  className={`${getLogColor(log.type)} leading-relaxed whitespace-pre-wrap break-words`}
                >
                  {log.message}
                </div>
              ))
            )
          ) : (
            <p className="text-muted-foreground italic">No terminal selected</p>
          )}
          {activeTab?.status === 'running' && activeTab.mode === 'readonly' && (
            <div className="flex items-center gap-2 mt-2 text-primary">
              <span className="animate-pulse">▊</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
