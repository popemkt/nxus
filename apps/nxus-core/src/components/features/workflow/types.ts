import type { WorkflowStep } from '@nxus/db'

/**
 * Data for workflow graph nodes
 */
export interface WorkflowNodeData extends Record<string, unknown> {
  stepId: string
  type: WorkflowStep['type']
  label: string
  description?: string
  // Type-specific data
  commandRef?: string // For 'command' type
  expression?: string // For 'condition' type
  branches?: Record<string, string> // For 'condition' type
  parallelSteps?: string[] // For 'parallel' type
  duration?: number // For 'delay' type
  message?: string // For 'notify' and 'prompt' types
  level?: 'info' | 'success' | 'warning' | 'error' // For 'notify' type
  status?: 'success' | 'failure' // For 'end' type
  variable?: string // For 'prompt' type
  options?: string[] // For 'prompt' type
}

/**
 * Data for workflow graph edges
 */
export interface WorkflowEdgeData extends Record<string, unknown> {
  label?: string // 'onSuccess', 'onFailure', 'default', branch value
  edgeType: 'success' | 'failure' | 'next' | 'branch' | 'parallel'
}

/**
 * Step type colors for visual styling
 */
export const STEP_TYPE_COLORS = {
  command: '#3b82f6', // Blue
  condition: '#a855f7', // Purple
  parallel: '#06b6d4', // Cyan
  delay: '#eab308', // Yellow
  notify: '#22c55e', // Green
  prompt: '#f97316', // Orange
  end: '#10b981', // Green (will be red for failure)
} as const

/**
 * Edge type styles
 */
export const EDGE_TYPE_STYLES = {
  success: { stroke: '#22c55e', strokeDasharray: 'none' }, // Green solid
  failure: { stroke: '#ef4444', strokeDasharray: '5,5' }, // Red dashed
  next: { stroke: '#6b7280', strokeDasharray: 'none' }, // Gray solid
  branch: { stroke: '#6b7280', strokeDasharray: 'none' }, // Gray solid (with label)
  parallel: { stroke: '#06b6d4', strokeDasharray: '3,3' }, // Cyan dashed
} as const
