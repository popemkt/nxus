import { useCallback } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  
  ReactFlow,
  ReactFlowProvider,
  useReactFlow
} from '@xyflow/react'
import type {Node} from '@xyflow/react';
import '@xyflow/react/dist/style.css'

import { cn } from '@nxus/ui'
import { useWorkflowGraph } from './hooks/use-workflow-graph'
import { workflowNodeTypes } from './components/workflow-step-node'
import {
  WorkflowEdgeMarkerDefs,
  workflowEdgeTypes,
} from './components/workflow-edge'
import { WorkflowLegend } from './components/workflow-legend'
import { STEP_TYPE_COLORS } from './types'
import type { WorkflowDefinition } from '@nxus/db'
import type { WorkflowNodeData } from './types'

interface WorkflowGraphCanvasProps {
  workflow: WorkflowDefinition
  className?: string
  /** Layout direction: 'LR' (left-to-right) or 'TB' (top-to-bottom) */
  direction?: 'LR' | 'TB'
  /** Show the legend panel */
  showLegend?: boolean
  /** Show the minimap */
  showMinimap?: boolean
  /** Show the controls */
  showControls?: boolean
}

/**
 * Inner component with access to ReactFlow hooks
 */
function WorkflowGraphCanvasInner({
  workflow,
  className,
  direction = 'LR',
  showLegend = true,
  showMinimap = true,
  showControls = true,
}: WorkflowGraphCanvasProps) {
  const { fitView } = useReactFlow()

  // Convert workflow to nodes and edges with dagre layout
  const { nodes, edges } = useWorkflowGraph(workflow, { direction })

  // Minimap node color based on step type
  const minimapNodeColor = useCallback((node: Node) => {
    const data = node.data as WorkflowNodeData | undefined
    if (!data) return 'var(--muted-foreground)'

    // Special case for end nodes with failure status
    if (data.type === 'end' && data.status === 'failure') {
      return '#ef4444' // Red
    }

    return STEP_TYPE_COLORS[data.type] || 'var(--muted-foreground)'
  }, [])

  // Handle initial fit view with optimal zoom for readability
  const onInit = useCallback(() => {
    // Small delay to ensure nodes are rendered, then fit with minimal padding
    // to maximize graph size while keeping all nodes visible
    setTimeout(() => {
      fitView({ padding: 0.1, maxZoom: 1.5 })
    }, 50)
  }, [fitView])

  return (
    <div
      className={cn('w-full h-full', className)}
      style={{ minWidth: '100%', minHeight: '400px' }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={workflowNodeTypes}
        edgeTypes={workflowEdgeTypes}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.1, maxZoom: 1.5 }}
        minZoom={0.25}
        maxZoom={3}
        panOnDrag
        zoomOnScroll
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        className="bg-background [&_.react-flow__controls]:!bg-popover [&_.react-flow__controls]:!border-border [&_.react-flow__controls]:!shadow-md [&_.react-flow__controls-button]:!bg-popover [&_.react-flow__controls-button]:!border-border [&_.react-flow__controls-button]:!fill-foreground [&_.react-flow__controls-button:hover]:!bg-accent"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1}
          color="var(--border)"
          className="opacity-40"
        />

        {showMinimap && (
          <MiniMap
            nodeColor={minimapNodeColor}
            nodeStrokeWidth={3}
            zoomable
            pannable
            className="!bg-popover/90 !border-border rounded-lg shadow-lg"
          />
        )}

        {showControls && (
          <Controls
            showInteractive={false}
            position="top-left"
            className="!bg-popover !border-border !rounded-lg !shadow-md [&>button]:!bg-popover [&>button]:!border-border [&>button]:!fill-foreground [&>button:hover]:!bg-accent"
          />
        )}

        {showLegend && <WorkflowLegend />}

        {/* SVG marker definitions for edge arrows */}
        <WorkflowEdgeMarkerDefs />
      </ReactFlow>
    </div>
  )
}

/**
 * Workflow Graph Canvas component that visualizes a workflow definition
 * as an interactive graph using React Flow.
 *
 * Features:
 * - Automatic dagre layout (left-to-right or top-to-bottom)
 * - Visual distinction for different step types (command, condition, parallel, etc.)
 * - Edge styling for different transition types (success, failure, branch, etc.)
 * - Minimap for navigation
 * - Controls for zoom/pan
 * - Legend showing step types and edge styles
 *
 * @example
 * ```tsx
 * <WorkflowGraphCanvas
 *   workflow={command.workflow}
 *   className="h-[500px]"
 * />
 * ```
 */
export function WorkflowGraphCanvas(props: WorkflowGraphCanvasProps) {
  return (
    <ReactFlowProvider>
      <WorkflowGraphCanvasInner {...props} />
    </ReactFlowProvider>
  )
}
