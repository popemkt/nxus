import { z } from 'zod'

// ============================================================================
// Step Result - Output from command execution
// ============================================================================

/**
 * Result of executing a command step
 */
export const StepResultSchema = z.object({
  exitCode: z.number(),
  stdout: z.string(),
  stderr: z.string(),
  duration: z.number().describe('Execution duration in ms'),
})
export type StepResult = z.infer<typeof StepResultSchema>

// ============================================================================
// Workflow Context - Runtime state during execution
// ============================================================================

/**
 * Runtime context available during workflow execution
 */
export interface WorkflowContext {
  /** Environment variables from process.env */
  env: Record<string, string>
  /** Parameters passed to the workflow */
  params: Record<string, unknown>
  /** Results from executed steps, keyed by step ID */
  results: Record<string, StepResult>
  /** User-defined variables (from prompt steps) */
  variables: Record<string, unknown>
}

// ============================================================================
// Step Types - Different kinds of workflow steps
// ============================================================================

/**
 * Command step - Execute a command from this item or another item
 */
export const CommandStepSchema = z.object({
  id: z.string(),
  type: z.literal('command'),
  /** Command reference: 'local-command' or 'item-id:command-id' */
  ref: z.string(),
  params: z.record(z.string(), z.unknown()).optional(),
  onSuccess: z.string().optional(),
  onFailure: z.string().optional(),
  timeout: z.number().optional().describe('Timeout in milliseconds'),
})
export type CommandStep = z.infer<typeof CommandStepSchema>

/**
 * Condition step - Branch based on expression value
 */
export const ConditionStepSchema = z.object({
  id: z.string(),
  type: z.literal('condition'),
  /** Expression to evaluate: 'env.VAR', 'results.step.exitCode', 'variables.x' */
  expression: z.string(),
  /** Map of value -> next step ID, with optional 'default' key */
  branches: z.record(z.string(), z.string()),
})
export type ConditionStep = z.infer<typeof ConditionStepSchema>

/**
 * Parallel step - Run multiple steps concurrently
 */
export const ParallelStepSchema = z.object({
  id: z.string(),
  type: z.literal('parallel'),
  /** Step IDs to run in parallel */
  steps: z.array(z.string()),
  /** Wait strategy: 'all' (default), 'any', or 'none' */
  waitFor: z.enum(['all', 'any', 'none']).optional().default('all'),
  onComplete: z.string().optional(),
})
export type ParallelStep = z.infer<typeof ParallelStepSchema>

/**
 * Delay step - Wait for a duration
 */
export const DelayStepSchema = z.object({
  id: z.string(),
  type: z.literal('delay'),
  duration: z.number().describe('Duration in milliseconds'),
  next: z.string().optional(),
})
export type DelayStep = z.infer<typeof DelayStepSchema>

/**
 * Notify step - Show a notification to the user
 */
export const NotifyStepSchema = z.object({
  id: z.string(),
  type: z.literal('notify'),
  message: z.string(),
  level: z.enum(['info', 'success', 'warning', 'error']).optional().default('info'),
  next: z.string().optional(),
})
export type NotifyStep = z.infer<typeof NotifyStepSchema>

/**
 * Prompt step - Get user input (future)
 */
export const PromptStepSchema = z.object({
  id: z.string(),
  type: z.literal('prompt'),
  message: z.string(),
  options: z.array(z.string()).optional(),
  variable: z.string().describe('Variable name to store the result'),
  next: z.string().optional(),
})
export type PromptStep = z.infer<typeof PromptStepSchema>

/**
 * End step - Mark workflow completion
 */
export const EndStepSchema = z.object({
  id: z.string(),
  type: z.literal('end'),
  status: z.enum(['success', 'failure']).optional().default('success'),
})
export type EndStep = z.infer<typeof EndStepSchema>

// ============================================================================
// Unified Step Type
// ============================================================================

/**
 * Discriminated union of all step types
 */
export const WorkflowStepSchema = z.discriminatedUnion('type', [
  CommandStepSchema,
  ConditionStepSchema,
  ParallelStepSchema,
  DelayStepSchema,
  NotifyStepSchema,
  PromptStepSchema,
  EndStepSchema,
])
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>

// ============================================================================
// Workflow Definition
// ============================================================================

/**
 * Complete workflow definition stored on a command
 */
export const WorkflowDefinitionSchema = z.object({
  steps: z.array(WorkflowStepSchema),
})
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>
