export type LogEntry = {
  timestamp: number
  type: 'info' | 'stdout' | 'stderr' | 'success' | 'error'
  message: string
}
