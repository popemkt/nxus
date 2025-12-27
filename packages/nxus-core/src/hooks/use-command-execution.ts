import { useState, useCallback } from 'react'
import type { LogEntry } from '../services/shell/command.schema'
import { executeCommandServerFn } from '../services/shell/command.server'

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

        const result = await executeCommandServerFn({
          data: {
            command,
            args,
            cwd: execOptions?.cwd,
            env: execOptions?.env,
          },
        })

        if (result.success) {
          // Split output into lines and add as logs
          const stdoutLines = result.data.stdout.split('\n')
          for (const line of stdoutLines) {
            if (line.trim()) {
              addLog({
                timestamp: Date.now(),
                type: 'stdout',
                message: line + '\n',
              })
            }
          }

          const stderrLines = result.data.stderr.split('\n')
          for (const line of stderrLines) {
            if (line.trim()) {
              addLog({
                timestamp: Date.now(),
                type: 'stderr',
                message: line + '\n',
              })
            }
          }

          if (result.data.exitCode === 0) {
            addLog({
              timestamp: Date.now(),
              type: 'success',
              message: `\n✓ Command completed successfully (exit code: ${result.data.exitCode})\n`,
            })
            options?.onComplete?.()
          } else {
            addLog({
              timestamp: Date.now(),
              type: 'error',
              message: `\n✗ Command failed with exit code: ${result.data.exitCode}\n`,
            })
            options?.onError?.(
              new Error(
                `Command failed with exit code: ${result.data.exitCode}`,
              ),
            )
          }
        } else {
          addLog({
            timestamp: Date.now(),
            type: 'error',
            message: `\n✗ ${result.error}\n`,
          })
          options?.onError?.(new Error(result.error))
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
