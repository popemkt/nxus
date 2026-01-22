/**
 * Workflow Executor
 *
 * Executes workflow commands by stepping through their defined steps.
 * Handles command, notify, and end step types.
 */

import { appRegistryService } from '@/services/apps/registry.service'
import type { Item, ItemCommand } from '@/types/item'
import type {
    CommandStep,
    NotifyStep,
    StepResult,
    WorkflowContext,
    WorkflowStep
} from '@/types/workflow'
import {
    createWorkflowContext,
    evaluateExpression,
    setStepResult,
} from './workflow-context'

// ============================================================================
// Types
// ============================================================================

export interface WorkflowExecutionResult {
  success: boolean
  stepsExecuted: string[]
  error?: string
  finalStatus?: 'success' | 'failure'
}

export interface WorkflowExecutionOptions {
  /** The item that owns this workflow command */
  item: Item
  /** The workflow command being executed */
  command: ItemCommand
  /** Optional parameters passed to the workflow */
  params?: Record<string, unknown>
  /** Callback for notify steps */
  onNotify?: (message: string, level: 'info' | 'success' | 'warning' | 'error') => void
  /** Callback when a command step starts */
  onStepStart?: (stepId: string, ref: string) => void
  /** Callback when a command step completes */
  onStepComplete?: (stepId: string, result: StepResult) => void
}

// ============================================================================
// Command Resolution
// ============================================================================

/**
 * Parse a command reference into item ID and command ID
 * 'bootstrap' -> { itemId: currentItem, commandId: 'bootstrap' }
 * 'item-id:command-id' -> { itemId: 'item-id', commandId: 'command-id' }
 */
function parseCommandRef(
  ref: string,
  currentItemId: string,
): { itemId: string; commandId: string } {
  const colonIndex = ref.indexOf(':')
  if (colonIndex === -1) {
    return { itemId: currentItemId, commandId: ref }
  }
  return {
    itemId: ref.substring(0, colonIndex),
    commandId: ref.substring(colonIndex + 1),
  }
}

/**
 * Resolve a command reference to the actual command
 */
function resolveCommand(
  ref: string,
  currentItem: Item,
): { item: Item; command: ItemCommand } | null {
  const { itemId, commandId } = parseCommandRef(ref, currentItem.id)

  // Get the target item
  let targetItem: Item
  if (itemId === currentItem.id) {
    targetItem = currentItem
  } else {
    const result = appRegistryService.getAppById(itemId)
    if (!result.success) {
      console.error(`[WorkflowExecutor] Item not found: ${itemId}`)
      return null
    }
    targetItem = result.data
  }

  // Find the command
  const command = targetItem.commands?.find((c) => c.id === commandId)
  if (!command) {
    console.error(
      `[WorkflowExecutor] Command not found: ${commandId} in item ${itemId}`,
    )
    return null
  }

  return { item: targetItem, command }
}

// ============================================================================
// Step Execution
// ============================================================================

/**
 * Execute a single command step
 */
async function executeCommandStep(
  step: CommandStep,
  context: WorkflowContext,
  currentItem: Item,
  options: WorkflowExecutionOptions,
): Promise<StepResult> {
  const startTime = Date.now()

  options.onStepStart?.(step.id, step.ref)

  const resolved = resolveCommand(step.ref, currentItem)
  if (!resolved) {
    return {
      exitCode: 1,
      stdout: '',
      stderr: `Command not found: ${step.ref}`,
      duration: Date.now() - startTime,
    }
  }

  // Execute the command using the command executor
  // This is a simplified execution - for now we just run shell commands
  const { commandExecutor } = await import('@/services/command-palette/executor')

  const result = await commandExecutor.executeStreaming({
    command: resolved.command.command,
    cwd: resolved.command.cwd,
    appId: resolved.item.id,
    appType: resolved.item.type,
  })

  const stepResult: StepResult = {
    exitCode: result.exitCode ?? (result.success ? 0 : 1),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    duration: Date.now() - startTime,
  }

  setStepResult(context, step.id, stepResult)
  options.onStepComplete?.(step.id, stepResult)

  return stepResult
}

