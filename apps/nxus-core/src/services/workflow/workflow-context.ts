import type { StepResult, WorkflowContext } from '@nxus/db'

/**
 * Create a new workflow context with default values
 */
export function createWorkflowContext(
  params: Record<string, unknown> = {},
): WorkflowContext {
  return {
    env: { ...process.env } as Record<string, string>,
    params,
    results: {},
    variables: {},
  }
}

/**
 * Store the result of a step execution
 */
export function setStepResult(
  context: WorkflowContext,
  stepId: string,
  result: StepResult,
): void {
  context.results[stepId] = result
}

/**
 * Get the result of a previously executed step
 */
export function getStepResult(
  context: WorkflowContext,
  stepId: string,
): StepResult | undefined {
  return context.results[stepId]
}

/**
 * Set a user variable in the context
 */
export function setVariable(
  context: WorkflowContext,
  name: string,
  value: unknown,
): void {
  context.variables[name] = value
}

/**
 * Evaluate a simple expression against the context
 * Supports: env.VAR, results.stepId.field, variables.name, params.name
 */
export function evaluateExpression(
  context: WorkflowContext,
  expression: string,
): unknown {
  const parts = expression.split('.')

  if (parts.length === 0) return undefined

  const root = parts[0]
  const path = parts.slice(1)

  let value: unknown
  switch (root) {
    case 'env':
      value = context.env
      break
    case 'results':
      value = context.results
      break
    case 'variables':
      value = context.variables
      break
    case 'params':
      value = context.params
      break
    default:
      return undefined
  }

  // Navigate the path
  for (const key of path) {
    if (value === null || value === undefined) return undefined
    if (typeof value === 'object') {
      value = (value as Record<string, unknown>)[key]
    } else {
      return undefined
    }
  }

  return value
}
