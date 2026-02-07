import { useEffect, useRef, useState } from 'react'
import {
  TerminalWindowIcon,
  XIcon,
  ArrowsOutIcon,
  ArrowsInIcon,
  CopyIcon,
  CheckIcon,
} from '@phosphor-icons/react'
import { Card, CardContent, CardHeader, CardTitle } from '@nxus/ui'
import { Button } from '@nxus/ui'
import { Badge } from '@nxus/ui'

export interface LogEntry {
  timestamp: number
  type: 'stdout' | 'stderr' | 'info' | 'error' | 'success'
  message: string
}

interface CommandLogViewerProps {
  title: string
  logs: LogEntry[]
  isRunning: boolean
  onClose?: () => void
  className?: string
}

export function CommandLogViewer({
  title,
  logs,
  isRunning,
  onClose,
  className = '',
}: CommandLogViewerProps) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (shouldAutoScrollRef.current && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  // Detect if user scrolled up (disable auto-scroll)
  const handleScroll = () => {
    if (!logContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = logContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50
    shouldAutoScrollRef.current = isAtBottom
  }

  const handleCopyLogs = async () => {
    const logText = logs.map((log) => log.message).join('\n')
    await navigator.clipboard.writeText(logText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const getLogColor = (type: LogEntry['type']) => {
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

  return (
    <Card
      className={`border-primary transition-all ${isExpanded ? 'fixed inset-4 z-50' : ''} ${className}`}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <TerminalWindowIcon className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">{title}</CardTitle>
          {isRunning && (
            <Badge variant="outline" className="animate-pulse">
              Running...
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopyLogs}
            disabled={logs.length === 0}
          >
            {copied ? (
              <CheckIcon className="h-4 w-4 text-green-500" />
            ) : (
              <CopyIcon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? (
              <ArrowsInIcon className="h-4 w-4" />
            ) : (
              <ArrowsOutIcon className="h-4 w-4" />
            )}
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <XIcon className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div
          ref={logContainerRef}
          onScroll={handleScroll}
          className={`bg-black/90 rounded-md p-4 font-mono text-sm overflow-y-auto ${
            isExpanded ? 'h-[calc(100vh-12rem)]' : 'h-64'
          }`}
        >
          {logs.length === 0 ? (
            <p className="text-muted-foreground italic">
              Waiting for output...
            </p>
          ) : (
            logs.map((log, index) => (
              <div
                key={index}
                className={`${getLogColor(log.type)} leading-relaxed whitespace-pre-wrap break-words`}
              >
                {log.message}
              </div>
            ))
          )}
          {isRunning && (
            <div className="flex items-center gap-2 mt-2 text-primary">
              <span className="animate-pulse">▊</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
