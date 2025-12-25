import { z } from 'zod'

/**
 * Schema for executing a command with streaming output
 */
export const ExecuteCommandSchema = z.object({
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).optional().describe('Command arguments'),
  cwd: z.string().optional().describe('Working directory'),
  env: z.record(z.string()).optional().describe('Environment variables'),
})

export type ExecuteCommandInput = z.infer<typeof ExecuteCommandSchema>

/**
 * Schema for command execution result
 */
export const CommandResultSchema = z.object({
  exitCode: z.number(),
  signal: z.string().nullable().optional(),
  stdout: z.string(),
  stderr: z.string(),
})

export type CommandResult = z.infer<typeof CommandResultSchema>

/**
 * Log entry for streaming output
 */
export const LogEntrySchema = z.object({
  timestamp: z.number(),
  type: z.enum(['stdout', 'stderr', 'info', 'error', 'success']),
  message: z.string(),
})

export type LogEntry = z.infer<typeof LogEntrySchema>
