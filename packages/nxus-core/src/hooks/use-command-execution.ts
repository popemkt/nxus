import { useState, useCallback } from 'react'
import type { LogEntry } from '../services/shell/command.schema'
import { streamCommandServerFn } from '../services/shell/command-stream.server'

export interface UseCommandExecutionOptions {
  onComplete?: () => void
  onError?: (error: Error) => void
}

export function useCommandExecution(options?: UseCommandExecutionOptions) {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const addLog = useCallback((log: LogEntry) => {
    setLogs((prev) => [...prev, log])
  }, [])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const executeCommand = useCallback(
    async (
      command: string,
      args: string[] = [],
      execOptions?: { cwd?: string; env?: Record<string, string> },
    ) => {
      setIsRunning(true)
      clearLogs()

      try {
        // Add initial command log
        addLog({
          timestamp: Date.now(),
          type: 'info',
          message: `$ ${command} ${args.join(' ')}\n`,
        })

        const stream = await streamCommandServerFn({
          data: {
            command,
            args,
            cwd: execOptions?.cwd,
            env: execOptions?.env,
          },
        })

        let exitCode = 0

        for await (const chunk of stream) {
          switch (chunk.type) {
            case 'stdout':
              addLog({
                timestamp: Date.now(),
                type: 'stdout',
                message: chunk.data,
              })
              break

            case 'stderr':
              addLog({
                timestamp: Date.now(),
                type: 'stderr',
                message: chunk.data,
              })
              break

            case 'exit':
              exitCode = chunk.exitCode
              break

            case 'error':
              addLog({
                timestamp: Date.now(),
                type: 'error',
                message: `\n✗ ${chunk.message}\n`,
              })
              options?.onError?.(new Error(chunk.message))
              return
          }
        }

        if (exitCode === 0) {
          addLog({
            timestamp: Date.now(),
            type: 'success',
            message: `\n✓ Command completed successfully (exit code: ${exitCode})\n`,
          })
          options?.onComplete?.()
        } else {
          addLog({
            timestamp: Date.now(),
            type: 'error',
            message: `\n✗ Command failed with exit code: ${exitCode}\n`,
          })
          options?.onError?.(
            new Error(`Command failed with exit code: ${exitCode}`),
          )
        }
      } catch (error) {
        addLog({
          timestamp: Date.now(),
          type: 'error',
          message: `\n✗ ${error instanceof Error ? error.message : 'Unknown error'}\n`,
        })
        options?.onError?.(error as Error)
      } finally {
        setIsRunning(false)
      }
    },
    [addLog, clearLogs, options],
  )

  return {
    logs,
    isRunning,
    executeCommand,
    clearLogs,
  }
}