/**
 * Execute a notify step
 */
async function executeNotifyStep(
  step: NotifyStep,
  _context: WorkflowContext,
  options: WorkflowExecutionOptions,
): Promise<void> {
  const level = step.level ?? 'info'
  options.onNotify?.(step.message, level)
}

// ============================================================================
// Workflow Execution
// ============================================================================

/**
 * Execute a workflow definition
 */
export async function executeWorkflow(
  options: WorkflowExecutionOptions,
): Promise<WorkflowExecutionResult> {
  const { item, command, params } = options
  const workflow = command.workflow

  if (!workflow || !workflow.steps || workflow.steps.length === 0) {
    return {
      success: false,
      stepsExecuted: [],
      error: 'No workflow steps defined',
    }
  }

  const context = createWorkflowContext(params)
  const stepsExecuted: string[] = []

  // Build step lookup map
  const stepMap = new Map<string, WorkflowStep>()
  for (const step of workflow.steps) {
    stepMap.set(step.id, step)
  }

  // Find the first step (either 'start' or the first in array)
  let currentStepId: string | undefined = stepMap.has('start')
    ? 'start'
    : workflow.steps[0]?.id

  // Execute steps in sequence
  while (currentStepId) {
    const step = stepMap.get(currentStepId)
    if (!step) {
      return {
        success: false,
        stepsExecuted,
        error: `Step not found: ${currentStepId}`,
      }
    }

    stepsExecuted.push(step.id)

    try {
      switch (step.type) {
        case 'command': {
          const result = await executeCommandStep(step, context, item, options)
          if (result.exitCode === 0) {
            currentStepId = step.onSuccess
          } else {
            currentStepId = step.onFailure
            if (!currentStepId) {
              // No failure handler, workflow fails
              return {
                success: false,
                stepsExecuted,
                error: `Step ${step.id} failed with exit code ${result.exitCode}`,
                finalStatus: 'failure',
              }
            }
          }
          break
        }

        case 'condition': {
          const value = evaluateExpression(context, step.expression)
          const valueStr = String(value)
          currentStepId =
            step.branches[valueStr] ?? step.branches['default']
          if (!currentStepId) {
            return {
              success: false,
              stepsExecuted,
              error: `No branch matched for condition ${step.id}: ${valueStr}`,
            }
          }
          break
        }

        case 'notify': {
          await executeNotifyStep(step, context, options)
          currentStepId = step.next
          break
        }

        case 'delay': {
          await new Promise((resolve) => setTimeout(resolve, step.duration))
          currentStepId = step.next
          break
        }

        case 'end': {
          return {
            success: step.status !== 'failure',
            stepsExecuted,
            finalStatus: step.status,
          }
        }

        case 'parallel': {
          // Execute all parallel steps concurrently
          const parallelPromises = step.steps.map(async (stepId) => {
            const parallelStep = stepMap.get(stepId)
            if (parallelStep && parallelStep.type === 'command') {
              return executeCommandStep(parallelStep, context, item, options)
            }
            return null
          })
          await Promise.all(parallelPromises)
          currentStepId = step.onComplete
          break
        }

        case 'prompt': {
          // Prompt steps are not supported in Phase 1
          console.warn(`[WorkflowExecutor] Prompt steps not yet supported`)
          currentStepId = step.next
          break
        }

        default: {
          return {
            success: false,
            stepsExecuted,
            error: `Unknown step type: ${(step as WorkflowStep).type}`,
          }
        }
      }
    } catch (error) {
      return {
        success: false,
        stepsExecuted,
        error: error instanceof Error ? error.message : String(error),
        finalStatus: 'failure',
      }
    }

    // If no next step is defined and we haven't hit an 'end', stop
    if (currentStepId === undefined) {
      break
    }
  }

  return {
    success: true,
    stepsExecuted,
    finalStatus: 'success',
  }
}
