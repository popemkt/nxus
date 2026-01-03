import { useEffect, useRef } from 'react'
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
} from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { useTerminalStore, type TerminalTab } from '@/stores/terminal.store'
import { useState } from 'react'

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

export function TerminalPanel() {
  const {
    tabs,
    activeTabId,
    isOpen,
    isMinimized,
    setActiveTab,
    closeTab,
    minimize,
    maximize,
    close,
  } = useTerminalStore()

  const [copied, setCopied] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

  const activeTab = tabs.find((t) => t.id === activeTabId)

  // Auto-scroll to bottom
  useEffect(() => {
    if (shouldAutoScrollRef.current && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [activeTab?.logs])

  const handleScroll = () => {
    if (!logContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current
    shouldAutoScrollRef.current = scrollHeight - scrollTop - clientHeight < 50
  }

  const handleCopyLogs = async () => {
    if (!activeTab) return
    const logText = activeTab.logs.map((log) => log.message).join('')
    await navigator.clipboard.writeText(logText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border flex flex-col h-64">
      {/* Header */}
      <div className="flex items-center justify-between px-2 h-10 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <TerminalWindowIcon className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Terminal</span>
        </div>
        <div className="flex items-center gap-1">
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
                closeTab(tab.id)
              }
            }}
          >
            <StatusIcon status={tab.status} />
            <span className="truncate max-w-[120px]">{tab.label}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                closeTab(tab.id)
              }}
              className="opacity-0 group-hover:opacity-100 hover:text-destructive ml-1"
            >
              <XIcon className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* Log content */}
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
        {activeTab?.status === 'running' && (
          <div className="flex items-center gap-2 mt-2 text-primary">
            <span className="animate-pulse">▊</span>
          </div>
        )}
      </div>
    </div>
  )
}
