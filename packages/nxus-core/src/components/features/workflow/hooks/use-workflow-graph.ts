import { useMemo } from 'react'
import * as dagre from 'dagre'
import { Position, type Node, type Edge } from '@xyflow/react'
import type { WorkflowDefinition, WorkflowStep } from '@nxus/db'
import type { WorkflowNodeData, WorkflowEdgeData } from '../types'

// Node dimensions
const NODE_WIDTH = 180
const NODE_HEIGHT = 60
const CONDITION_NODE_SIZE = 80

export type WorkflowNode = Node<WorkflowNodeData, 'workflow-step'>
export type WorkflowEdge = Edge<WorkflowEdgeData>

interface WorkflowGraphResult {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

/**
 * Converts a WorkflowStep to node data
 */
function stepToNodeData(step: WorkflowStep): WorkflowNodeData {
  const base: WorkflowNodeData = {
    stepId: step.id,
    type: step.type,
    label: step.id,
  }

  switch (step.type) {
    case 'command':
      return {
        ...base,
        commandRef: step.ref,
        description: `Run: ${step.ref}`,
      }
    case 'condition':
      return {
        ...base,
        expression: step.expression,
        branches: step.branches,
        description: step.expression,
      }
    case 'parallel':
      return {
        ...base,
        parallelSteps: step.steps,
        description: `Run ${step.steps.length} steps in parallel`,
      }
    case 'delay':
      return {
        ...base,
        duration: step.duration,
        description: `Wait ${step.duration}ms`,
      }
    case 'notify':
      return {
        ...base,
        message: step.message,
        level: step.level,
        description: step.message,
      }
    case 'prompt':
      return {
        ...base,
        message: step.message,
        variable: step.variable,
        options: step.options,
        description: step.message,
      }
    case 'end':
      return {
        ...base,
        status: step.status,
        description: step.status === 'failure' ? 'Failure' : 'Success',
      }
  }
}

/**
 * Converts a WorkflowDefinition into React Flow nodes and edges
 */
export function workflowToGraph(
  workflow: WorkflowDefinition,
): WorkflowGraphResult {
  const nodes: WorkflowNode[] = []
  const edges: WorkflowEdge[] = []

  // Create a map of step IDs for quick lookup
  const stepMap = new Map<string, WorkflowStep>()
  workflow.steps.forEach((step) => stepMap.set(step.id, step))

  // Create nodes for each step
  workflow.steps.forEach((step, index) => {
    nodes.push({
      id: step.id,
      type: 'workflow-step',
      position: { x: 0, y: index * 100 }, // Will be laid out by dagre
      data: stepToNodeData(step),
    })
  })

  // Create edges based on step transitions
  workflow.steps.forEach((step) => {
    switch (step.type) {
      case 'command': {
        // onSuccess edge
        if (step.onSuccess) {
          edges.push({
            id: `${step.id}-success-${step.onSuccess}`,
            source: step.id,
            target: step.onSuccess,
            type: 'workflow-edge',
            data: {
              label: 'success',
              edgeType: 'success',
            },
          })
        }
        // onFailure edge
        if (step.onFailure) {
          edges.push({
            id: `${step.id}-failure-${step.onFailure}`,
            source: step.id,
            target: step.onFailure,
            type: 'workflow-edge',
            data: {
              label: 'failure',
              edgeType: 'failure',
            },
          })
        }
        break
      }

      case 'condition': {
        // Create edges for each branch
        Object.entries(step.branches).forEach(([branchValue, targetStepId]) => {
          edges.push({
            id: `${step.id}-branch-${branchValue}-${targetStepId}`,
            source: step.id,
            target: targetStepId,
            type: 'workflow-edge',
            data: {
              label: branchValue,
              edgeType: 'branch',
            },
          })
        })
        break
      }

      case 'parallel': {
        // Create edges to each parallel step
        step.steps.forEach((parallelStepId) => {
          edges.push({
            id: `${step.id}-parallel-${parallelStepId}`,
            source: step.id,
            target: parallelStepId,
            type: 'workflow-edge',
            data: {
              edgeType: 'parallel',
            },
          })
        })
        // Edge to onComplete step
        if (step.onComplete) {
          edges.push({
            id: `${step.id}-complete-${step.onComplete}`,
            source: step.id,
            target: step.onComplete,
            type: 'workflow-edge',
            data: {
              label: 'complete',
              edgeType: 'next',
            },
          })
        }
        break
      }

      case 'delay':
      case 'notify':
      case 'prompt': {
        // 'next' edge
        if (step.next) {
          edges.push({
            id: `${step.id}-next-${step.next}`,
            source: step.id,
            target: step.next,
            type: 'workflow-edge',
            data: {
              edgeType: 'next',
            },
          })
        }
        break
      }

      // 'end' type has no outgoing edges
    }
  })

  return { nodes, edges }
}

/**
 * Applies dagre layout to the workflow graph
 */
export function applyDagreLayout(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  direction: 'LR' | 'TB' = 'LR',
): WorkflowNode[] {
  if (nodes.length === 0) {
    return nodes
  }

  const dagreGraph = new dagre.graphlib.Graph()
  dagreGraph.setDefaultEdgeLabel(() => ({}))
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: 50,
    ranksep: 80,
    marginx: 30,
    marginy: 30,
  })

  // Add nodes to dagre graph
  nodes.forEach((node) => {
    const isCondition = node.data.type === 'condition'
    dagreGraph.setNode(node.id, {
      width: isCondition ? CONDITION_NODE_SIZE : NODE_WIDTH,
      height: isCondition ? CONDITION_NODE_SIZE : NODE_HEIGHT,
    })
  })

  // Add edges to dagre graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target)
  })

  // Run dagre layout
  dagre.layout(dagreGraph)

  const isHorizontal = direction === 'LR'

  // Apply positions to nodes
  return nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id)
    const isCondition = node.data.type === 'condition'
    const width = isCondition ? CONDITION_NODE_SIZE : NODE_WIDTH
    const height = isCondition ? CONDITION_NODE_SIZE : NODE_HEIGHT

    return {
      ...node,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
      targetPosition: isHorizontal ? Position.Left : Position.Top,
      sourcePosition: isHorizontal ? Position.Right : Position.Bottom,
    }
  })
}

interface UseWorkflowGraphOptions {
  direction?: 'LR' | 'TB'
}

/**
 * React hook that converts a WorkflowDefinition into layouted React Flow nodes and edges
 */
export function useWorkflowGraph(
  workflow: WorkflowDefinition | undefined,
  options: UseWorkflowGraphOptions = {},
): WorkflowGraphResult {
  const { direction = 'LR' } = options

  return useMemo(() => {
    if (!workflow || !workflow.steps || workflow.steps.length === 0) {
      return { nodes: [], edges: [] }
    }

    const { nodes, edges } = workflowToGraph(workflow)
    const layoutedNodes = applyDagreLayout(nodes, edges, direction)

    return { nodes: layoutedNodes, edges }
  }, [workflow, direction])
}
