/**
 * InteractiveTerminal Component
 *
 * A fully interactive terminal using xterm.js that connects to a PTY session
 * via TanStack server functions. Uses polling for output since TanStack
 * doesn't support true streaming for async generators.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { useTerminalStore } from '@/stores/terminal.store'
import {
  pollPtyOutputServerFn,
  writePtySessionServerFn,
  resizePtySessionServerFn,
  closePtySessionServerFn,
} from '@/services/shell/pty.server'

// Polling interval in milliseconds
const POLL_INTERVAL_MS = 100

interface InteractiveTerminalProps {
  tabId: string
  ptySessionId: string
}

export function InteractiveTerminal({
  tabId,
  ptySessionId,
}: InteractiveTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<any>(null)
  const fitAddonRef = useRef<any>(null)
  const pollingRef = useRef(false)
  const cursorRef = useRef(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { setStatus } = useTerminalStore()

  // Handle terminal resize
  const handleResize = useCallback(async () => {
    if (!fitAddonRef.current || !terminalRef.current) return

    fitAddonRef.current.fit()
    const { cols, rows } = terminalRef.current

    try {
      await resizePtySessionServerFn({
        data: { sessionId: ptySessionId, cols, rows, suppressOutput: true },
      })
    } catch (err) {
      console.error('[InteractiveTerminal] Resize failed:', err)
    }
  }, [ptySessionId])

  // Poll for PTY output
  const pollOutput = useCallback(
    async (terminal: any) => {
      if (!pollingRef.current) return

      try {
        const result = await pollPtyOutputServerFn({
          data: { sessionId: ptySessionId, cursor: cursorRef.current },
        })

        // Update cursor for next poll
        cursorRef.current = result.cursor

        // Process chunks
        for (const chunk of result.chunks) {
          switch (chunk.type) {
            case 'data':
              terminal.write(chunk.data)
              break

            case 'exit':
              setStatus(tabId, chunk.exitCode === 0 ? 'success' : 'error')
              terminal.write(
                `\r\n\x1b[${chunk.exitCode === 0 ? '32' : '31'}m[Process exited with code ${chunk.exitCode}]\x1b[0m\r\n`,
              )
              pollingRef.current = false
              return

            case 'error':
              setStatus(tabId, 'error')
              terminal.write(`\r\n\x1b[31m[Error: ${chunk.message}]\x1b[0m\r\n`)
              pollingRef.current = false
              return
          }
        }

        // Continue polling if session is alive
        if (result.isAlive && pollingRef.current) {
          setTimeout(() => pollOutput(terminal), POLL_INTERVAL_MS)
        } else if (!result.isAlive) {
          pollingRef.current = false
        }
      } catch (err) {
        if (pollingRef.current) {
          console.error('[InteractiveTerminal] Poll error:', err)
          // Retry after a delay on error
          setTimeout(() => pollOutput(terminal), POLL_INTERVAL_MS * 5)
        }
      }
    },
    [ptySessionId, tabId, setStatus],
  )

  // Initialize xterm.js
  useEffect(() => {
    let mounted = true

    const initTerminal = async () => {
      if (!containerRef.current) return

      try {
        // Dynamic import to avoid SSR issues
        const [{ Terminal }, { FitAddon }, { WebLinksAddon }] =
          await Promise.all([
            import('@xterm/xterm'),
            import('@xterm/addon-fit'),
            import('@xterm/addon-web-links'),
          ])

        // Import xterm CSS
        await import('@xterm/xterm/css/xterm.css')

        if (!mounted) return

        // Create terminal instance
        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily:
            'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
          theme: {
            background: '#1a1a1a',
            foreground: '#e0e0e0',
            cursor: '#e0e0e0',
            cursorAccent: '#1a1a1a',
            selectionBackground: '#3a3a3a',
            black: '#1a1a1a',
            red: '#ff6b6b',
            green: '#69db7c',
            yellow: '#ffd43b',
            blue: '#6ea8fe',
            magenta: '#e599f7',
            cyan: '#63e6be',
            white: '#e0e0e0',
            brightBlack: '#6c757d',
            brightRed: '#ff8787',
            brightGreen: '#8ce99a',
            brightYellow: '#ffe066',
            brightBlue: '#91b4fe',
            brightMagenta: '#eebefa',
            brightCyan: '#96f2d7',
            brightWhite: '#f8f9fa',
          },
          allowTransparency: true,
          scrollback: 5000,
        })

        const fitAddon = new FitAddon()
        const webLinksAddon = new WebLinksAddon()

        terminal.loadAddon(fitAddon)
        terminal.loadAddon(webLinksAddon)

        terminal.open(containerRef.current)
        fitAddon.fit()

        terminalRef.current = terminal
        fitAddonRef.current = fitAddon

        // Handle user input
        terminal.onData((data) => {
          writePtySessionServerFn({
            data: { sessionId: ptySessionId, data },
          }).catch((err) => {
            console.error('[InteractiveTerminal] Write failed:', err)
          })
        })

        // Send initial resize - don't suppress output for the first one
        // so we don't drop the initial prompt
        const { cols, rows } = terminal
        await resizePtySessionServerFn({
          data: { sessionId: ptySessionId, cols, rows, suppressOutput: false },
        })

        setIsLoading(false)

        // Start polling for output
        pollingRef.current = true
        cursorRef.current = 0
        pollOutput(terminal)
      } catch (err) {
        console.error('[InteractiveTerminal] Init failed:', err)
        setError(
          err instanceof Error ? err.message : 'Failed to initialize terminal',
        )
        setIsLoading(false)
      }
    }

    initTerminal()

    return () => {
      mounted = false
      pollingRef.current = false
      terminalRef.current?.dispose()
    }
  }, [ptySessionId, pollOutput])

  // Handle window resize
  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => {
      handleResize()
    })

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
    }
  }, [handleResize])

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 p-4">
        <p>Failed to initialize terminal: {error}</p>
      </div>
    )
  }

  return (
    <div
      className="relative w-full h-full"
      style={{ backgroundColor: '#1a1a1a' }}
    >
      {/* Always render container so ref is available during init */}
      <div ref={containerRef} className="w-full h-full" />
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#1a1a1a] text-muted-foreground">
          <p>Initializing terminal...</p>
        </div>
      )}
    </div>
  )
}

/**
 * Hook to close a PTY session when the component unmounts
 */
export function useClosePtySessionOnUnmount(ptySessionId: string | undefined) {
  useEffect(() => {
    return () => {
      if (ptySessionId) {
        closePtySessionServerFn({ data: { sessionId: ptySessionId } }).catch(
          (err) => {
            console.error('[PTY] Failed to close session:', err)
          },
        )
      }
    }
  }, [ptySessionId])
}
