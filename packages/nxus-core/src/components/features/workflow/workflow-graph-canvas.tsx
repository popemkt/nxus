import { useCallback } from 'react'
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  ReactFlowProvider,
  useReactFlow,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { WorkflowDefinition } from '@nxus/db'
import { cn } from '@nxus/ui'
import { useWorkflowGraph } from './hooks/use-workflow-graph'
import { workflowNodeTypes } from './components/workflow-step-node'
import {
  workflowEdgeTypes,
  WorkflowEdgeMarkerDefs,
} from './components/workflow-edge'
import { WorkflowLegend } from './components/workflow-legend'
import { STEP_TYPE_COLORS } from './types'
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

  // Handle initial fit view
  const onInit = useCallback(() => {
    // Small delay to ensure nodes are rendered
    setTimeout(() => {
      fitView({ padding: 0.2 })
    }, 50)
  }, [fitView])

  return (
    <div className={cn('w-full h-full', className)} style={{ minWidth: '100%', minHeight: '400px' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={workflowNodeTypes}
        edgeTypes={workflowEdgeTypes}
        onInit={onInit}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
        panOnDrag
        zoomOnScroll
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        className="bg-background"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--border)"
          className="opacity-50"
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
            className="!bg-popover/95 !border-border !rounded-lg !shadow-sm"
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
